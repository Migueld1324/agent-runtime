import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Annotation, Command, END, START, StateGraph, interrupt, isCommand, isGraphBubbleUp } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { DATA_DIR } from '../paths.ts';
import { descriptorFingerprint, findTool, listTools } from '../v2/registry.ts';
import { evaluate, GrantStore, requestHash, validateAnswer } from '../v2/policy.ts';
import { executeTool, validateToolArguments, type ToolArguments } from '../v2/tools.ts';
import { decideAction } from './models.ts';
import type { Observation } from './mock.ts';
import type { ModelName } from './router.ts';
import { assertObjective, criterionHash, validateCriterion, verifyObjective, type ObjectiveCriterion, type VerificationEvidence } from './objective.ts';
import { BeforeEffectFailure, InfrastructureFailure, modelError, type RunError } from './failures.ts';
import { OperationsStore, inspectOperations, invocationId, withRuntimeLock, type InvocationBinding } from './operations.ts';

const MAX_TOOL_CALLS = 5;
const terminal = new Set(['completed','denied','failed','budget_exhausted']);
const AgentState = Annotation.Root({
  runId: Annotation<string>(), objective: Annotation<string>(), modelId: Annotation<ModelName>(),
  selectionReason: Annotation<string>(), scopeId: Annotation<string>(), observations: Annotation<Observation[]>(),
  toolCount: Annotation<number>(), pendingToolId: Annotation<string>(), pendingArgs: Annotation<ToolArguments>(),
  descriptorHash: Annotation<string>(), pendingHash: Annotation<string>(), authorized: Annotation<boolean>(),
  authorizationSource: Annotation<'once'|'grant'|'none'>(), remember: Annotation<boolean>(),
  status: Annotation<string>(), result: Annotation<string>(), stateVersion: Annotation<number>(),
  criterion: Annotation<ObjectiveCriterion>(), criterionHash: Annotation<string>(),
  verification: Annotation<VerificationEvidence>(), recoveryCount: Annotation<number>(),
  operationsStoreId: Annotation<string>(), invocationId: Annotation<string>(),
  invocationStatus: Annotation<string>(), runtimeError: Annotation<RunError|null>(), forceApproval: Annotation<boolean>(),
  nextPhase: Annotation<string>(),
});
type State = typeof AgentState.State;
export interface RuntimeOptions {
  checkpointPath?:string; operationsPath?:string; controlPath?:string; checkpointer?:SqliteSaver;
  decide?:typeof decideAction; verify?:typeof verifyObjective; execute?:typeof executeTool;
  rememberGrant?:(tool:Awaited<ReturnType<typeof findTool>>,scope:string)=>void;
  /** Trusted test seams; never configured by model output or CLI flags. */
  hook?:(point:'prepared'|'claimed'|'effect_returned'|'result_confirmed')=>Promise<void>;
}

