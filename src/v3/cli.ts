import { Command } from '@langchain/langgraph';
import { createGraphV3 } from './graph.ts';
import { findTool, descriptorFingerprint } from '../v2/registry.ts';
import { requestHash } from '../v2/policy.ts';
import { resolveModel } from './router.ts';
import { chatGPTReady } from './chatgpt-auth.ts';
import type { ToolArguments } from '../v2/tools.ts';
import { assertObjective, validateCriterion, type ObjectiveCriterion } from './objective.ts';

function usage(): never {
  console.log(`Agent Runtime PoC v0.3 — ModelProvider + LangGraph + Tool Gateway
  npm run agent:v3 -- start <id> --task 'Convierte "hola agente" a mayúsculas y guarda el resultado en ejemplo.md' --expect-file ejemplo.md --expect-content 'HOLA AGENTE' [--model mock|auto|chatgpt|openai|anthropic|google]
  npm run agent:v3 -- status <id>
  npm run agent:v3 -- approve <id> [--remember workspace]
  npm run agent:v3 -- deny <id>
  npm run agent:v3 -- retry-verification <id>
  npm run agent:v2 -- tools register examples/text-transform.tool.json   (register first)
  npm run agent:v2 -- grants list|revoke text.transform`);
  process.exit(1);
}
function flag(key: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(key);
  if (idx === -1) return fallback;
  if (idx + 1 >= process.argv.length) usage();
  return process.argv[idx + 1];
}
function printSnapshot(snapshot: {values?: Record<string,unknown>;next?:readonly string[]}) {
  const s = snapshot.values ?? {};
  if (!s.runId) {console.log('Run: NOT_FOUND');return;}
  const waiting = snapshot.next?.includes('authorization') && s.status === 'tool_proposed';
  console.log(`Run: ${s.runId}`);
  console.log(`Model: ${s.modelId} (${s.selectionReason})`);
  console.log(`Tool calls: ${s.toolCount ?? 0}/5`);
  console.log(`Status: ${waiting ? 'WAITING_APPROVAL' : String(s.status || 'IN_PROGRESS').toUpperCase()}`);
  console.log(`Result: ${s.result ?? '—'}`);
  if (s.stateVersion !== 1 && s.status === 'completed') console.log('Verification: LEGACY — objective not verified');
  if (s.verification) {
    const v = s.verification as {outcome:string;reason:string;checkedAt:string;retryable:boolean};
    console.log(`Verification: ${v.outcome} (${v.reason}) at ${v.checkedAt}`);
    console.log(`Verification recovery: ${s.recoveryCount ?? 0}/2; retryable: ${v.retryable}`);
  }
  const observations = Array.isArray(s.observations) ? s.observations as {toolId:string;result:string}[] : [];
  for (const o of observations) console.log(`  ✓ ${o.toolId}: ${o.result}`);
  if (waiting) {
    console.log(`Approval requested for: ${s.pendingToolId}`);
    console.log(`Scope: ${s.scopeId}`);
    console.log(`Arguments: ${JSON.stringify(s.pendingArgs)}`);
    console.log(`Request SHA256: ${s.pendingHash}`);
  }
}
async function main() {
  const [command,id] = process.argv.slice(2);
  if (!['start','status','approve','deny','retry-verification'].includes(command) || !/^[a-zA-Z0-9_-]{1,60}$/.test(id ?? '')) usage();
  const graph = await createGraphV3();
  const config = {configurable:{thread_id:id!},recursionLimit:35};
  const snap = await graph.getState(config);
  if (command === 'start') {
    if ((snap.values as {runId?:string}).runId) throw new Error('Run already exists');
    const task = flag('--task'); if (!task || task.length > 2_000) usage();
    if (flag('--expect-file') === undefined || flag('--expect-content') === undefined) {
      throw new Error('start requires --expect-file and --expect-content');
    }
    const criterion = validateCriterion({id:'objective-file',kind:'workspace.file_content',version:1,
      fileName:flag('--expect-file'),expectedContent:flag('--expect-content')});
    const auth=await chatGPTReady();
    const route = resolveModel(flag('--model','mock')!,{...process.env,AGENT_CHATGPT_AUTH:auth.ready?'1':'0',CHATGPT_MODEL:process.env.CHATGPT_MODEL||auth.model});
    console.log(`Model selected: ${route.id} — ${route.reason}`);
    if (route.id !== 'mock') console.log('NOTICE: task and tool observations will be sent to a remote model. Use only non-sensitive demo data. No billing fallback.');
    await graph.invoke({runId:id!,objective:task,modelId:route.id,selectionReason:route.reason,
      criterion,observations:[],toolCount:0,scopeId:'poc-workspace',status:'queued',result:''},config);
    printSnapshot(await graph.getState(config));
    return;
  }
  if (command === 'status') {printSnapshot(snap);return;}
  assertObjective(snap.values as {stateVersion:number;criterionHash:string;criterion:ObjectiveCriterion;
    runId:string;objective:string;scopeId:string});
  if (command === 'retry-verification') {
    if (snap.next?.[0] !== 'verification_recovery' || snap.values.status !== 'paused' || !snap.values.verification?.retryable) {
      throw new Error('No safe verification recovery available');
    }
    await graph.invoke(new Command({resume:{action:'retry_verification',runId:id!,criterionHash:snap.values.criterionHash}}),config);
    printSnapshot(await graph.getState(config));
    return;
  }
  const s = snap.values as Partial<{runId:string;pendingToolId:string;pendingArgs:ToolArguments;
    pendingHash:string;descriptorHash:string;status:string}>;
  if (snap.next?.[0] !== 'authorization' || s.status !== 'tool_proposed' || s.runId !== id ||
      !s.pendingToolId || !s.pendingArgs) throw new Error('No pending approval');
  const tool = await findTool(s.pendingToolId);
  if (s.descriptorHash !== descriptorFingerprint(tool) || s.pendingHash !== requestHash(tool,s.pendingArgs)) {
    throw new Error('Descriptor or parameters changed; refusing stale approval');
  }
  const remember = flag('--remember','once');
  if (!['once','workspace'].includes(remember!)) usage();
  if (remember === 'workspace' && tool.adapter !== 'builtin.text.transform') {
    throw new Error('Only text.transform may receive a workspace grant in PoC 0.3');
  }
  await graph.invoke(new Command({resume:{decision:command === 'approve' ? 'approve' : 'deny',
    runId:id!,toolId:tool.id,requestHash:s.pendingHash,remember}}),config);
  printSnapshot(await graph.getState(config));
}
main().catch((err:unknown) => {
  console.error('Error:',err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
