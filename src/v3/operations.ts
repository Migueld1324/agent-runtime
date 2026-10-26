import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InfrastructureFailure, RuntimeBusy } from './failures.ts';

export interface InvocationBinding {
  runId:string; ordinal:number; toolId:string; descriptorHash:string;
  requestHash:string; scopeId:string; criterionHash:string;
}
export type InvocationStatus = 'prepared' | 'authorized' | 'executing' | 'succeeded' | 'failed' | 'uncertain';
export interface Invocation extends InvocationBinding {
  id:string; status:InvocationStatus; result?:string; grantStatus:'not_requested'|'pending'|'succeeded'|'failed';
}
export const invocationId = (runId:string,ordinal:number):string => `${runId}:${ordinal}`;
const bindingText = (b:InvocationBinding):string => JSON.stringify({runId:b.runId,ordinal:b.ordinal,
  toolId:b.toolId,descriptorHash:b.descriptorHash,requestHash:b.requestHash,scopeId:b.scopeId,criterionHash:b.criterionHash});

export async function withRuntimeLock<T>(path:string,action:()=>Promise<T>):Promise<T> {
  mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  let acquired=false;
  try {
    db.exec('PRAGMA busy_timeout=0');
    try { db.exec('BEGIN IMMEDIATE'); acquired=true; }
    catch (error) {
      if ((error as {errcode?:number}).errcode === 5 || (error as {errcode?:number}).errcode === 6) throw new RuntimeBusy();
      throw new InfrastructureFailure();
    }
    return await action();
  } finally {
    try {if(acquired) db.exec('ROLLBACK');} finally {db.close();}
  }
}

