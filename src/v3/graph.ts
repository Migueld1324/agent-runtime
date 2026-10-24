import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Annotation, END, START, StateGraph, interrupt } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { DATA_DIR } from '../paths.ts';
import { descriptorFingerprint, findTool, listTools } from '../v2/registry.ts';
import { evaluate, GrantStore, requestHash, validateAnswer } from '../v2/policy.ts';
import { executeTool, validateToolArguments, type ToolArguments } from '../v2/tools.ts';
import { decideAction } from './models.ts';
import type { Observation } from './mock.ts';
import type { ModelName } from './router.ts';

const MAX_TOOL_CALLS = 5;
const AgentState = Annotation.Root({
  runId: Annotation<string>(),
  objective: Annotation<string>(),
  modelId: Annotation<ModelName>(),
  selectionReason: Annotation<string>(),
  scopeId: Annotation<string>(),
  observations: Annotation<Observation[]>(),
  toolCount: Annotation<number>(),
  pendingToolId: Annotation<string>(),
  pendingArgs: Annotation<ToolArguments>(),
  descriptorHash: Annotation<string>(),
  pendingHash: Annotation<string>(),
  authorized: Annotation<boolean>(),
  authorizationSource: Annotation<'once' | 'grant' | 'none'>(),
  remember: Annotation<boolean>(),
  status: Annotation<string>(),
  result: Annotation<string>(),
});

export async function createGraphV3() {
  await mkdir(DATA_DIR, { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(join(DATA_DIR, 'runtime-v3.sqlite'));
  return new StateGraph(AgentState)
    .addNode('model', async (state) => {
      if (state.toolCount >= MAX_TOOL_CALLS) {
        return {status:'budget_exhausted', result:`Stopped after ${MAX_TOOL_CALLS} tool calls`};
      }
      const proposal = await decideAction({
        modelId: state.modelId, objective: state.objective,
        history: state.observations, tools: await listTools(),
      });
      if (proposal.kind === 'final') return {status:'completed', result:proposal.text};
      const tool = await findTool(proposal.toolId);
      // Tools are validated before persisted approvals, and again at the execution boundary.
      validateToolArguments(tool, proposal.args);
      return {status:'tool_proposed', toolCount:state.toolCount + 1,
        pendingToolId: tool.id, pendingArgs:proposal.args,
        descriptorHash:descriptorFingerprint(tool), pendingHash:requestHash(tool,proposal.args),
        authorized:false, authorizationSource:'none', remember:false};
    })
    .addNode('authorization', async (state) => {
      const tool = await findTool(state.pendingToolId);
      if (descriptorFingerprint(tool) !== state.descriptorHash || requestHash(tool,state.pendingArgs) !== state.pendingHash) {
        return {status:'denied',result:'Tool descriptor or arguments changed',authorized:false};
      }
      const grants = new GrantStore();
      let decision: ReturnType<typeof evaluate>;
      try { decision = evaluate(tool,state.pendingArgs,state.scopeId,grants); }
      finally { grants.close(); }
      if (decision === 'deny') return {status:'denied',result:'Denied by policy',authorized:false};
      if (decision === 'allow') return {authorized:true,authorizationSource:'grant',status:'authorized',remember:false};
      // Nothing with side effects before interrupt(); LangGraph re-enters this node on resume.
      const answer: unknown = interrupt({type:'approval_required', runId:state.runId,
        capability:state.pendingToolId, scopeId:state.scopeId,
        requestHash:state.pendingHash, arguments:state.pendingArgs,
        allowWorkspaceGrant:tool.adapter === 'builtin.text.transform'});
      const valid = validateAnswer(answer, {runId:state.runId,tool,args:state.pendingArgs});
      return {authorized:valid.decision === 'approve',
        authorizationSource:valid.decision === 'approve' ? 'once' : 'none',
        remember:valid.decision === 'approve' && valid.remember === 'workspace',
        status:valid.decision === 'approve' ? 'authorized' : 'denied',
        result:valid.decision === 'approve' ? 'Approved' : 'Denied by user'};
    })
    .addNode('execute', async (state) => {
      if (!state.authorized || state.status !== 'authorized') throw new Error('Tool Gateway: not authorized');
      const tool = await findTool(state.pendingToolId);
      if (descriptorFingerprint(tool) !== state.descriptorHash || requestHash(tool,state.pendingArgs) !== state.pendingHash) {
        throw new Error('Tool Gateway: descriptor/arguments changed');
      }
      const grants = new GrantStore();
      try {
        const decision = evaluate(tool,state.pendingArgs,state.scopeId,grants);
        if (decision === 'deny' || (state.authorizationSource === 'grant' && decision !== 'allow')) {
          throw new Error('Tool Gateway: policy blocked / grant revoked');
        }
        const result = await executeTool(tool,state.pendingArgs);
        if (state.remember) grants.addGrant(tool,state.scopeId);
        return {status:'running',result,
          observations:[...state.observations,{toolId:tool.id,args:state.pendingArgs,result}],
          pendingToolId:'',authorized:false,authorizationSource:'none',remember:false};
      } finally { grants.close(); }
    })
    .addEdge(START,'model')
    .addConditionalEdges('model',s => s.status === 'tool_proposed' ? 'authorization' : END)
    .addConditionalEdges('authorization',s => s.authorized ? 'execute' : END)
    .addEdge('execute','model')
    .compile({checkpointer});
}
