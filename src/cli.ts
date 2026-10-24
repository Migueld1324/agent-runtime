import { Command } from '@langchain/langgraph';
import { createGraph } from './graph.ts';
import { contentHash } from './policy.ts';

function usage(): never {
  console.log(`\nLangGraph Runtime PoC — offline by default\n\nUsage:\n  npm run agent -- start <run-id> [--model mock] [--file note.md] [--objective "..."]\n  npm run agent -- status <run-id>\n  npm run agent -- approve <run-id>\n  npm run agent -- deny <run-id>\n\nExamples:\n  npm run agent -- start demo-1\n  npm run agent -- status demo-1\n  npm run agent -- approve demo-1\n  npm run agent -- status demo-1\n`);
  process.exit(1);
}
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1] ?? usage();
}

function showStatus(snapshot: { values?: Record<string, unknown>; next?: readonly string[]; tasks?: readonly unknown[] }) {
  const state = snapshot.values ?? {};
  const next = snapshot.next ?? [];
  console.log(`\nRun: ${String(state.runId ?? '(no checkpoint)')}`);
  console.log(`Model: ${String(state.modelId ?? '—')}`);
  console.log(`Objective: ${String(state.objective ?? '—')}`);
  console.log(`Next: ${next.length ? next.join(', ') : '(none)'}`);
  console.log(`Result: ${String(state.result ?? '—')}`);
  if (next.includes('approval')) {
    console.log('Status: WAITING_APPROVAL');
  } else if (state.approved === true && !next.length) {
    console.log('Status: COMPLETED');
  } else if (state.approved === false && !next.length) {
    console.log('Status: DENIED');
  }
}

async function main() {
  const action = process.argv[2];
  const runId = process.argv[3];
  if (!action || !runId || !/^[A-Za-z0-9_-]{1,60}$/.test(runId)) usage();
  if (!['start', 'status', 'approve', 'deny'].includes(action)) usage();
  const graph = await createGraph();
  const config = { configurable: { thread_id: runId } };
  const previous = await graph.getState(config);
  if (action === 'start') {
    if ((previous.values as Partial<Record<string, unknown>>)?.runId) {
      throw new Error(`Run ${runId} already exists. Use status / approve / deny or start with another ID.`);
    }
    const modelId = flag('--model', 'mock');
    const fileName = flag('--file', `note-${runId}.md`);
    const objective = flag('--objective', 'Demonstrate durable approval, model selection and scoped file creation');
    console.log(`Creating run ${runId} with model ${modelId}`);
    const result = await graph.invoke({ runId, modelId, fileName, objective }, config);
    if ('__interrupt__' in result) console.log('Paused for approval. Inspect the run with status.');
    showStatus(await graph.getState(config));
    return;
  }
  if (action === 'status') {
    showStatus(previous);
    const state = previous.values as Partial<{ runId: string; fileName: string; content: string }>;
    if (previous.next?.includes('approval') && state?.fileName && state.content) {
      console.log(`\nRequested write: workspace/${state.fileName}`);
      console.log(`SHA256: ${contentHash(state.content)}`);
      console.log(`Preview:\n${state.content.slice(0, 600)}`);
      console.log('Approve only if this action and content are acceptable.');
    }
    return;
  }
  const state = previous.values as Partial<{ runId: string; fileName: string; content: string }>;
  if (previous.next?.[0] !== 'approval' || state.runId !== runId || !state.fileName || !state.content) {
    throw new Error('This run does not have a pending approval.');
  }
  const response = {
    decision: action === 'approve' ? 'approve' : 'deny',
    runId,
    fileName: state.fileName,
    contentHash: contentHash(state.content),
  };
  const result = await graph.invoke(new Command({ resume: response }), config);
  if ('__interrupt__' in result) console.log('Graph was interrupted again.');
  showStatus(await graph.getState(config));
}
main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