export class OperationsStore {
  private db:DatabaseSync;
  readonly id:string;
  constructor(path:string,expectedId?:string) {
    const existed=existsSync(path);
    if (!existed && expectedId) throw new InfrastructureFailure();
    mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA busy_timeout=0; PRAGMA synchronous=FULL');
      if (!existed) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.exec(`CREATE TABLE metadata (id TEXT NOT NULL, version INTEGER NOT NULL);
            CREATE TABLE runs (run_id TEXT PRIMARY KEY, criterion_hash TEXT NOT NULL, model_id TEXT NOT NULL);
            CREATE TABLE invocations (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
              binding TEXT NOT NULL, status TEXT NOT NULL, result TEXT, grant_status TEXT NOT NULL DEFAULT 'not_requested',
              UNIQUE(run_id,ordinal));
            CREATE TABLE recoveries (run_id TEXT NOT NULL, request_id TEXT NOT NULL, target TEXT NOT NULL,
              count INTEGER NOT NULL, checkpoint_id TEXT NOT NULL, dispatched INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY(run_id,request_id), UNIQUE(run_id,count));`);
          this.db.prepare('INSERT INTO metadata VALUES (?,1)').run(randomUUID());
          this.db.exec('COMMIT');
        } catch(error) {this.db.exec('ROLLBACK');throw error;}
      }
      const metadata=this.db.prepare('SELECT id,version FROM metadata').get() as {id:string;version:number}|undefined;
      if (!metadata || metadata.version !== 1 || (expectedId && expectedId !== metadata.id)) throw new InfrastructureFailure();
      this.id=metadata.id;
    } catch {
      this.db.close(); throw new InfrastructureFailure();
    }
  }
  private write<T>(action:()=>T):T {
    try {return action();} catch {throw new InfrastructureFailure();}
  }
  get(id:string):Invocation|undefined {
    const row=this.db.prepare('SELECT * FROM invocations WHERE id=?').get(id) as
      {id:string;binding:string;status:InvocationStatus;result:string|null;grant_status:Invocation['grantStatus']}|undefined;
    if(row && (row.status==='succeeded' && typeof row.result!=='string'))throw new InfrastructureFailure();
    return row ? {...JSON.parse(row.binding) as InvocationBinding,id:row.id,status:row.status,
      result:row.result ?? undefined,grantStatus:row.grant_status} : undefined;
  }
  run(runId:string):{criterion_hash:string;model_id:string}|undefined {
    return this.db.prepare('SELECT criterion_hash,model_id FROM runs WHERE run_id=?').get(runId) as
      {criterion_hash:string;model_id:string}|undefined;
  }
  registerRun(runId:string,criterionHash:string,modelId:string):void {
    const old=this.run(runId);
    if(old) {
      if(old.criterion_hash!==criterionHash || old.model_id!==modelId)throw new Error('Run identity or provider changed');
      return;
    }
    this.write(()=>this.db.prepare('INSERT INTO runs VALUES (?,?,?)').run(runId,criterionHash,modelId));
  }
  assertRun(runId:string,criterionHash:string,modelId:string):void {
    const old=this.run(runId);
    if(!old || old.criterion_hash!==criterionHash || old.model_id!==modelId)throw new InfrastructureFailure();
  }
  bound(binding:InvocationBinding):Invocation|undefined {
    const entry=this.get(invocationId(binding.runId,binding.ordinal));
    if (entry && bindingText(entry) !== bindingText(binding)) throw new Error('Invocation binding mismatch; continuation refused');
    return entry;
  }
  prepare(binding:InvocationBinding):Invocation {
    const old=this.bound(binding);
    if(old)return old;
    this.write(()=>this.db.prepare("INSERT INTO invocations(id,run_id,ordinal,binding,status) VALUES (?,?,?,?,'prepared')")
      .run(invocationId(binding.runId,binding.ordinal),binding.runId,binding.ordinal,bindingText(binding)));
    return this.bound(binding)!;
  }
  claim(binding:InvocationBinding,remember=false):boolean {
    const entry=this.bound(binding);
    if (!entry || !['prepared','authorized'].includes(entry.status)) return false;
    return this.write(()=>{
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.prepare("UPDATE invocations SET status='authorized' WHERE id=? AND status='prepared'").run(entry.id);
        const changed=this.db.prepare("UPDATE invocations SET status='executing',grant_status=? WHERE id=? AND status='authorized'").run(remember ? 'pending' : 'not_requested',entry.id);
        this.db.exec('COMMIT');
        return changed.changes === 1;
      } catch(error) {this.db.exec('ROLLBACK');throw error;}
    });
  }
  confirm(binding:InvocationBinding,result:string):void {
    if (Buffer.byteLength(result,'utf8') > 65_536) throw new InfrastructureFailure();
    const entry=this.bound(binding);
    if (!entry || entry.status !== 'executing') throw new InfrastructureFailure();
    this.write(()=>{
      if(this.db.prepare("UPDATE invocations SET status='succeeded',result=? WHERE id=? AND status='executing'")
        .run(result,entry.id).changes !== 1) throw new InfrastructureFailure();
    });
  }
  uncertain(binding:InvocationBinding):void {
    const entry=this.bound(binding);
    if (!entry) throw new InfrastructureFailure();
    if(entry.status==='uncertain')return;
    if(entry.status!=='executing')throw new InfrastructureFailure();
    this.write(()=>this.db.prepare("UPDATE invocations SET status='uncertain' WHERE id=? AND status='executing'").run(entry.id));
  }
  failBeforeEffect(binding:InvocationBinding):void {
    const entry=this.bound(binding);
    if(entry?.status!=='executing')throw new InfrastructureFailure();
    this.write(()=>this.db.prepare("UPDATE invocations SET status='failed' WHERE id=? AND status='executing'").run(entry.id));
  }
  markGrant(binding:InvocationBinding,status:'succeeded'|'failed'):void {
    this.bound(binding);
    this.write(()=>this.db.prepare("UPDATE invocations SET grant_status=? WHERE id=? AND status='succeeded'")
      .run(status,invocationId(binding.runId,binding.ordinal)));
  }
  count(runId:string):number {
    return (this.db.prepare('SELECT COALESCE(MAX(count),0) AS n FROM recoveries WHERE run_id=?').get(runId) as {n:number}).n;
  }
  recovery(runId:string,requestId:string):{target:string;dispatched:number}|undefined {
    return this.db.prepare('SELECT target,dispatched FROM recoveries WHERE run_id=? AND request_id=?')
      .get(runId,requestId) as {target:string;dispatched:number}|undefined;
  }
  entries(runId:string):Invocation[] {
    return (this.db.prepare('SELECT id FROM invocations WHERE run_id=? ORDER BY ordinal').all(runId) as {id:string}[])
      .map(row=>this.get(row.id)!);
  }
  seedCount(runId:string,count:number):void {
    if(!Number.isInteger(count) || count<0 || count>2)throw new Error('Invalid legacy recovery budget');
    const current=this.count(runId);
    if(current>count)throw new Error('Legacy recovery budget conflicts with durable store');
    for(let n=current+1;n<=count;n++)this.write(()=>this.db.prepare(
      'INSERT INTO recoveries(run_id,request_id,target,count,checkpoint_id,dispatched) VALUES (?,?,?,?,?,1)')
      .run(runId,`migration-${n}`,'legacy',n,'legacy'));
  }
  acceptRecovery(runId:string,requestId:string,target:string,checkpointId:string):number {
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(requestId))throw new Error('Invalid recovery request ID');
    const old=this.db.prepare('SELECT * FROM recoveries WHERE run_id=? AND request_id=?').get(runId,requestId) as
      {target:string;checkpoint_id:string;dispatched:number;count:number}|undefined;
    if(old) {
      if(old.target!==target || old.dispatched) throw new Error('Recovery request already used or does not match checkpoint');
      return old.count;
    }
    const count=this.count(runId)+1;
    if(count>2)throw new Error('Recovery budget exhausted');
    this.write(()=>this.db.prepare('INSERT INTO recoveries(run_id,request_id,target,count,checkpoint_id) VALUES (?,?,?,?,?)')
      .run(runId,requestId,target,count,checkpointId));
    return count;
  }
  dispatch(runId:string,requestId:string):void {
    this.write(()=>{
      if(this.db.prepare('UPDATE recoveries SET dispatched=1 WHERE run_id=? AND request_id=? AND dispatched=0')
        .run(runId,requestId).changes!==1)throw new InfrastructureFailure();
    });
  }
  close():void {this.db.close();}
}

