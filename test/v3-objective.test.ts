import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {Command} from '@langchain/langgraph';
import {createGraphV3} from '../src/v3/graph.ts';
import {assertObjective, criterionHash, validateCriterion, verifyObjective, type ObjectiveCriterion} from '../src/v3/objective.ts';
import {WORKSPACE_DIR} from '../src/paths.ts';

const criterion = (fileName:string,expectedContent='VERIFIED'):ObjectiveCriterion =>
  ({id:'objective-file',kind:'workspace.file_content',version:1,fileName,expectedContent});
const input = (fileName:string) => ({runId:'objective',objective:'create verified file',modelId:'mock' as const,
  selectionReason:'test',scopeId:'poc-workspace',observations:[],toolCount:0,status:'queued',result:'',criterion:criterion(fileName)});
const config = {configurable:{thread_id:'objective'},recursionLimit:35};
async function fixture() {
  await mkdir(WORKSPACE_DIR,{recursive:true});
  const dir=await mkdtemp(join(tmpdir(),'objective-check-'));
  const file=`objective-${randomUUID()}.md`;
  return {dir,file,path:join(WORKSPACE_DIR,file),checkpointPath:join(dir,'checkpoint.sqlite'),
    cleanup:async()=>{await rm(join(WORKSPACE_DIR,file),{recursive:true,force:true});await rm(dir,{recursive:true,force:true});}};
}

test('criteria are explicit, bounded and bound to run, scope and objective',()=>{
  const c=criterion('objective.md');
  assert.deepEqual(validateCriterion(c),c);
  for(const invalid of [undefined,[],{...c,version:2},{...c,fileName:'../escape.md'},
    {...c,expectedContent:'é'.repeat(8193)},{...c,extra:'untrusted'}]) assert.throws(()=>validateCriterion(invalid));
  const context={runId:'one',objective:'task',scopeId:'poc-workspace',criterion:c};
  assert.throws(()=>assertObjective({...context,stateVersion:0,criterionHash:criterionHash(context)}),/migration required/);
  for(const changed of [{...context,runId:'two'},{...context,scopeId:'other'},
    {...context,objective:'other'},{...context,criterion:{...c,expectedContent:'different'}}]) {
    assert.notEqual(criterionHash(context),criterionHash(changed));
  }
});

test('verifier checks actual bounded bytes, policy and symlinks without writing',async()=>{
  const f=await fixture();
  const context=input(f.file);
  try {
    assert.equal((await verifyObjective(context)).reason,'file_missing');
    await writeFile(f.path,'VERIFIED',{flag:'wx'});
    const passed=await verifyObjective(context);
    assert.equal(passed.outcome,'passed');
    assert.equal(passed.actualHash,createHash('sha256').update('VERIFIED').digest('hex'));
    assert.equal(passed.bytes,8);
    assert.ok(passed.descriptorHash);
    assert.equal('expectedContent' in passed,false);
    assert.equal(await readFile(f.path,'utf8'),'VERIFIED');
    assert.equal((await verifyObjective({...context,scopeId:'other'})).reason,'policy_denied');
    await writeFile(f.path,'wrong');
    assert.equal((await verifyObjective(context)).reason,'content_differs');
    await writeFile(f.path,'x'.repeat(16386));
    const over=await verifyObjective(context);
    assert.equal(over.outcome,'failed');
    assert.equal(over.actualHash,undefined,'do not claim a hash of a complete oversized file');
    await rm(f.path);
    await writeFile(join(f.dir,'outside'),'VERIFIED');
    await symlink(join(f.dir,'outside'),f.path);
    const unsafe=await verifyObjective(context);
    assert.equal(unsafe.outcome,'inconclusive');
    assert.equal(unsafe.reason,'unsafe_resource');
    assert.equal(unsafe.retryable,false);
    assert.equal(await readFile(join(f.dir,'outside'),'utf8'),'VERIFIED');
    await rm(f.path);
    await mkdir(f.path);
    assert.equal((await verifyObjective(context)).reason,'not_regular_file');
  } finally {await f.cleanup();}
});

test('intake refuses missing criteria before inference; final text cannot fake completion',async()=>{
  const f=await fixture();
  let calls=0;
  const options={checkpointPath:f.checkpointPath,decide:async()=>{calls++;return {kind:'final' as const,text:'Done, I wrote it'};}};
  try {
    const graph=await createGraphV3(options);
    const {criterion:unused,...missing}=input(f.file);
    await assert.rejects(()=>graph.invoke(missing,config),/criterion is required/);
    assert.equal(calls,0);
    await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
    const other={configurable:{thread_id:'final'}};
    await graph.invoke({...input(f.file),runId:'final'},other);
    const snap=await graph.getState(other);
    assert.equal(snap.values.status,'failed');
    assert.equal(snap.values.verification.reason,'file_missing');
    assert.deepEqual(snap.values.observations,[]);
    assert.deepEqual(snap.next,[]);
    assert.equal(calls,1);
  } finally {await f.cleanup();}
});

