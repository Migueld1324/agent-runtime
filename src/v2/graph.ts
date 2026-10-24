import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Annotation, END, START, StateGraph, interrupt } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { DATA_DIR } from '../paths.ts';
import { findTool, descriptorFingerprint } from './registry.ts';
import { evaluate, GrantStore, requestHash, validateAnswer } from './policy.ts';
import { executeTool, type ToolArguments } from './tools.ts';

const State = Annotation.Root({
  runId: Annotation<string>(),
  toolId: Annotation<string>(),
  modelId: Annotation<string>(), // Mock only. Planning/model selection is outside this experiment.
  scopeId: Annotation<string>(),
  args: Annotation<ToolArguments>(),
  descriptorHash: Annotation<string>(),
  requestHash: Annotation<string>(),
  authorized: Annotation<boolean>(),
  remember: Annotation<boolean>(),
  status: Annotation<string>(),
  result: Annotation<string>(),
});
export type ToolRunState = typeof State.State;

export async function createGraphV2() {
  await mkdir(DATA_DIR, { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(join(DATA_DIR, 'runtime-v2.sqlite'));
  return new StateGraph(State)
    .addNode('authorization', async (state) => {
      const tool = await findTool(state.toolId);
      if (state.descriptorHash !== descriptorFingerprint(tool) || state.requestHash !== requestHash(tool, state.args)) {
        return { authorized: false, status: 'denied', result: 'Tool descriptor changed since run started' };
      }
      const grants = new GrantStore();
      let decision: ReturnType<typeof evaluate>;
      try { decision = evaluate(tool, state.args, state.scopeId, grants); }
      finally { grants.close(); }
      if (decision === 'deny') return { authorized: false, status: 'denied', result: 'Denied by policy' };
      if (decision === 'allow') return { authorized: true, remember: false, status: 'authorized' };
      // Must not execute any tool or write a grant before interrupt().
      const answer: unknown = interrupt({
        type: 'approval_required', runId: state.runId,
        toolId: state.toolId, scopeId: state.scopeId,
        requestHash: requestHash(tool, state.args),
        argsPreview: JSON.stringify(state.args).slice(0, 1_000),
        allowWorkspaceGrant: tool.adapter === 'builtin.text.transform',
      });
      const valid = validateAnswer(answer, { runId: state.runId, tool, args: state.args });
      return {
        authorized: valid.decision === 'approve',
        remember: valid.decision === 'approve' && valid.remember === 'workspace',
        status: valid.decision === 'approve' ? 'authorized' : 'denied',
        result: valid.decision === 'approve' ? 'Approved by user' : 'Denied by user',
      };
    })
    .addNode('execute', async (state) => {
      if (state.authorized !== true) throw new Error('Tool gateway: missing authorization');
      const tool = await findTool(state.toolId);
      if (state.descriptorHash !== descriptorFingerprint(tool) || state.requestHash !== requestHash(tool, state.args)) {
        throw new Error('Tool gateway: descriptor or arguments changed');
      }
      // IMPORTANT: revalidate constraints at the executor boundary, not just at approval.
      const grants = new GrantStore();
      try {
        const decision = evaluate(tool, state.args, state.scopeId, grants);
        if (decision === 'deny') throw new Error('Tool gateway: policy denied operation');
        const result = await executeTool(tool, state.args);
        if (state.remember) grants.addGrant(tool, state.scopeId);
        return { status: 'completed', result };
      } finally { grants.close(); }
    })
    .addEdge(START, 'authorization')
    .addConditionalEdges('authorization', (state) => state.authorized ? 'execute' : END)
    .addEdge('execute', END)
    .compile({ checkpointer });
}
