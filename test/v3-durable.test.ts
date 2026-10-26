import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,rm,rename,appendFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Annotation,Command,END,START,StateGraph,interrupt} from '@langchain/langgraph';
import {SqliteSaver} from '@langchain/langgraph-checkpoint-sqlite';
import {createGraphV3,type RuntimeOptions} from '../src/v3/graph.ts';
import {BeforeEffectFailure,ModelFailure} from '../src/v3/failures.ts';
import {OperationsStore} from '../src/v3/operations.ts';
import {executeTool} from '../src/v2/tools.ts';
import {findTool,descriptorFingerprint,registerTool} from '../src/v2/registry.ts';
import {requestHash} from '../src/v2/policy.ts';
import {criterionHash} from '../src/v3/objective.ts';
import {DATA_DIR,WORKSPACE_DIR} from '../src/paths.ts';

const config={configurable:{thread_id:'crash'},recursionLimit:35};
async function fixture() {
  await mkdir(WORKSPACE_DIR,{recursive:true});
  const dir=await mkdtemp(join(tmpdir(),'runtime-durable-'));
  const file=`durable-${randomUUID()}.md`;
  const path=join(WORKSPACE_DIR,file);
  const checkpointPath=join(dir,'checkpoint.sqlite');
  const criterion={id:'objective-file' as const,kind:'workspace.file_content' as const,version:1 as const,fileName:file,expectedContent:'DURABLE'};
  const input={runId:'crash',objective:'durable test',modelId:'mock' as const,selectionReason:'test',scopeId:'poc-workspace',
    criterion,observations:[],toolCount:0,status:'queued',result:''};
  const decide:NonNullable<RuntimeOptions['decide']>=async i=>i.history.length ? {kind:'final',text:'Done'}
    : {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'DURABLE'}};
  return {dir,file,path,checkpointPath,input,decide,cleanup:async()=>{
    await rm(path,{force:true});await rm(dir,{recursive:true,force:true});}};
}
async function approve(runtime:Awaited<ReturnType<typeof createGraphV3>>) {
  const snap=await runtime.getState(config);
  return runtime.invoke(new Command({resume:{decision:'approve',runId:'crash',toolId:snap.values.pendingToolId,
    requestHash:snap.values.pendingHash,remember:'once'}}),config);
}
async function startWorker(dir:string,file:string,point:string) {
  const child=spawn(process.execPath,['--import','tsx','test/helpers/v3-crash-worker.ts',dir,file,point],
    {cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:{...process.env,AGENT_ALLOW_CLOUD:'0'}});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
  let output='';
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`Worker barrier timed out: ${stderr}`));},15000);
    child.stdout.on('data',chunk=>{output+=String(chunk);if(output.includes('READY')){clearTimeout(timeout);resolve();}});
    child.once('error',error=>{clearTimeout(timeout);reject(error);});
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Worker exited ${code}: ${stderr}`));});
  });
  return child;
}

for(const point of ['prepared','claimed','effect_returned','result_confirmed'])test(`process death at ${point} preserves effects and prevents concurrent mutation`,async()=>{
  const f=await fixture();
  let child:Awaited<ReturnType<typeof startWorker>>|undefined;
  let executions=0,models=0;
  try {
    child=await startWorker(f.dir,f.file,point);
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async i=>{models++;return f.decide(i);},
      execute:async(tool,args)=>{executions++;await appendFile(join(f.dir,'executions.log'),'execute\n');return executeTool(tool,args);}});
    const active=await runtime.getState(config);
    assert.equal(active.operations?.identityMatches,true);
    assert.ok(!['completed','failed'].includes(active.values.status));
    const competitor=spawnSync(process.execPath,['--import','tsx','test/helpers/v3-crash-worker.ts',f.dir,f.file,'compete'],
      {cwd:process.cwd(),encoding:'utf8',timeout:15000});
    assert.equal(competitor.status,2,competitor.stderr);
    assert.match(competitor.stdout,/Runtime busy/);
    await assert.rejects(()=>runtime.invoke({...f.input,runId:'other'},{configurable:{thread_id:'other'}}),/Runtime busy/);
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;child=undefined;
    await runtime.recover(config,'recovery-1');
    const recovered=await runtime.getState(config);
    if(point==='prepared') {
      assert.equal(recovered.values.status,'tool_proposed');
      assert.deepEqual(recovered.next,['authorization']);
      assert.equal(recovered.values.forceApproval,true);
      await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
      assert.equal(models,0);
      await approve(runtime);
      assert.equal((await runtime.getState(config)).values.status,'completed');
      assert.equal(executions,1);
    } else if(point==='result_confirmed') {
      assert.equal(recovered.values.status,'completed');
      assert.equal(recovered.values.observations.length,1);
      assert.equal(recovered.values.observations[0].invocationId,'crash:1');
      assert.equal(executions,0);
      assert.equal(models,1);
      await runtime.invoke(null,config);
      await assert.rejects(()=>runtime.recover(config,'recovery-2'),/terminal/);
    } else {
      assert.equal(recovered.values.status,'paused');
      assert.equal(recovered.values.invocationStatus,'uncertain');
      assert.equal(recovered.values.runtimeError?.retryable,false);
      assert.equal(recovered.values.observations.length,0);
      assert.equal(recovered.operations?.invocations[0].status,'uncertain');
      assert.equal(models,0);assert.equal(executions,0);
      await assert.rejects(()=>approve(runtime),/Unconfirmed/);
      await runtime.recover(config,'recovery-2');
      assert.equal((await runtime.getState(config)).values.status,'paused');
    }
    const log=await readFile(join(f.dir,'executions.log'),'utf8').catch(()=> '');
    assert.equal(log.split('\n').filter(Boolean).length,point==='claimed' ? 0 : 1);
    if(point!=='claimed')assert.equal(await readFile(f.path,'utf8'),'DURABLE');
  } finally {if(child){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await f.cleanup();}
});

test('model failure after confirmed tool recovers only inference and preserves observations',async()=>{
  const f=await fixture();let calls=0,executions=0;
  try {
    let runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async i=>{
      calls++;if(i.history.length)throw new ModelFailure('UNAVAILABLE',true,'never persist provider secret');return f.decide(i);},
      execute:async(t,a)=>{executions++;return executeTool(t,a);}});
    await runtime.invoke(f.input,config);await approve(runtime);
    let snap=await runtime.getState(config);
    assert.equal(snap.values.status,'paused');assert.equal(snap.values.observations.length,1);
    assert.equal(snap.values.runtimeError?.phase,'model');
    assert.ok(!JSON.stringify(snap.values.runtimeError).includes('provider secret'));
    runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async i=>{calls++;return f.decide(i);},
      execute:async()=>{throw new Error('Must not repeat tool');}});
    await runtime.recover(config,'model-recovery');
    snap=await runtime.getState(config);
    assert.equal(snap.values.status,'completed');assert.equal(snap.values.recoveryCount,1);
    assert.equal(snap.values.observations.length,1);assert.equal(executions,1);assert.equal(calls,3);
  } finally {await f.cleanup();}
});

test('model and verification share durable recovery budget and request IDs cannot be reused',async()=>{
  const f=await fixture();let models=0,checks=0;
  try {
    await writeFile(f.path,'DURABLE');
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>{
      models++;if(models===1)throw new ModelFailure('TIMEOUT',true);return {kind:'final',text:'Done'};},
      verify:async context=>{checks++;return {criterionId:'objective-file',criterionVersion:1,criterionHash:criterionHash(context),
        checkedAt:new Date().toISOString(),outcome:'inconclusive',reason:'read_unavailable',retryable:true};}});
    await runtime.invoke(f.input,config);
    const originalCheckpoint=(await runtime.getState(config)).config?.configurable?.checkpoint_id;
    await assert.rejects(()=>runtime.recover(config,'invalid request'),/Invalid recovery request ID/);
    assert.equal((await runtime.getState(config)).config?.configurable?.checkpoint_id,originalCheckpoint);
    await runtime.recover(config,'shared-1');
    assert.equal((await runtime.getState(config)).values.recoveryCount,1);
    await assert.rejects(()=>runtime.recover(config,'shared-1'),/already used|does not match/);
    assert.equal((await runtime.getState(config)).values.recoveryCount,1);
    await runtime.recover(config,'shared-2');
    const end=await runtime.getState(config);
    assert.equal(end.values.status,'failed');assert.equal(end.values.recoveryCount,2);
    assert.equal(models,2);assert.equal(checks,2);
    await assert.rejects(()=>runtime.recover(config,'shared-3'),/terminal/);
  } finally {await f.cleanup();}
});

test('lost or replaced invocation store blocks continuation without recreating it',async()=>{
  const f=await fixture();
  try {
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide});
    await runtime.invoke(f.input,config);
    const path=`${f.checkpointPath}.operations.sqlite`;
    await rename(path,`${path}.backup`);
    assert.equal((await runtime.getState(config)).operations?.identityMatches,false);
    await assert.rejects(()=>approve(runtime),/storage unavailable/);
    assert.equal(existsSync(path),false);
    const replacement=new OperationsStore(path);replacement.close();
    await assert.rejects(()=>approve(runtime),/storage unavailable/);
    await rm(path);await rename(`${path}.backup`,path);
    await approve(runtime);assert.equal((await runtime.getState(config)).values.status,'completed');
  } finally {await f.cleanup();}
});

for(const point of ['prepared','effect_returned'] as const)test(`SQLite write failure at ${point} never permits an unconfirmed repeat`,async()=>{
  const f=await fixture();let blocker:DatabaseSync|undefined;let executions=0;
  try {
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide,
      execute:async(t,a)=>{executions++;return executeTool(t,a);},hook:async at=>{
        if(at===point){blocker=new DatabaseSync(`${f.checkpointPath}.operations.sqlite`);blocker.exec('BEGIN IMMEDIATE');}
      }});
    await runtime.invoke(f.input,config);
    await assert.rejects(()=>approve(runtime),/storage unavailable/);
    assert.equal(executions,point==='prepared' ? 0 : 1);
    blocker!.exec('ROLLBACK');blocker!.close();blocker=undefined;
    const repair=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide,
      execute:async(t,a)=>{executions++;return executeTool(t,a);}});
    await repair.recover(config,'repair-1');
    const snap=await repair.getState(config);
    if(point==='prepared') {
      assert.equal(snap.values.status,'tool_proposed');await approve(repair);
      assert.equal((await repair.getState(config)).values.status,'completed');
    } else assert.equal(snap.values.invocationStatus,'uncertain');
    assert.equal(executions,1);
  } finally {if(blocker){blocker.exec('ROLLBACK');blocker.close();}await f.cleanup();}
});

test('a trusted before-effect failure is terminal; unknown Executor failure is uncertain',async()=>{
  for(const safe of [true,false]) {
    const f=await fixture();
    try {
      const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide,
        execute:async()=>{if(safe)throw new BeforeEffectFailure('private adapter detail');throw new Error('private adapter detail');}});
      await runtime.invoke(f.input,config);await approve(runtime);
      const snap=await runtime.getState(config);
      assert.equal(snap.values.status,safe ? 'failed' : 'paused');
      assert.equal(snap.values.invocationStatus,safe ? 'failed' : 'uncertain');
      assert.ok(!JSON.stringify(snap.values.runtimeError).includes('private adapter detail'));
      await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
    } finally {await f.cleanup();}
  }
});

test('a killed model attempt resumes only on an explicit command',async()=>{
  const f=await fixture();let child:Awaited<ReturnType<typeof startWorker>>|undefined;let calls=0;
  try {
    await writeFile(f.path,'DURABLE');
    child=await startWorker(f.dir,f.file,'hold-model');
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;child=undefined;
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>{calls++;return {kind:'final',text:'Done'};}});
    await assert.rejects(()=>runtime.invoke(null,config),/explicit recovery/);
    assert.equal(calls,0);
    await runtime.recover(config,'killed-model');
    const snap=await runtime.getState(config);
    assert.equal(snap.values.status,'completed');assert.equal(snap.values.recoveryCount,1);assert.equal(calls,1);
  } finally {if(child){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await f.cleanup();}
});

test('checkpoint write failure after confirmed result cannot repeat the Executor',async()=>{
  const f=await fixture();let executions=0,fail=false;
  const saver=SqliteSaver.fromConnString(f.checkpointPath);
  const put=saver.put.bind(saver);
  saver.put=async(...args)=>{if(fail){fail=false;throw new Error('injected checkpoint failure');}return put(...args);};
  try {
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,checkpointer:saver,decide:f.decide,
      execute:async(t,a)=>{executions++;return executeTool(t,a);},hook:async point=>{if(point==='result_confirmed')fail=true;}});
    await runtime.invoke(f.input,config);
    await assert.rejects(()=>approve(runtime));
    const repair=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide,
      execute:async()=>{throw new Error('must not execute again');}});
    await repair.recover(config,'restore-confirmed');
    const end=await repair.getState(config);
    assert.equal(end.values.status,'completed');assert.equal(end.values.observations.length,1);assert.equal(executions,1);
    assert.equal(end.operations?.invocations[0].status,'succeeded');
  } finally {await f.cleanup();}
});

test('failed recovery checkpoint preserves the consumed attempt and blocks redispatch of its request',async()=>{
  const f=await fixture();let calls=0,fail=true;
  const saver=SqliteSaver.fromConnString(f.checkpointPath),put=saver.put.bind(saver);
  saver.put=async(...args)=>{
    if(fail && args[1].channel_values.status==='recovering'){fail=false;throw new Error('injected recovery checkpoint failure');}
    return put(...args);
  };
  try {
    await writeFile(f.path,'DURABLE');
    const decide:NonNullable<RuntimeOptions['decide']>=async()=>{
      calls++;if(calls===1)throw new ModelFailure('TIMEOUT',true);return {kind:'final',text:'Done'};
    };
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,checkpointer:saver,decide});
    await runtime.invoke(f.input,config);
    await assert.rejects(()=>runtime.recover(config,'attempt-1'),/checkpoint failure/);
    assert.equal(calls,1,'sync durability prevents inference after failed checkpoint');
    const repair=await createGraphV3({checkpointPath:f.checkpointPath,decide});
    assert.equal((await repair.getState(config)).values.recoveryCount,1);
    await assert.rejects(()=>repair.recover(config,'attempt-1'),/already used/);
    await repair.recover(config,'attempt-2');
    const end=await repair.getState(config);
    assert.equal(end.values.status,'completed');assert.equal(end.values.recoveryCount,2);assert.equal(calls,2);
  } finally {await f.cleanup();}
});

test('interrupted continuation with two consumed recoveries becomes terminal without inference',async()=>{
  const f=await fixture();let calls=0;
  try {
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>{calls++;throw new ModelFailure('TIMEOUT',true);}});
    await runtime.invoke(f.input,config);
    const ledger=new OperationsStore(`${f.checkpointPath}.operations.sqlite`);
    ledger.seedCount('crash',2);ledger.close();
    await runtime.updateState(config,{status:'recovering',nextPhase:'model'},'execute');
    await runtime.recover(config,'attempt-3');
    const end=await runtime.getState(config);
    assert.equal(end.values.status,'failed');assert.equal(end.values.recoveryCount,2);
    assert.equal(end.values.runtimeError?.retryable,false);assert.equal(calls,1);
  } finally {await f.cleanup();}
});

test('invocation claim and recovery acceptance are durable and cannot be consumed twice',async()=>{
  const f=await fixture();
  const a=new OperationsStore(`${f.checkpointPath}.operations.sqlite`);
  const b=new OperationsStore(`${f.checkpointPath}.operations.sqlite`,a.id);
  const binding={runId:'crash',ordinal:1,toolId:'filesystem.write',descriptorHash:'descriptor',requestHash:'request',scopeId:'scope',criterionHash:'criterion'};
  try {
    a.prepare(binding);assert.equal(a.claim(binding),true);assert.equal(b.claim(binding),false);
    assert.throws(()=>b.bound({...binding,requestHash:'changed'}),/binding mismatch/);
    a.confirm(binding,'confirmed');assert.throws(()=>b.confirm(binding,'replacement'),/storage unavailable/);
    assert.equal(b.bound(binding)?.result,'confirmed');
    assert.equal(a.acceptRecovery('crash','same-request','model','checkpoint'),1);
    assert.equal(b.acceptRecovery('crash','same-request','model','rearmed-checkpoint'),1);
    b.dispatch('crash','same-request');
    assert.throws(()=>a.acceptRecovery('crash','same-request','model','checkpoint'),/already used/);
    assert.equal(a.count('crash'),1);
  } finally {a.close();b.close();await f.cleanup();}
});

test('missing checkpoints cannot reset a run already registered in the invocation store',async()=>{
  const f=await fixture();
  try {
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide});
    await runtime.invoke(f.input,config);
    const empty=await createGraphV3({checkpointPath:join(f.dir,'empty.sqlite'),operationsPath:`${f.checkpointPath}.operations.sqlite`,decide:f.decide});
    await assert.rejects(()=>empty.invoke(f.input,config),/checkpoint is missing/);
    await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
  } finally {await f.cleanup();}
});

for(const grantFailure of ['failed','pending'])test(`grant ${grantFailure} preserves a confirmed result without replay`,async()=>{
  const f=await fixture();
  const id=`text.durable.${randomUUID().replace(/[^a-z]/g,'a')}`;
  const descriptorPath=join(f.dir,'tool.json');
  let executions=0;
  try {
    await writeFile(descriptorPath,JSON.stringify({id,version:'1.0.0',description:'Durability test fixture',
      adapter:'builtin.text.transform',effects:['read'],operations:['uppercase']}));
    await registerTool(descriptorPath);
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>({kind:'tool',toolId:id,args:{input:'durable',operation:'uppercase'}}),
      execute:async(t,a)=>{executions++;return executeTool(t,a);},rememberGrant:()=>{throw new Error('private database error');},
      hook:async point=>{if(grantFailure==='pending' && point==='result_confirmed')throw new Error('crash before grant');}});
    await runtime.invoke(f.input,config);
    const snap=await runtime.getState(config);
    const approval=()=>runtime.invoke(new Command({resume:{decision:'approve',runId:'crash',toolId:id,requestHash:snap.values.pendingHash,remember:'workspace'}}),config);
    if(grantFailure==='pending') {
      await assert.rejects(approval,/crash before grant/);
      await runtime.recover(config,'restore-without-grant');
    } else await approval();
    const end=await runtime.getState(config);
    assert.equal(end.values.status,'paused');assert.equal(end.values.runtimeError?.phase,'persistence');
    assert.equal(end.values.runtimeError?.retryable,false);assert.equal(end.values.observations.length,1);
    assert.equal(end.operations?.invocations[0].status,'succeeded');assert.equal(end.operations?.invocations[0].grantStatus,grantFailure);
    await assert.rejects(()=>runtime.recover(config),/No safe recovery/);assert.equal(executions,1);
  } finally {await rm(join(DATA_DIR,'tool-registry',`${id}.json`),{force:true});await f.cleanup();}
});

async function legacyFixture(f:Awaited<ReturnType<typeof fixture>>,version:number|undefined=1) {
  const tool=await findTool('filesystem.write');
  const args={fileName:f.file,content:'DURABLE'};
  const Legacy=Annotation.Root({runId:Annotation<string>(),objective:Annotation<string>(),modelId:Annotation<'mock'>(),
    selectionReason:Annotation<string>(),scopeId:Annotation<string>(),observations:Annotation<unknown[]>(),toolCount:Annotation<number>(),
    status:Annotation<string>(),result:Annotation<string>(),criterion:Annotation<typeof f.input.criterion>(),criterionHash:Annotation<string>(),
    stateVersion:Annotation<number>(),recoveryCount:Annotation<number>(),pendingToolId:Annotation<string>(),pendingArgs:Annotation<typeof args>(),
    descriptorHash:Annotation<string>(),pendingHash:Annotation<string>(),authorized:Annotation<boolean>()});
  const graph=new StateGraph(Legacy)
    .addNode('model',async()=>({status:'tool_proposed',toolCount:1,pendingToolId:tool.id,pendingArgs:args,
      descriptorHash:descriptorFingerprint(tool),pendingHash:requestHash(tool,args),authorized:false}))
    .addNode('authorization',async()=>{interrupt({type:'approval_required'});return {status:'authorized',authorized:true};})
    .addNode('execute',async()=>({status:'completed'}))
    .addEdge(START,'model').addEdge('model','authorization').addEdge('authorization','execute').addEdge('execute',END)
    .compile({checkpointer:SqliteSaver.fromConnString(f.checkpointPath)});
  await graph.invoke({...f.input,stateVersion:version,criterionHash:criterionHash(f.input),recoveryCount:1},config);
  return graph;
}

test('explicit migration preserves history, criterion and recovery budget and requires fresh consent',async()=>{
  const f=await fixture();
  try {
    const legacy=await legacyFixture(f);
    const original=await legacy.getState(config);
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide});
    await assert.rejects(()=>approve(runtime),/migration required/);
    await runtime.migrate(config);
    let snap=await runtime.getState(config);
    assert.equal(snap.values.stateVersion,2);assert.equal(snap.values.recoveryCount,1);
    assert.equal(snap.values.forceApproval,true);assert.deepEqual(snap.next,['authorization']);
    assert.equal(snap.values.criterionHash,original.values.criterionHash);
    const migratedId=snap.config?.configurable?.checkpoint_id;
    await runtime.migrate(config);
    assert.equal((await runtime.getState(config)).config?.configurable?.checkpoint_id,migratedId,'migration is idempotent');
    const historical=await legacy.getState(original.config!);
    assert.equal(historical.values.stateVersion,1);
    await assert.rejects(()=>runtime.invoke(null,original.config!),/latest checkpoint/);
    await approve(runtime);
    snap=await runtime.getState(config);
    assert.equal(snap.values.status,'completed');assert.equal(snap.values.recoveryCount,1);
  } finally {await f.cleanup();}
});

test('legacy authorization without an execution marker cannot be presumed safe',async()=>{
  const f=await fixture();
  try {
    const legacy=await legacyFixture(f);
    await legacy.updateState(config,{status:'authorized',authorized:true},'authorization');
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide});
    await assert.rejects(()=>runtime.migrate(config),/Ambiguous/);
    await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
  } finally {await f.cleanup();}
});

test('v0 migration requires explicit criteria and unknown versions remain blocked',async()=>{
  for(const version of [undefined,99]) {
    const f=await fixture();
    try {
      const legacy=await legacyFixture(f,version);
      // v0 has no accepted objective criterion; the operator must supply one.
      if(version===undefined)await legacy.updateState(config,{stateVersion:undefined as never,criterion:undefined as never,criterionHash:undefined as never},'model');
      if(version===undefined)await legacy.invoke(null,config);
      const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:f.decide});
      if(version===undefined) {
        await assert.rejects(()=>runtime.migrate(config),/criterion is required/);
        await runtime.migrate(config,f.input.criterion);
        assert.equal((await runtime.getState(config)).values.stateVersion,2);
      } else await assert.rejects(()=>runtime.migrate(config),/not eligible/);
      await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
    } finally {await f.cleanup();}
  }
});


test('migration of a suspended v1 verifier preserves its criterion and consumed recovery budget',async()=>{
  const f=await fixture();let modelCalls=0;
  try {
    await writeFile(f.path,'DURABLE');
    const Legacy=Annotation.Root({runId:Annotation<string>(),objective:Annotation<string>(),modelId:Annotation<'mock'>(),
      selectionReason:Annotation<string>(),scopeId:Annotation<string>(),observations:Annotation<unknown[]>(),toolCount:Annotation<number>(),
      status:Annotation<string>(),result:Annotation<string>(),criterion:Annotation<typeof f.input.criterion>(),criterionHash:Annotation<string>(),
      stateVersion:Annotation<number>(),recoveryCount:Annotation<number>(),pendingToolId:Annotation<string>(),authorized:Annotation<boolean>(),
      verification:Annotation<{retryable:boolean}>()});
    const legacy=new StateGraph(Legacy)
      .addNode('check_objective',async()=>({status:'paused',verification:{retryable:true},pendingToolId:'',authorized:false}))
      .addNode('verification_recovery',async()=>{interrupt({type:'verification_retry'});return {};})
      .addEdge(START,'check_objective').addEdge('check_objective','verification_recovery').addEdge('verification_recovery',END)
      .compile({checkpointer:SqliteSaver.fromConnString(f.checkpointPath)});
    await legacy.invoke({...f.input,stateVersion:1,criterionHash:criterionHash(f.input),recoveryCount:1},config);
    const runtime=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>{modelCalls++;throw new Error('must not infer');}});
    await runtime.migrate(config);
    const migrated=await runtime.getState(config);
    assert.equal(migrated.values.stateVersion,2);assert.equal(migrated.values.recoveryCount,1);
    assert.deepEqual(migrated.next,['verification_recovery']);
    await runtime.recover(config,'verification-after-migration');
    const end=await runtime.getState(config);
    assert.equal(end.values.status,'completed');assert.equal(end.values.recoveryCount,2);assert.equal(modelCalls,0);
  } finally {await f.cleanup();}
});
