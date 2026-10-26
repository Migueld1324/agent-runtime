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
import { assertObjective, criterionHash, validateCriterion, verifyObjective, type ObjectiveCriterion, type VerificationEvidence } from './objective.ts';

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
  stateVersion: Annotation<number>(),
  criterion: Annotation<ObjectiveCriterion>(),
  criterionHash: Annotation<string>(),
  verification: Annotation<VerificationEvidence>(),
  recoveryCount: Annotation<number>(),
});

export async function createGraphV3(options: {checkpointPath?: string; decide?: typeof decideAction; verify?: typeof verifyObjective} = {}) {
  await mkdir(DATA_DIR, { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(options.checkpointPath ?? join(DATA_DIR, 'runtime-v3.sqlite'));
  return new StateGraph(AgentState)
    .addNode('intake', async state => {
      if (state.stateVersion !== undefined && state.stateVersion !== 1) throw new Error('Unsupported checkpoint version');
      const criterion = validateCriterion(state.criterion);
      return {stateVersion:1,criterion,criterionHash:criterionHash({...state,criterion}),recoveryCount:0};
    })
    .addNode('model', async (state) => {
      assertObjective(state);
      if (state.toolCount >= MAX_TOOL_CALLS) {
        return {status:'budget_exhausted', result:`Stopped after ${MAX_TOOL_CALLS} tool calls`};
      }
      const proposal = await (options.decide ?? decideAction)({
        modelId: state.modelId, objective: state.objective,
        history: state.observations, tools: await listTools(),
      });
      if (proposal.kind === 'final') return {status:'running', result:proposal.text, pendingToolId:'',authorized:false};
      const tool = await findTool(proposal.toolId);
      // Tools are validated before persisted approvals, and again at the execution boundary.
      validateToolArguments(tool, proposal.args);
      return {status:'tool_proposed', toolCount:state.toolCount + 1,
        pendingToolId: tool.id, pendingArgs:proposal.args,
        descriptorHash:descriptorFingerprint(tool), pendingHash:requestHash(tool,proposal.args),
        authorized:false, authorizationSource:'none', remember:false};
    })
    .addNode('authorization', async (state) => {
      assertObjective(state);
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
      assertObjective(state);
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
    .addNode('check_objective', async state => {
      assertObjective(state);
      if (state.authorized || state.pendingToolId) throw new Error('Verification requires no pending operation');
      let verification: VerificationEvidence;
      try { verification = await (options.verify ?? verifyObjective)(state); }
      catch {
        verification = {criterionId:state.criterion.id,criterionVersion:1,criterionHash:state.criterionHash,
          checkedAt:new Date().toISOString(),outcome:'inconclusive',reason:'read_unavailable',retryable:false};
      }
      if (verification.criterionHash !== state.criterionHash) throw new Error('Verification evidence does not match objective');
      if (verification.outcome === 'passed') return {verification,status:'completed',result:'Objective verified'};
      if (verification.outcome === 'failed') return {verification,status:'failed',result:`Objective not satisfied: ${verification.reason}`};
      if (verification.reason === 'policy_denied') return {verification,status:'denied',result:'Verification denied by policy'};
      if (verification.retryable && state.recoveryCount >= 2) {
        return {verification:{...verification,retryable:false},status:'failed',result:'Verification recovery budget exhausted'};
      }
      return {verification,status:'paused',result:`Objective verification inconclusive: ${verification.reason}`};
    })
    .addNode('verification_recovery', async state => {
      assertObjective(state);
      if (state.status !== 'paused' || !state.verification?.retryable || state.recoveryCount >= 2) {
        throw new Error('No safe verification recovery available');
      }
      // Invalid resumes must not leave a poisoned resume value in the checkpoint.
      // Re-interrupt without changing state; LangGraph replays this pure node.
      let invalid = false;
      while (true) {
        const answer: unknown = interrupt({type:'verification_retry',runId:state.runId,
          criterionHash:state.criterionHash,invalidPreviousResponse:invalid});
        const a = answer as {action?:string;runId?:string;criterionHash?:string} | null;
        if (a?.action === 'retry_verification' && a.runId === state.runId && a.criterionHash === state.criterionHash) break;
        invalid = true;
      }
      return {status:'recovering',recoveryCount:state.recoveryCount + 1};
    })
    .addEdge(START,'intake')
    .addEdge('intake','model')
    .addConditionalEdges('model',s => s.status === 'tool_proposed' ? 'authorization' : s.status === 'running' ? 'check_objective' : END)
    .addConditionalEdges('authorization',s => s.authorized ? 'execute' : END)
    .addEdge('execute','model')
    .addConditionalEdges('check_objective',s => s.status === 'paused' && s.verification.retryable ? 'verification_recovery' : END)
    .addEdge('verification_recovery','check_objective')
    .compile({checkpointer});
}
