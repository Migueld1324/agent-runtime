/** Provider-neutral operational errors. Messages persisted by the runtime are fixed,
 * never the provider's response body, credential, URL or original error object. */
export type ErrorCode = 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'UNSUPPORTED' | 'UNAVAILABLE'
  | 'APPROVAL_REQUIRED' | 'POLICY_DENIED' | 'TIMEOUT' | 'CANCELLED' | 'EXECUTION_FAILED';
export interface RunError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  phase: 'model' | 'authorization' | 'execute' | 'verification' | 'persistence';
}
export class ModelFailure extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  constructor(code: ErrorCode, retryable: boolean, message='Model operation failed') {
    super(message); this.name = 'ModelFailure';
    this.code=code; this.retryable=retryable;
  }
}
/** Only a trusted adapter that proves it has not produced an effect may use this. */
export class BeforeEffectFailure extends Error {}
export class InfrastructureFailure extends Error {
  constructor() { super('Durable runtime storage unavailable; no further effects permitted'); this.name = 'InfrastructureFailure'; }
}
export class RuntimeBusy extends Error {
  constructor() { super('Runtime busy: another mutating command is active'); this.name = 'RuntimeBusy'; }
}
export function modelError(error: unknown): RunError {
  const known = error instanceof ModelFailure;
  return {phase:'model',code:known ? error.code : 'EXECUTION_FAILED',
    retryable:known && error.retryable,message:'Model request could not complete'};
}