export function inspectOperations(path:string,id:string,runId:string,criterionHash?:string,modelId?:string):{identityMatches:boolean;recoveryCount:number;invocations:Invocation[]} {
  if(!existsSync(path))return {identityMatches:false,recoveryCount:0,invocations:[]};
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    const metadata=db.prepare('SELECT id,version FROM metadata').get() as {id:string;version:number}|undefined;
    if(metadata?.id!==id || metadata.version!==1)return {identityMatches:false,recoveryCount:0,invocations:[]};
    const run=db.prepare('SELECT criterion_hash,model_id FROM runs WHERE run_id=?').get(runId) as {criterion_hash:string;model_id:string}|undefined;
    if(!run || (criterionHash && run.criterion_hash!==criterionHash) || (modelId && run.model_id!==modelId))return {identityMatches:false,recoveryCount:0,invocations:[]};
    const count=db.prepare('SELECT COALESCE(MAX(count),0) AS n FROM recoveries WHERE run_id=?').get(runId) as {n:number};
    const rows=db.prepare('SELECT * FROM invocations WHERE run_id=? ORDER BY ordinal').all(runId) as
      {id:string;binding:string;status:InvocationStatus;result:string|null;grant_status:Invocation['grantStatus']}[];
    return {identityMatches:true,recoveryCount:count.n,invocations:rows.map(row=>
      ({...JSON.parse(row.binding) as InvocationBinding,id:row.id,status:row.status,result:row.result ?? undefined,grantStatus:row.grant_status}))};
  } finally {db.close();}
}
