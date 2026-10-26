import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from '../src/paths.ts';
import { findTool, registerTool } from '../src/v2/registry.ts';
import { createGraphV3 } from '../src/v3/graph.ts';
import { criterionHash } from '../src/v3/objective.ts';

function cli(script: 'v2'|'v3', ...args:string[]) {
  const res=spawnSync(process.execPath,['--import','tsx',`src/${script}/cli.ts`,...args],
    {cwd:process.cwd(),encoding:'utf8',timeout:45_000,env:{...process.env,AGENT_ALLOW_CLOUD:'0'}});
  if (res.status!==0) throw new Error(`FAIL ${args.join(' ')}\n${res.stdout}\n${res.stderr}`);
  return res.stdout;
}
const stamp=`${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
const file=`v3-${stamp}.md`;
const file2=`v3-b-${stamp}.md`;
const path=join(WORKSPACE_DIR,file);
const path2=join(WORKSPACE_DIR,file2);
try {
  try { await findTool('text.transform'); }
  catch { await registerTool('examples/text-transform.tool.json'); }
  cli('v2','grants','revoke','text.transform');
  const r1=`v3-a-${stamp}`;
  const r2=`v3-b-${stamp}`;
  const task=(f:string)=>`Convierte "hola agente" a mayúsculas y guarda el resultado en ${f}`;
  const pending=cli('v3','start',r1,'--task',task(file),'--model','mock','--expect-file',file,'--expect-content','HOLA AGENTE');
  assert.match(pending,/WAITING_APPROVAL/);
  assert.match(pending,/Approval requested for: text.transform/);
  assert.match(cli('v3','status',r1),/WAITING_APPROVAL/);
  const afterTransform=cli('v3','approve',r1,'--remember','workspace');
  assert.match(afterTransform,/WAITING_APPROVAL/);
  assert.match(afterTransform,/Approval requested for: filesystem.write/);
  await assert.rejects(()=>readFile(path,'utf8'),{code:'ENOENT'});
  const denied=cli('v3','deny',r1);
  assert.match(denied,/DENIED/);
  await assert.rejects(()=>readFile(path,'utf8'),{code:'ENOENT'});
  const reuse=cli('v3','start',r2,'--task',task(file2),'--model','auto','--expect-file',file2,'--expect-content','HOLA AGENTE');
  assert.match(reuse,/WAITING_APPROVAL/);
  assert.match(reuse,/Approval requested for: filesystem.write/);
  assert.doesNotMatch(reuse,/Approval requested for: text.transform/);
  const approved=cli('v3','approve',r2);
  assert.match(approved,/COMPLETED/);
  assert.match(approved,/Verification: passed/);
  assert.equal((await readFile(path2,'utf8')),'HOLA AGENTE');
  assert.match(cli('v3','status',r2),/COMPLETED/);
  const r3=`v3-verify-${stamp}`;
  const graph=await createGraphV3({decide:async()=>({kind:'final',text:'Done'}),verify:async context=>
    ({criterionId:'objective-file',criterionVersion:1,criterionHash:criterionHash(context),checkedAt:new Date().toISOString(),
      outcome:'inconclusive',reason:'read_unavailable',retryable:true})});
  const config={configurable:{thread_id:r3}};
  await graph.invoke({runId:r3,objective:task(file2),modelId:'mock',selectionReason:'test',scopeId:'poc-workspace',
    criterion:{id:'objective-file',kind:'workspace.file_content',version:1,fileName:file2,expectedContent:'HOLA AGENTE'},
    observations:[],toolCount:0,status:'queued',result:''},config);
  assert.match(cli('v3','status',r3),/PAUSED/);
  const recovered=cli('v3','retry-verification',r3);
  assert.match(recovered,/COMPLETED/);
  assert.match(recovered,/Verification: passed/);
  const end=await graph.getState(config);
  assert.equal(end.values.recoveryCount,1);
  assert.equal(end.values.toolCount,0);
  assert.deepEqual(end.values.observations,[]);
  console.log('PASS: sequential tools, durable approvals and grants; verified completion; separate CLI process retried verification without replaying the model or tools.');
} finally {
  cli('v2','grants','revoke','text.transform');
  await rm(path,{force:true});
  await rm(path2,{force:true});
}
