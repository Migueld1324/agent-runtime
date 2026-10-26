import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Command} from '@langchain/langgraph';
import {createGraphV3} from '../src/v3/graph.ts';
import {findTool, registerTool} from '../src/v2/registry.ts';
import {parseModelProposal} from '../src/v3/siwc-protocol.ts';
import {WORKSPACE_DIR} from '../src/paths.ts';

test('five proposals persist across graph recreation; no sixth inference or effect', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'poc-budget-'));
  const file=`closure-budget-${Date.now()}.md`;
  await mkdir(WORKSPACE_DIR,{recursive:true});
  let calls=0;
  const options={checkpointPath:join(dir,'checkpoint.sqlite'),decide:async()=>{
    calls++;
    return {kind:'tool' as const,toolId:'filesystem.write',args:{fileName:`${calls}-${file}`,content:'budget'}};
  }};
  const config={configurable:{thread_id:'budget'},recursionLimit:35};
  try {
    let graph=await createGraphV3(options);
    await graph.invoke({runId:'budget',objective:'test',modelId:'mock',selectionReason:'test',
      criterion:{id:'objective-file',kind:'workspace.file_content',version:1,fileName:'closure-objective.md',expectedContent:'test'},
      scopeId:'poc-workspace',observations:[],toolCount:0,status:'queued',result:''},config);
    for(let i=1;i<=5;i++) {
      // A new graph opens the SQLite checkpoint before every approval.
      graph=await createGraphV3(options);
      const snap=await graph.getState(config);
      assert.equal(snap.values.toolCount,i);
      assert.equal(snap.values.observations.length,i-1);
      assert.equal(snap.values.status,'tool_proposed');
      assert.deepEqual(snap.next,['authorization']);
      await assert.rejects(()=>readFile(join(WORKSPACE_DIR,`${i}-${file}`)),{code:'ENOENT'});
      await graph.invoke(new Command({resume:{decision:'approve',runId:'budget',toolId:'filesystem.write',
        requestHash:snap.values.pendingHash,remember:'once'}}),config);
      assert.equal(await readFile(join(WORKSPACE_DIR,`${i}-${file}`),'utf8'),'budget');
    }
    graph=await createGraphV3(options);
    const end=await graph.getState(config);
    assert.equal(end.values.status,'budget_exhausted');
    assert.equal(end.values.toolCount,5);
    assert.equal(end.values.observations.length,5);
    assert.equal(calls,5);
    assert.deepEqual(end.next,[]);
    await graph.invoke(null,config);
    assert.equal(calls,5);
    assert.equal((await graph.getState(config)).values.observations.length,5);
  } finally {await rm(dir,{recursive:true,force:true}); for(let i=1;i<=5;i++) await rm(join(WORKSPACE_DIR,`${i}-${file}`),{force:true});}
});

test('invalid proposals never reach approval or execution; checkpoint remains inspectable', async()=>{
  try {await findTool('text.transform');}
  catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Tool not registered')) throw error;
    await registerTool('examples/text-transform.tool.json');
  }
  const tools=await Promise.all(['filesystem.write','filesystem.read','text.transform'].map(findTool));
  const dir=await mkdtemp(join(tmpdir(),'poc-invalid-'));
  const file=`closure-invalid-${Date.now()}.md`;
  const proposals=[
    {kind:'tool',toolId:'text.transform',args:{input:'test',operation:'execute'}},
    {kind:'tool',toolId:'text.transform',args:{input:'',operation:'uppercase'}},
    {kind:'tool',toolId:'text.transform',args:{input:'test'}},
    {kind:'tool',toolId:'text.transform',args:{input:'test',operation:'uppercase',extra:'unexpected'}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:file}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'test',extra:'ignored?'}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:'../escape.md',content:'test'}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:''}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'x'.repeat(16385)}},
    {kind:'tool',toolId:'filesystem.read',args:{fileName:file,content:'unexpected'}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:3}},
    {kind:'tool',toolId:'unknown.tool',args:{}},
    {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'test'},tools:[{toolId:'filesystem.write',args:{fileName:file,content:'second'}}]},
    [{kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'test'}},
      {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'second'}}],
  ];
  try {
    for(const [i,proposal] of proposals.entries()) {
      const graph=await createGraphV3({checkpointPath:join(dir,'checkpoint.sqlite'),
        decide:async()=>parseModelProposal(JSON.stringify(proposal),tools)});
      const config={configurable:{thread_id:`invalid-${i}`}};
      await assert.rejects(()=>graph.invoke({runId:`invalid-${i}`,objective:'invalid test',modelId:'mock',
        selectionReason:'test',criterion:{id:'objective-file',kind:'workspace.file_content',version:1,fileName:'closure-objective.md',expectedContent:'test'},
      scopeId:'poc-workspace',observations:[],toolCount:0,status:'queued',result:''},config));
      const snap=await graph.getState(config);
      assert.equal(snap.values.toolCount,0);
      assert.deepEqual(snap.values.observations,[]);
      assert.equal(snap.values.authorized,undefined);
      assert.ok(!snap.next.includes('authorization'));
      assert.equal(snap.tasks.length,1);
      assert.ok(snap.tasks[0].error);
      await assert.rejects(()=>readFile(join(WORKSPACE_DIR,file)),{code:'ENOENT'});
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
