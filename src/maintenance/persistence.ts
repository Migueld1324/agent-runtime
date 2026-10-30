import {type MaintenanceAuthorization, type MaintenanceResult, type ErrorCode, fail, parseResult, parseRequestIdentity, parseClaim, type RequestIdentity, type Claim} from './contracts.ts';
import {digestData} from './digest.ts';

export type {RequestIdentity, RequestRecord, Claim} from './contracts.ts';
import type {RequestRecord} from './contracts.ts';
export interface RejectionAudit {
  protocol: 'maintenance/1';
  method: RequestIdentity['method'];
  code: ErrorCode;
}
/** M2 storage port. All calls are authority-only, isolated from tool stores.
 * claim atomically persists identity + globally scoped (installation, nonce) consumption;
 * request keys are (installation, requestId), NOT principal/generation scoped.
 * Same key/different identity => conflict before nonce consumption. An occupied nonce
 * for another request => replay. Repeated identical requests return the original record.
 * complete is conditional, immutable, durable, and cannot create a missing request.
 * read is read-only. Implementations must validate journal/anchor consistency first,
 * fail on missing/corrupt/rolled-back data, and never hold a transaction over external I/O.
 * A rejected Promise may have committed: callers must inspect, never blindly retry effects.
 * M1 intentionally ships NO production implementation of this port.
 */
export interface MaintenancePersistence {
  claim(identity: RequestIdentity): Promise<Claim>;
  complete(identity: RequestIdentity, result: MaintenanceResult): Promise<void>;
  read(installationId: string, requestId: string): Promise<RequestRecord | null>;
  readOperation(installationId: string, operationId: string): Promise<readonly RequestRecord[]>;
  /** Append a sanitized rejection without reserving a request or consuming a nonce. */
  recordRejection(event: RejectionAudit): Promise<void>;
}
export function requestIdentity(requestId: string, method: RequestIdentity['method'],
  operationId: string, authorization: MaintenanceAuthorization, content: unknown): RequestIdentity {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) fail('maintenance_protocol_invalid');
  return parseRequestIdentity({protocol: 'maintenance/1', requestId, method, operationId,
    installationId: authorization.installationId, generation: authorization.generation,
    principalId: authorization.principalId, authorizationId: authorization.authorizationId,
    nonce: authorization.nonce, contentDigest: digestData('request', content)});
}
export class RequestLedger {
  readonly #store: MaintenancePersistence;
  constructor(store: MaintenancePersistence) { this.#store = store; }
  async claim(identity: RequestIdentity): Promise<MaintenanceResult | null> {
    let claim: Claim;
    try {
      identity = parseRequestIdentity(identity);
      claim = parseClaim(await this.#store.claim(identity));
    }
    catch { return fail('maintenance_persistence_failed'); }
    if (claim.kind === 'conflict') fail('maintenance_request_conflict');
    if (claim.kind === 'replay') fail('maintenance_authorization_stale');
    if (claim.kind === 'new') return null;
    const record = claim.record;
    if (digestData('request', record.identity) !== digestData('request', identity)) fail('maintenance_persistence_failed');
    if (record.result === null) fail('maintenance_outcome_indeterminate');
    // Do not infer already_applied, change admission, or republish from a receipt.
    return record.result;
  }
  async complete(identity: RequestIdentity, input: MaintenanceResult): Promise<MaintenanceResult> {
    try { identity = parseRequestIdentity(identity); }
    catch { return fail('maintenance_persistence_failed'); }
    const result = parseResult(input);
    if (result.operationId !== identity.operationId) fail('maintenance_persistence_failed');
    try { await this.#store.complete(identity, result); }
    catch { return fail('maintenance_outcome_indeterminate'); }
    return result;
  }
}
