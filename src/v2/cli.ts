import { Command } from '@langchain/langgraph';
import { createGraphV2 } from './graph.ts';
import { descriptorFingerprint, findTool, listTools, registerTool } from './registry.ts';
import { GrantStore, requestHash } from './policy.ts';
import type { ToolArguments } from './tools.ts';

function usage(): never {
  console.log(`ToolRegistry PoC v0.2 (mock/offline)
  npm run agent:v2 -- tools list
  npm run agent:v2 -- tools register examples/text-transform.tool.json
  npm run agent:v2 -- grants list
  npm run agent:v2 -- grants revoke text.transform
  npm run agent:v2 -- start <id> --tool text.transform --input "hola" --operation uppercase
  npm run agent:v2 -- start <id> --tool filesystem.write --file sample.md --content "Hola"
  npm run agent:v2 -- start <id> --tool filesystem.read --file sample.md
  npm run agent:v2 -- status <id>
  npm run agent:v2 -- approve <id> [--remember workspace]
  npm run agent:v2 -- deny <id>`);
  process.exit(1);
}
function flag(key: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(key);
  if (index === -1) return fallback;
  if (index + 1 >= process.argv.length) usage();
  return process.argv[index + 1];
}
function printState(snapshot: { values?: Record<string, unknown>; next?: readonly string[] }) {
  const state = snapshot.values ?? {};
  if (!state.runId) { console.log('Run: NOT_FOUND'); return; }
  const waiting = snapshot.next?.includes('authorization') && !state.status;
  console.log(`Run: ${state.runId}`);
  console.log(`Tool: ${state.toolId}`);
  console.log(`Model: ${state.modelId}`);
  console.log(`Status: ${waiting ? 'WAITING_APPROVAL' : String(state.status ?? 'IN_PROGRESS').toUpperCase()}`);
  console.log(`Result: ${state.result ?? '—'}`);
  if (waiting) {
    console.log(`Scope: ${state.scopeId}`);
    console.log(`Arguments: ${JSON.stringify(state.args)}`);
    console.log(`Request SHA256: ${requestHashForState(state)}`);
  }
}
function requestHashForState(state: Record<string, unknown>): string {
  // This display helper is deliberately not an authorization authority.
  return state.requestHash ? String(state.requestHash) : '(not available)';
}
async function main() {
  const [command, id, ...rest] = process.argv.slice(2);
  if (command === 'tools') {
    if (id === 'list') {
      for (const tool of await listTools()) console.log(`${tool.id} ${tool.version} [${tool.effects.join(',')}] - ${tool.description}`);
      return;
    }
    if (id === 'register' && rest[0]) {
      const item = await registerTool(rest[0]);
      console.log(`REGISTERED: ${item.id} (${descriptorFingerprint(item).slice(0, 16)})`);
      return;
    }
    usage();
  }
  if (command === 'grants') {
    const store = new GrantStore();
    try {
      if (id === 'list') {
        for (const grant of store.list()) console.log(`${grant.capability} | ${grant.scope} | ${grant.descriptor_hash.slice(0, 16)}`);
        return;
      }
      if (id === 'revoke' && rest[0]) {
        const tool = await findTool(rest[0]);
        store.revokeGrant(tool, 'poc-workspace');
        console.log(`REVOKED: ${tool.id} in poc-workspace`);
        return;
      }
      usage();
    } finally { store.close(); }
  }
  if (!['start', 'status', 'approve', 'deny'].includes(command) || !/^[A-Za-z0-9_-]{1,60}$/.test(id ?? '')) usage();
  const graph = await createGraphV2();
  const config = { configurable: { thread_id: id! } };
  const snapshot = await graph.getState(config);
  if (command === 'start') {
    if ((snapshot.values as {runId?: string})?.runId) throw new Error('Run already exists');
    const toolId = flag('--tool');
    if (!toolId) usage();
    const tool = await findTool(toolId);
    const args: ToolArguments = tool.adapter === 'builtin.text.transform'
      ? { input: flag('--input'), operation: flag('--operation', 'uppercase') }
      : tool.id === 'filesystem.write'
        ? { fileName: flag('--file'), content: flag('--content') }
        : { fileName: flag('--file') };
    const result = await graph.invoke({ runId: id, modelId: 'mock', toolId: tool.id,
      scopeId: 'poc-workspace', descriptorHash: descriptorFingerprint(tool),
      requestHash: requestHash(tool, args), args }, config);
    if ('__interrupt__' in result) console.log('Paused for approval.');
    printState(await graph.getState(config));
    return;
  }
  if (command === 'status') { printState(snapshot); return; }
  const state = snapshot.values as Partial<{
    runId: string; toolId: string; scopeId: string; descriptorHash: string; args: ToolArguments; status: string;
  }>;
  if (snapshot.next?.[0] !== 'authorization' || state.runId !== id || state.status || !state.toolId || !state.args) {
    throw new Error('No pending approval for this run');
  }
  const tool = await findTool(state.toolId);
  if (state.descriptorHash !== descriptorFingerprint(tool)) throw new Error('Tool descriptor changed since approval was requested');
  const remember = flag('--remember', 'once');
  if (remember !== 'once' && remember !== 'workspace') usage();
  if (remember === 'workspace' && tool.adapter !== 'builtin.text.transform') throw new Error('Workspace grant only available for text.transform');
  const answer = { decision: command === 'approve' ? 'approve' : 'deny', runId: id!, toolId: tool.id,
    requestHash: requestHash(tool, state.args), remember };
  await graph.invoke(new Command({ resume: answer }), config);
  printState(await graph.getState(config));
}
main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