export async function createGraphV3(options:RuntimeOptions = {}) {
  await mkdir(DATA_DIR,{recursive:true});
  const checkpointPath=options.checkpointPath ?? join(DATA_DIR,'runtime-v3.sqlite');
  const operationsPath=options.operationsPath ?? (options.checkpointPath ? `${checkpointPath}.operations.sqlite` : join(DATA_DIR,'runtime-operations.sqlite'));
  const controlPath=options.controlPath ?? join(options.checkpointPath ? dirname(checkpointPath) : DATA_DIR,'runtime-control.sqlite');
  const checkpointer=options.checkpointer ?? SqliteSaver.fromConnString(checkpointPath);
  let activeStore:OperationsStore|undefined;
  const store=():OperationsStore=>{if(!activeStore)throw new Error('Mutating runtime operation requires exclusive command');return activeStore;};
  function assertFrame(state:State):void {
    assertObjective(state);
    if(state.stateVersion!==2 || !state.operationsStoreId || state.operationsStoreId!==store().id) throw new InfrastructureFailure();
    store().assertRun(state.runId,state.criterionHash,state.modelId);
  }
  const binding=(s:State):InvocationBinding=>({runId:s.runId,ordinal:s.toolCount,toolId:s.pendingToolId,
    descriptorHash:s.descriptorHash,requestHash:s.pendingHash,scopeId:s.scopeId,criterionHash:s.criterionHash});
  const denied=(message:string)=>({status:'denied',authorized:false,runtimeError:{phase:'authorization',code:'POLICY_DENIED',retryable:false,message} as RunError,result:message});
  function uncertain(state:State) {
    store().uncertain(binding(state));
    return {status:'paused',authorized:false,invocationStatus:'uncertain',
      runtimeError:{phase:'execute',code:'EXECUTION_FAILED',retryable:false,message:'Tool effect is uncertain; reconciliation required'} as RunError,
      result:'Tool effect is uncertain; automatic execution blocked'};
  }
  function confirmed(state:State,result:string,grantStatus:string) {
    const id=invocationId(state.runId,state.toolCount);
    const observations=state.observations.some(o=>o.invocationId===id) ? state.observations
      : [...state.observations,{invocationId:id,toolId:state.pendingToolId,args:state.pendingArgs,result}];
    const grantProblem=grantStatus==='pending' || grantStatus==='failed';
    return {status:grantProblem ? 'paused' : 'running',nextPhase:grantProblem ? '' : 'model',result:grantProblem ? 'Tool result confirmed; grant persistence needs inspection' : result,
      observations,pendingToolId:'',authorized:false,authorizationSource:'none' as const,remember:false,invocationStatus:'succeeded',
      runtimeError:grantProblem ? {phase:'persistence',code:'EXECUTION_FAILED',retryable:false,message:'Grant persistence is unconfirmed; tool will not be repeated'} as RunError : null};
  }
  function failedModel(error:unknown,state:State) {
    if(isGraphBubbleUp(error))throw error;
    const normalized=modelError(error);
    const exhausted=normalized.retryable && store().count(state.runId)>=2;
    return {status:normalized.retryable && !exhausted ? 'paused' : 'failed',authorized:false,nextPhase:'model',
      runtimeError:{...normalized,retryable:normalized.retryable && !exhausted},result:exhausted ? 'Recovery budget exhausted' : normalized.message};
  }
  const graph=new StateGraph(AgentState)
    .addNode('intake',async state=>{
      if(state.stateVersion!==undefined && state.stateVersion!==2)throw new Error('Explicit checkpoint migration required');
      const criterion=validateCriterion(state.criterion);
      const hash=criterionHash({...state,criterion});
      store().registerRun(state.runId,hash,state.modelId);
      return {stateVersion:2,criterion,criterionHash:hash,operationsStoreId:store().id,
        recoveryCount:0,runtimeError:null,forceApproval:false,nextPhase:'model'};
    })
    .addNode('model',async state=>{
      assertFrame(state);
      if(state.toolCount>=MAX_TOOL_CALLS)return {status:'budget_exhausted',result:`Stopped after ${MAX_TOOL_CALLS} tool calls`};
      let proposal;
      try {proposal=await (options.decide ?? decideAction)({modelId:state.modelId,objective:state.objective,
        history:state.observations,tools:await listTools()});}
      catch(error){return failedModel(error,state);}
      if(proposal.kind==='final')return {status:'running',result:proposal.text,pendingToolId:'',authorized:false,runtimeError:null,nextPhase:'verification'};
      try {
        const tool=await findTool(proposal.toolId);
        validateToolArguments(tool,proposal.args);
        return {status:'tool_proposed',toolCount:state.toolCount+1,pendingToolId:tool.id,pendingArgs:proposal.args,
          descriptorHash:descriptorFingerprint(tool),pendingHash:requestHash(tool,proposal.args),
          invocationId:invocationId(state.runId,state.toolCount+1),authorized:false,authorizationSource:'none' as const,
          remember:false,forceApproval:false,runtimeError:null,nextPhase:'authorization'};
      } catch {
        return {status:'failed',authorized:false,runtimeError:{phase:'model',code:'INVALID_ARGUMENT',retryable:false,
          message:'Invalid tool proposal; nothing executed'} as RunError,result:'Invalid tool proposal; nothing executed'};
      }
    })
    .addNode('authorization',async state=>{
      assertFrame(state);
      let tool;
      try {tool=await findTool(state.pendingToolId);}
      catch {return denied('Tool is unavailable or changed');}
      if(descriptorFingerprint(tool)!==state.descriptorHash || requestHash(tool,state.pendingArgs)!==state.pendingHash) return denied('Tool descriptor or arguments changed');
      const grants=new GrantStore();
      let decision:ReturnType<typeof evaluate>;
      try {decision=evaluate(tool,state.pendingArgs,state.scopeId,grants);}finally{grants.close();}
      if(decision==='deny')return denied('Denied by policy');
      if(decision==='allow' && !state.forceApproval)return {authorized:true,authorizationSource:'grant' as const,status:'authorized',remember:false,runtimeError:null};
      let invalid=false;
      while(true) {
        const answer:unknown=interrupt({type:'approval_required',runId:state.runId,capability:state.pendingToolId,scopeId:state.scopeId,
          requestHash:state.pendingHash,arguments:state.pendingArgs,allowWorkspaceGrant:tool.adapter==='builtin.text.transform',invalidPreviousResponse:invalid});
        let valid;
        try {valid=validateAnswer(answer,{runId:state.runId,tool,args:state.pendingArgs});}catch{invalid=true;continue;}
        return {authorized:valid.decision==='approve',authorizationSource:valid.decision==='approve' ? 'once' as const : 'none' as const,
          remember:valid.decision==='approve' && valid.remember==='workspace',forceApproval:false,
          status:valid.decision==='approve' ? 'authorized' : 'denied',runtimeError:null,
          result:valid.decision==='approve' ? 'Approved' : 'Denied by user'};
      }
    })
    .addNode('execute',async state=>{
      assertFrame(state);
      const b=binding(state);
      let tool;
      try {
        tool=await findTool(state.pendingToolId);
        if(descriptorFingerprint(tool)!==state.descriptorHash || requestHash(tool,state.pendingArgs)!==state.pendingHash)return denied('Tool descriptor or arguments changed');
        validateToolArguments(tool,state.pendingArgs);
      } catch {return denied('Tool unavailable or invalid arguments');}
      const previous=store().bound(b);
      // A confirmed result precedes all checkpoint repair and grant handling.
      if(previous?.status==='succeeded')return confirmed(state,previous.result!,previous.grantStatus);
      if(previous?.status==='executing' || previous?.status==='uncertain')return uncertain(state);
      if(!state.authorized || state.status!=='authorized')throw new Error('Tool Gateway: not authorized');
      const grants=new GrantStore();
      try {
        const decision=evaluate(tool,state.pendingArgs,state.scopeId,grants);
        if(decision==='deny' || (state.authorizationSource==='grant' && decision!=='allow'))return denied('Tool Gateway: policy blocked / grant revoked');
        store().prepare(b);
        await options.hook?.('prepared');
        if(!store().claim(b,state.remember))throw new InfrastructureFailure();
        let result:string;
        try {
          await options.hook?.('claimed');
          result=await (options.execute ?? executeTool)(tool,state.pendingArgs);
          await options.hook?.('effect_returned');
        } catch(error) {
          if(isGraphBubbleUp(error))throw error;
          if(error instanceof BeforeEffectFailure || (!options.execute && tool.adapter!=='builtin.filesystem.write' && !options.hook)) {
            store().failBeforeEffect(b);
            return {status:'failed',authorized:false,invocationStatus:'failed',result:'Tool failed before any effect',
              runtimeError:{phase:'execute',code:'EXECUTION_FAILED',retryable:false,message:'Tool failed before any effect'} as RunError};
          }
          return uncertain(state);
        }
        store().confirm(b,result);
        await options.hook?.('result_confirmed');
        if(state.remember) {
          try {
            if(options.rememberGrant)options.rememberGrant(tool,state.scopeId);else grants.addGrant(tool,state.scopeId);
            store().markGrant(b,'succeeded');
          } catch(error) {
            if(error instanceof InfrastructureFailure)throw error;
            store().markGrant(b,'failed');
          }
        }
        return confirmed(state,result,store().bound(b)!.grantStatus);
      } finally {grants.close();}
    })
    .addNode('check_objective',async state=>{
      assertFrame(state);
      if(state.authorized || state.pendingToolId || state.invocationStatus==='uncertain')throw new Error('Verification requires no pending or uncertain operation');
      let verification:VerificationEvidence;
      try {verification=await (options.verify ?? verifyObjective)(state);}
      catch(error){
        if(isGraphBubbleUp(error))throw error;
        verification={criterionId:state.criterion.id,criterionVersion:1,criterionHash:state.criterionHash,
          checkedAt:new Date().toISOString(),outcome:'inconclusive',reason:'read_unavailable',retryable:false};
      }
      if(verification.criterionHash!==state.criterionHash)throw new Error('Verification evidence does not match objective');
      if(verification.outcome==='passed')return {verification,status:'completed',result:'Objective verified',runtimeError:null};
      if(verification.outcome==='failed')return {verification,status:'failed',result:`Objective not satisfied: ${verification.reason}`,runtimeError:null};
      if(verification.reason==='policy_denied')return {...denied('Verification denied by policy'),verification};
      if(verification.retryable && store().count(state.runId)>=2)return {verification:{...verification,retryable:false},status:'failed',result:'Recovery budget exhausted'};
      return {verification,status:'paused',result:`Objective verification inconclusive: ${verification.reason}`,runtimeError:null};
    })
    .addNode('model_recovery',async state=>recoverNode(state,'model'))
    .addNode('verification_recovery',async state=>recoverNode(state,'verification'))
    .addEdge(START,'intake').addEdge('intake','model')
    .addConditionalEdges('model',s=>s.status==='tool_proposed' ? 'authorization' : s.status==='running' || (s.status==='recovering' && s.nextPhase==='verification') ? 'check_objective' : s.status==='paused' && s.runtimeError?.retryable ? 'model_recovery' : END)
    .addConditionalEdges('authorization',s=>s.authorized ? 'execute' : END)
    .addConditionalEdges('execute',s=>s.status==='running' || (s.status==='recovering' && s.nextPhase==='model') ? 'model' : END)
    .addConditionalEdges('check_objective',s=>s.status==='paused' && s.verification.retryable ? 'verification_recovery' : END)
    .addEdge('model_recovery','model').addEdge('verification_recovery','check_objective')
    .compile({checkpointer});

  async function recoverNode(state:State,target:'model'|'verification') {
    assertFrame(state);
    if(state.status!=='paused' || !(target==='model' ? state.runtimeError?.retryable : state.verification?.retryable))throw new Error('No safe recovery available');
    let invalid=false;
    while(true) {
      const answer:unknown=interrupt({type:`${target}_retry`,runId:state.runId,criterionHash:state.criterionHash,invalidPreviousResponse:invalid});
      const a=answer as {action?:string;runId?:string;criterionHash?:string;requestId?:string;checkpointId?:string}|null;
      if(!a || a.action!==`retry_${target}` || a.runId!==state.runId || a.criterionHash!==state.criterionHash || !a.requestId || !a.checkpointId){invalid=true;continue;}
      if(store().recovery(state.runId,a.requestId)?.dispatched){invalid=true;continue;}
      const count=store().acceptRecovery(state.runId,a.requestId,target,a.checkpointId);
      store().dispatch(state.runId,a.requestId);
      return {status:'recovering',recoveryCount:count,runtimeError:null,nextPhase:target};
    }
  }
  type Config=Parameters<typeof graph.getState>[0];
  type Input=Parameters<typeof graph.invoke>[0];
  const callGraph=(value:Input,config:Config)=>graph.invoke(value,{...config,durability:'sync'});
  async function locked<T>(config:Config,action:(snap:Awaited<ReturnType<typeof graph.getState>>)=>Promise<T>,migration=false):Promise<T> {
    if(config.configurable?.checkpoint_id)throw new Error('Mutating commands require the latest checkpoint');
    return withRuntimeLock(controlPath,async()=>{
      const snap=await graph.getState(config);
      if(snap.values.runId && snap.values.stateVersion!==2 && !migration)throw new Error('Explicit checkpoint migration required');
      if(snap.values.stateVersion===2 && !snap.values.operationsStoreId)throw new InfrastructureFailure();
      activeStore=new OperationsStore(operationsPath,snap.values.stateVersion===2 ? snap.values.operationsStoreId : undefined);
      try {
        if(snap.values.stateVersion===2)assertFrame(snap.values);
        return await action(snap);
      } finally {activeStore.close();activeStore=undefined;}
    });
  }
  async function invokeLocked(value:Input,config:Config) {
    const snap=await graph.getState(config);
    if(store().entries(snap.values.runId ?? '').some(e=>e.status==='executing' || e.status==='uncertain')) {
      throw new Error('Unconfirmed invocation requires explicit recovery or reconciliation');
    }
    if(isCommand(value)) {
      if(terminal.has(snap.values.status))throw new Error('Run is terminal');
      const a=value.resume as Record<string,unknown>|undefined;
      if(!a || a.runId!==snap.values.runId)throw new Error('Command does not match run');
      if(snap.next[0]==='authorization') {
        const tool=await findTool(snap.values.pendingToolId);
        validateAnswer(a,{runId:snap.values.runId,tool,args:snap.values.pendingArgs});
        if(descriptorFingerprint(tool)!==snap.values.descriptorHash)throw new Error('Descriptor changed; stale approval refused');
      } else if(['model_recovery','verification_recovery'].includes(snap.next[0])) {
        const target=snap.next[0]==='model_recovery' ? 'model' : 'verification';
        if(a.action!==`retry_${target}` || a.criterionHash!==snap.values.criterionHash)throw new Error('Recovery does not match run and objective');
        const requestId=typeof a.requestId==='string' ? a.requestId : randomUUID();
        if(!/^[A-Za-z0-9_-]{1,100}$/.test(requestId))throw new Error('Invalid recovery request ID');
        const old=store().recovery(snap.values.runId,requestId);
        if(old && (old.target!==target || old.dispatched))throw new Error('Recovery request already used or does not match checkpoint');
        if(store().count(snap.values.runId)>=2 && !old) {
          await graph.updateState(config,{status:'failed',runtimeError:{phase:target,code:'EXECUTION_FAILED',retryable:false,message:'Recovery budget exhausted'},result:'Recovery budget exhausted'},'execute');
          return (await graph.getState(config)).values;
        }
        value=new Command({resume:{...a,requestId,checkpointId:snap.config?.configurable?.checkpoint_id}});
      } else throw new Error('No pending command available');
    } else if(value) {
      if(snap.values.runId)throw new Error('Run already exists');
      if((value as Partial<State>).runId!==config.configurable?.thread_id)throw new Error('Run does not match thread');
      if(store().run(String(config.configurable?.thread_id)))throw new Error('Run already exists in durable store; checkpoint is missing');
    } else {
      if(terminal.has(snap.values.status))return snap.values;
      throw new Error('Use explicit recovery to continue an interrupted run');
    }
    return callGraph(value,config);
  }
  const facade={
    invoke:(value:Input,config:Config)=>locked(config,()=>invokeLocked(value,config)),
    getState:async(config:Config)=>{
      const snap=await graph.getState(config);
      let operations:ReturnType<typeof inspectOperations>|undefined;
      if(snap.values.stateVersion===2) {
        try {operations=inspectOperations(operationsPath,snap.values.operationsStoreId,snap.values.runId,snap.values.criterionHash,snap.values.modelId);}
        catch {operations={identityMatches:false,recoveryCount:0,invocations:[]};}
      }
      return {...snap,values:{...snap.values,recoveryCount:Math.max(snap.values.recoveryCount ?? 0,operations?.recoveryCount ?? 0)},operations};
    },
    /** Trusted administration/testing; also serialized. Model providers never receive this API. */
    updateState:(...args:Parameters<typeof graph.updateState>)=>locked(args[0],()=>graph.updateState(...args)),
    recover:async(config:Config,requestId:string=randomUUID())=>locked(config,async snap=>{
      const state=snap.values;
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(requestId))throw new Error('Invalid recovery request ID');
      if(terminal.has(state.status))throw new Error('Run is terminal');
      if(store().recovery(state.runId,requestId)?.dispatched)throw new Error('Recovery request already used');
      const unresolved=store().entries(state.runId).filter(e=>e.status==='executing' || e.status==='uncertain');
      if(unresolved.length && !(state.pendingToolId && snap.next.includes('execute') && unresolved.every(e=>e.id===invocationId(state.runId,state.toolCount)))) {
        for(const entry of unresolved)store().uncertain(entry);
        await graph.updateState(config,{status:'paused',authorized:false,invocationStatus:'uncertain',
          runtimeError:{phase:'execute',code:'EXECUTION_FAILED',retryable:false,message:'Unconfirmed effect requires reconciliation'},result:'Unconfirmed effect requires reconciliation'},'execute');
        return (await graph.getState(config)).values;
      }
      const pendingEntry=state.pendingToolId && snap.next.includes('execute') ? store().bound(binding(state)) : undefined;
      if(pendingEntry?.status==='failed') {
        await graph.updateState(config,{status:'failed',authorized:false,invocationStatus:'failed',
          runtimeError:{phase:'execute',code:'EXECUTION_FAILED',retryable:false,message:'Tool failed before any effect'},result:'Tool failed before any effect'},'execute');
        return (await graph.getState(config)).values;
      }
      const safeContinuation=!unresolved.length && (state.pendingToolId && snap.next.includes('execute') ||
        snap.next.some(n=>['model','check_objective','model_recovery','verification_recovery'].includes(n)) ||
        !snap.next.length && ['queued','running','recovering'].includes(state.status) && ['model','verification'].includes(state.nextPhase));
      if(safeContinuation && store().count(state.runId)>=2 && !store().recovery(state.runId,requestId)) {
        const restored=pendingEntry?.status==='succeeded' ? confirmed(state,pendingEntry.result!,pendingEntry.grantStatus) : {};
        await graph.updateState(config,{...restored,status:'failed',authorized:false,recoveryCount:store().count(state.runId),
          runtimeError:{phase:'persistence',code:'EXECUTION_FAILED',retryable:false,message:'Recovery budget exhausted'},result:'Recovery budget exhausted'},'execute');
        return (await graph.getState(config)).values;
      }
      if(state.pendingToolId && snap.next.includes('execute')) {
        const b=binding(state),entry=store().bound(b);
        if(entry?.status==='executing' || entry?.status==='uncertain') {
          await graph.updateState(config,uncertain(state),'execute');
          return (await graph.getState(config)).values;
        }
        const target=entry?.status==='succeeded' ? 'restore_result' : 'restore_approval';
        const count=store().acceptRecovery(state.runId,requestId,target,String(snap.config?.configurable?.checkpoint_id));
        if(target==='restore_result') {
          await graph.updateState(config,{recoveryCount:count},'authorization');
          store().dispatch(state.runId,requestId);
          return callGraph(null,config);
        }
        // No Executor entry was recorded: require fresh exact consent, even for a grant.
        await graph.updateState(config,{recoveryCount:count,status:'tool_proposed',authorized:false,
          authorizationSource:'none',remember:false,forceApproval:true,runtimeError:null},'model');
        store().dispatch(state.runId,requestId);
        return callGraph(null,config);
      }
      if(snap.next.includes('verification_recovery') || snap.next.includes('model_recovery')) {
        const target=snap.next.includes('model_recovery') ? 'model' : 'verification';
        if(snap.tasks.some(t=>t.error)) {
          await graph.updateState(config,{status:'paused'},target==='model' ? 'model' : 'check_objective');
          await callGraph(null,config);
        }
        return invokeLocked(new Command({resume:{action:`retry_${target}`,runId:state.runId,criterionHash:state.criterionHash,requestId}}),config);
      }
      // A killed model attempt can leave a task without a returned state transition.
      if(snap.next.includes('model') && !state.pendingToolId && !state.authorized && state.invocationStatus!=='uncertain') {
        await graph.updateState(config,{status:'paused',runtimeError:{phase:'model',code:'UNAVAILABLE',retryable:true,
          message:'Model attempt interrupted; explicit recovery required'}},'model');
        await callGraph(null,config);
        return invokeLocked(new Command({resume:{action:'retry_model',runId:state.runId,criterionHash:state.criterionHash,requestId}}),config);
      }
      if(snap.next.includes('check_objective') && !state.pendingToolId && !state.authorized && state.invocationStatus!=='uncertain') {
        const count=store().acceptRecovery(state.runId,requestId,'verification',String(snap.config?.configurable?.checkpoint_id));
        await graph.updateState(config,{recoveryCount:count,status:'recovering',nextPhase:'verification'},'model');
        store().dispatch(state.runId,requestId);
        return callGraph(null,config);
      }
      // Pending node writes can survive a failed checkpoint while its successors
      // are absent. Repair routing only from an explicit, persisted continuation.
      if(!snap.next.length && ['queued','running','recovering'].includes(state.status) && !state.pendingToolId && !state.authorized &&
          ['model','verification'].includes(state.nextPhase) && state.invocationStatus!=='uncertain') {
        const target=state.nextPhase;
        const count=store().acceptRecovery(state.runId,requestId,target,String(snap.config?.configurable?.checkpoint_id));
        await graph.updateState(config,{status:'recovering',recoveryCount:count,runtimeError:null},target==='model' ? 'execute' : 'model');
        store().dispatch(state.runId,requestId);
        return callGraph(null,config);
      }
      throw new Error('No safe recovery available');
    }),
    migrate:async(config:Config,criterion?:ObjectiveCriterion)=>locked(config,async snap=>{
      const s=snap.values;
      if(s.stateVersion===2) {
        if(criterion && criterionHash({...s,criterion})!==s.criterionHash)throw new Error('Migration must preserve the accepted objective');
        return s;
      }
      if(!s.runId || ![undefined,1].includes(s.stateVersion) || terminal.has(s.status))throw new Error('Checkpoint is not eligible for migration');
      if(snap.tasks.some(t=>t.error) || !snap.tasks.some(t=>t.interrupts?.length))throw new Error('Ambiguous checkpoint; migration refused');
      const approval=snap.next[0]==='authorization' && s.status==='tool_proposed' && !s.authorized;
      const verification=snap.next[0]==='verification_recovery' && s.stateVersion===1 && s.status==='paused' &&
        s.verification?.retryable && !s.pendingToolId && !s.authorized;
      if(!approval && !verification)throw new Error('Ambiguous checkpoint; migration refused');
      if(store().entries(s.runId).length)throw new Error('Durable invocation history exists for legacy checkpoint; migration refused');
      const c=validateCriterion(criterion ?? s.criterion);
      if(s.stateVersion===1) {
        assertObjective(s);
        if(criterionHash({...s,criterion:c})!==s.criterionHash)throw new Error('Migration must preserve the accepted objective');
      }
      if(approval) {
        const tool=await findTool(s.pendingToolId);
        validateToolArguments(tool,s.pendingArgs);
        if(descriptorFingerprint(tool)!==s.descriptorHash || requestHash(tool,s.pendingArgs)!==s.pendingHash)throw new Error('Stale approval; migration refused');
      }
      const patch={stateVersion:2,operationsStoreId:store().id,criterion:c,criterionHash:criterionHash({...s,criterion:c}),
        recoveryCount:Math.max(s.recoveryCount ?? 0,store().count(s.runId)),authorized:false,forceApproval:approval,runtimeError:null};
      store().registerRun(s.runId,patch.criterionHash,s.modelId);
      store().seedCount(s.runId,s.recoveryCount ?? 0);
      // Old checkpoints remain in SQLite history; the new checkpoint is appended.
      await graph.updateState(config,patch,approval ? 'model' : 'check_objective');
      return callGraph(null,config);
    },true),
  };
  return facade;
}
