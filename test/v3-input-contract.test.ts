import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Command} from '@langchain/langgraph';
import {createGraphV3,type RuntimeOptions} from '../src/v3/graph.ts';
import {findTool,registerTool,listTools} from '../src/v2/registry.ts';
import {GrantStore} from '../src/v2/policy.ts';
import {DATA_DIR,WORKSPACE_DIR} from '../src/paths.ts';

if(!process.env.ADR087_TEST_CHILD) {
 test('isolated v2 gateway integration',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gateway-integration-'));
  try {
   for(const name of ['src','test','examples'])await cp(name,join(root,name),{recursive:true});
   await cp('package.json',join(root,'package.json'));await symlink(resolve('node_modules'),join(root,'node_modules'));
   const env={...process.env,ADR087_TEST_CHILD:'1'};delete (env as NodeJS.ProcessEnv).NODE_TEST_CONTEXT;
   const r=spawnSync(process.execPath,['--experimental-strip-types','--test','test/v3-input-contract.test.ts'],{cwd:root,encoding:'utf8',timeout:90000,env});
   assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
  }finally{await rm(root,{recursive:true,force:true});}
 });
} else {
test('v2 gateway rejects before approval/ledger/Executor and preserves pending approvals durably',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'input-contract-'));
 const source=join(dir,'tool.json');
 const id='text.contract'+randomUUID().replace(/[^a-f]/g,'');
 const m=JSON.parse(await readFile('examples/text-uppercase-v2.tool.json','utf8'));m.id=id;
 await writeFile(source,JSON.stringify(m));await registerTool(source);
 let executions=0;
 const config=(id:string)=>({configurable:{thread_id:id}});
 const input=(id:string)=>({runId:id,objective:'contract',modelId:'mock' as const,selectionReason:'test',scopeId:'poc-workspace',criterion:{id:'objective-file' as const,kind:'workspace.file_content' as const,version:1 as const,fileName:'contract.md',expectedContent:'OK'},observations:[],toolCount:0,status:'queued',result:''});
 try {
  for(const [index,args] of [null,[],{}, {input:2,operation:'uppercase'},{input:'x',operation:'uppercase',extra:'x'},{input:'x',operation:'lowercase'}].entries()) {
   const run='invalid'+index;
   const runtime=await createGraphV3({checkpointPath:join(dir,run+'.sqlite'),decide:async()=>({kind:'tool',toolId:id,args:args as any}),execute:async()=>{executions++;return 'BAD';}});
   await runtime.invoke(input(run),config(run));const snap=await runtime.getState(config(run));
   assert.equal(snap.values.status,'failed');assert.equal(snap.values.runtimeError?.code,'INVALID_ARGUMENT');assert.deepEqual(snap.next,[]);assert.deepEqual(snap.operations?.invocations,[]);
  }
  assert.equal(executions,0);
  const grants=new GrantStore();try{assert.ok(!grants.hasGrant(await findTool(id),'poc-workspace'));}finally{grants.close();}
  const checkpointPath=join(dir,'pending.sqlite');
  const decide:NonNullable<RuntimeOptions['decide']>=async()=>({kind:'tool',toolId:id,args:{input:'x',operation:'uppercase'}});
  const runtime=await createGraphV3({checkpointPath,decide});await runtime.invoke(input('pending'),config('pending'));
  const before=await runtime.getState(config('pending'));
  const reopened=await createGraphV3({checkpointPath,decide});
  await assert.rejects(()=>reopened.invoke(new Command({resume:{decision:'approve',runId:'wrong',toolId:id,requestHash:before.values.pendingHash,remember:'once'}}),config('pending')));
  assert.equal((await reopened.getState(config('pending'))).values.pendingHash,before.values.pendingHash);
  m.inputSchema.properties.input.maxLength=12;await writeFile(join(DATA_DIR,'tool-registry',id+'.json'),JSON.stringify(m));
  await assert.rejects(()=>reopened.invoke(new Command({resume:{decision:'approve',runId:'pending',toolId:id,requestHash:before.values.pendingHash,remember:'once'}}),config('pending')));
  assert.deepEqual((await reopened.getState(config('pending'))).operations?.invocations,[]);
  const recoveryPath=join(dir,'recover.sqlite');let effects=0;
  const recoveryOptions:RuntimeOptions={checkpointPath:recoveryPath,decide:async i=>i.history.length ? {kind:'final',text:'done'} : {kind:'tool',toolId:id,args:{input:'x',operation:'uppercase'}},execute:async()=>{effects++;return 'X';},hook:async point=>{if(point==='result_confirmed')throw new Error('simulated crash after confirmation');}};
  const recovering=await createGraphV3(recoveryOptions);await recovering.invoke(input('recover'),config('recover'));
  const pending=await recovering.getState(config('recover'));
  await assert.rejects(()=>recovering.invoke(new Command({resume:{decision:'approve',runId:'recover',toolId:id,requestHash:pending.values.pendingHash,remember:'once'}}),config('recover')));
  const restored=await createGraphV3({...recoveryOptions,hook:undefined});await restored.recover(config('recover'),'repair');
  const result=await restored.getState(config('recover'));assert.equal(effects,1);assert.equal(result.values.observations.length,1);assert.equal(result.operations?.invocations[0].status,'succeeded');

 } finally {await rm(join(DATA_DIR,'tool-registry',id+'.json'),{force:true});await rm(dir,{recursive:true,force:true});}
});

test('v2 manifests and grants survive processes; corrupt/oversized registry fails closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'contract-registry-'));const source=join(dir,'tool.json');
 const m=JSON.parse(await readFile('examples/text-uppercase-v2.tool.json','utf8'));m.id='text.process'+randomUUID().replace(/[^a-f]/g,'');
 await writeFile(source,JSON.stringify(m));const tool=await registerTool(source);
 const cli=(...args:string[])=>{const r=spawnSync(process.execPath,['--import','tsx','src/v2/cli.ts',...args],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout;};
 const run='contract-'+randomUUID();
 try {
  assert.match(cli('start',run,'--tool',tool.id,'--input','😀 hola','--operation','uppercase'),/WAITING_APPROVAL/);
  assert.match(cli('approve',run,'--remember','workspace'),/COMPLETED/);
  assert.match(cli('start',run+'b','--tool',tool.id,'--input','otra','--operation','uppercase'),/COMPLETED/);
  const grants=new GrantStore();try{assert.ok(grants.hasGrant(await findTool(tool.id),'poc-workspace'));grants.revokeGrant(tool,'poc-workspace');}finally{grants.close();}
  assert.match(cli('start',run+'c','--tool',tool.id,'--input','otra','--operation','uppercase'),/WAITING_APPROVAL/);
  await assert.rejects(()=>registerTool(source),{code:'EEXIST'});
  await writeFile(join(DATA_DIR,'tool-registry',tool.id+'.json'),' '.repeat(8193));await assert.rejects(()=>listTools());
  await writeFile(join(DATA_DIR,'tool-registry',tool.id+'.json'),'{');await assert.rejects(()=>listTools());
 } finally {await rm(join(DATA_DIR,'tool-registry',tool.id+'.json'),{force:true});await rm(dir,{recursive:true,force:true});}
});

}