test('wrong content fails, unsafe evidence pauses and policy denial is explicit',async()=>{
  const f=await fixture();
  try {
    const graph=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>({kind:'final',text:'Done'})});
    await writeFile(f.path,'wrong');
    await graph.invoke(input(f.file),config);
    assert.equal((await graph.getState(config)).values.status,'failed');
    await rm(f.path);
    await writeFile(join(f.dir,'outside'),'VERIFIED');
    await symlink(join(f.dir,'outside'),f.path);
    const unsafe={configurable:{thread_id:'unsafe'}};
    await graph.invoke({...input(f.file),runId:'unsafe'},unsafe);
    const paused=await graph.getState(unsafe);
    assert.equal(paused.values.status,'paused');
    assert.equal(paused.values.verification.retryable,false);
    assert.deepEqual(paused.next,[]);
    const denied={configurable:{thread_id:'denied'}};
    await graph.invoke({...input(f.file),runId:'denied',scopeId:'other'},denied);
    assert.equal((await graph.getState(denied)).values.status,'denied');
  } finally {await f.cleanup();}
});

test('verification evidence persists after approved write and graph recreation',async()=>{
  const f=await fixture();
  const options={checkpointPath:f.checkpointPath,decide:async(i:{history:unknown[]})=>i.history.length
    ? {kind:'final' as const,text:'Done'}
    : {kind:'tool' as const,toolId:'filesystem.write',args:{fileName:f.file,content:'VERIFIED'}}};
  try {
    let graph=await createGraphV3(options);
    await graph.invoke(input(f.file),config);
    const pending=await graph.getState(config);
    assert.equal(pending.values.verification,undefined);
    await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
    await graph.invoke(new Command({resume:{decision:'approve',runId:'objective',toolId:'filesystem.write',
      requestHash:pending.values.pendingHash,remember:'once'}}),config);
    graph=await createGraphV3(options);
    const end=await graph.getState(config);
    assert.equal(end.values.status,'completed');
    assert.equal(end.values.stateVersion,2);
    assert.equal(end.values.verification.outcome,'passed');
    assert.equal(end.values.verification.criterionHash,end.values.criterionHash);
    assert.ok(end.values.verification.checkedAt);
    assert.equal(end.values.observations.length,1);
    await graph.invoke(null,config);
    assert.equal((await graph.getState(config)).values.observations.length,1);
  } finally {await f.cleanup();}
});

test('changing fixed criteria during approval is rejected before writing',async()=>{
  const f=await fixture();
  try {
    const graph=await createGraphV3({checkpointPath:f.checkpointPath,decide:async()=>
      ({kind:'tool',toolId:'filesystem.write',args:{fileName:f.file,content:'VERIFIED'}})});
    await graph.invoke(input(f.file),config);
    const pending=await graph.getState(config);
    await graph.updateState(config,{criterion:criterion(f.file,'changed')});
    await assert.rejects(()=>graph.invoke(new Command({resume:{decision:'approve',runId:'objective',
      toolId:'filesystem.write',requestHash:pending.values.pendingHash,remember:'once'}}),config),/criterion changed/);
    await assert.rejects(()=>readFile(f.path),{code:'ENOENT'});
  } finally {await f.cleanup();}
});

for (const recover of [true,false]) test(`verification recovery ${recover ? 'succeeds' : 'exhausts budget'} without model/tool replay`,async()=>{
  const f=await fixture();
  let modelCalls=0,checks=0;
  const options={checkpointPath:f.checkpointPath,
    decide:async(i:{history:unknown[]})=>{modelCalls++;return i.history.length
      ? {kind:'final' as const,text:'Done'}
      : {kind:'tool' as const,toolId:'filesystem.write',args:{fileName:f.file,content:'VERIFIED'}};},
    verify:async(context:Parameters<typeof verifyObjective>[0])=>{
      checks++;
      if(recover && checks>1)return verifyObjective(context);
      return {criterionId:'objective-file',criterionVersion:1 as const,criterionHash:criterionHash(context),
        checkedAt:new Date().toISOString(),outcome:'inconclusive' as const,reason:'read_unavailable' as const,retryable:true};
    }};
  try {
    let graph=await createGraphV3(options);
    await graph.invoke(input(f.file),config);
    const pending=await graph.getState(config);
    await graph.invoke(new Command({resume:{decision:'approve',runId:'objective',toolId:'filesystem.write',
      requestHash:pending.values.pendingHash,remember:'once'}}),config);
    let snap=await graph.getState(config);
    assert.equal(snap.values.status,'paused');
    assert.deepEqual(snap.next,['verification_recovery']);
    assert.equal(checks,1,'no automatic retry');
    assert.equal(await readFile(f.path,'utf8'),'VERIFIED');
    await assert.rejects(()=>graph.invoke(new Command({resume:{action:'retry_verification',runId:'wrong',
      criterionHash:snap.values.criterionHash}}),config),/does not match/);
    assert.equal((await graph.getState(config)).values.recoveryCount,0);
    assert.equal(checks,1);
    for(let attempt=1;attempt <= (recover ? 1 : 2);attempt++) {
      graph=await createGraphV3(options);
      snap=await graph.getState(config);
      await graph.invoke(new Command({resume:{action:'retry_verification',runId:'objective',
        criterionHash:snap.values.criterionHash}}),config);
    }
    snap=await (await createGraphV3(options)).getState(config);
    assert.equal(snap.values.status,recover ? 'completed' : 'failed');
    assert.equal(snap.values.recoveryCount,recover ? 1 : 2);
    assert.equal(modelCalls,2);
    assert.equal(snap.values.toolCount,1);
    assert.equal(snap.values.observations.length,1);
    assert.equal(checks,recover ? 2 : 3);
    assert.deepEqual(snap.next,[]);
    await graph.invoke(null,config);
    assert.equal(modelCalls,2);
    assert.equal(checks,recover ? 2 : 3);
  } finally {await f.cleanup();}
});
