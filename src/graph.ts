import { mkdir } from 'node:fs/promises';
import { Annotation, END, START, StateGraph, interrupt } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { CHECKPOINT_DB, DATA_DIR } from './paths.ts';
import { draftMarkdown } from './models.ts';
import { evaluateWrite, validateApproval, contentHash } from './policy.ts';
import { writeOnce } from './tool.ts';

const State = Annotation.Root({
  runId: Annotation<string>(),
  objective: Annotation<string>(),
  modelId: Annotation<string>(),
  fileName: Annotation<string>(),
  content: Annotation<string>(),
  approved: Annotation<boolean>(),
  result: Annotation<string>(),
});

export type AgentState = typeof State.State;

export async function createGraph() {
  await mkdir(DATA_DIR, { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(CHECKPOINT_DB);

  const graph = new StateGraph(State)
    // Node 1: draft only. It never writes files.
    .addNode('draft', async (state) => ({
      content: await draftMarkdown(state.modelId, state.objective),
    }))
    // Node 2: interrupt before side effects. Interrupts restart this node,
    // so never put an irreversible operation before interrupt().
    .addNode('approval', async (state) => {
      const policy = evaluateWrite(state.fileName, state.content);
      if (policy.decision === 'deny') {
        return { approved: false, result: `Policy denied: ${policy.reason}` };
      }
      const response: unknown = interrupt({
        type: 'approval_required',
        runId: state.runId,
        capabilityId: policy.capabilityId,
        fileName: state.fileName,
        contentHash: policy.contentHash,
        preview: state.content.slice(0, 600),
      });
      const approved = validateApproval(response, {
        runId: state.runId,
        fileName: state.fileName,
        content: state.content,
      });
      return { approved, result: approved ? 'Approved' : 'Denied by user' };
    })
    // Node 3: only run after an authorized exact-content approval.
    .addNode('write', async (state) => {
      if (!state.approved) throw new Error('Tool gateway: missing approval');
      const policy = evaluateWrite(state.fileName, state.content);
      if (policy.decision !== 'require_approval' || policy.contentHash !== contentHash(state.content)) {
        throw new Error('Tool gateway: policy mismatch');
      }
      const outcome = await writeOnce(state.fileName, state.content);
      return { result: `filesystem.write: ${outcome} (${state.fileName})` };
    })
    .addEdge(START, 'draft')
    .addEdge('draft', 'approval')
    .addConditionalEdges('approval', (state) => state.approved ? 'write' : END)
    .addEdge('write', END)
    .compile({ checkpointer });

  return graph;
}
