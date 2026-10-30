import {
  PROTOCOL, type BackendCapabilities, type MaintenancePlan, type MaintenanceResult,
  type MaintenanceSession, type ErrorCode, type Action, parseBinding, parsePlan,
  parseSession, parseCapabilities, parseResult, normalizeError, fail, wireSnapshot, parseRequestRecord,
} from './contracts.ts';
import {planDigest} from './digest.ts';
import {type MaintenancePolicy, applyAction} from './policy.ts';
import {type MaintenancePersistence, type RequestIdentity, RequestLedger, requestIdentity} from './persistence.ts';

export interface Preview {
  protocol: 'maintenance/1';
  informative: true;
  snapshot: 'caller_export_unverified';
  plan: MaintenancePlan;
  digest: string;
  limitations: readonly string[];
}
export interface MutationRequest {
  requestId: string;
  plan: unknown;
  authorization: unknown;
}
export interface SessionRequest extends MutationRequest { session: unknown }
export interface MaintenanceBackend<C> {
  probe(binding: unknown): Promise<BackendCapabilities>;
  preview(context: C, plan: unknown): Promise<Preview>;
  enter(context: C, request: MutationRequest): Promise<MaintenanceResult | MaintenanceSession>;
  validate(context: C, session: unknown): Promise<MaintenanceResult>;
  apply(context: C, request: SessionRequest): Promise<MaintenanceResult>;
  inspect(context: C, binding: unknown, operationId: string): Promise<readonly MaintenanceResult[]>;
  recover(context: C, request: MutationRequest): Promise<MaintenanceResult | MaintenanceSession>;
  leave(context: C, request: SessionRequest): Promise<MaintenanceResult>;
}
/** M1 has no actuator, session issuer, native capability switch or execution callback.
 * Optional persistence is a trusted composition port, not a client capability flag.
 * Supplying it does not enable publication, exclusion or actual service reopening.
 */
export class PortableMaintenanceBackend<C> implements MaintenanceBackend<C> {
  readonly #policy: MaintenancePolicy<C>;
  readonly #persistence?: MaintenancePersistence;
  readonly #ledger?: RequestLedger;
  constructor(policy: MaintenancePolicy<C>, persistence?: MaintenancePersistence) {
    this.#policy = policy;
    this.#persistence = persistence;
    this.#ledger = persistence && new RequestLedger(persistence);
  }
  async probe(binding: unknown): Promise<BackendCapabilities> {
    parseBinding(binding);
    return parseCapabilities({protocol: PROTOCOL, adapterId: 'portable-preview', adapterVersion: '1',
      profile: null, operations: [], access: 'unavailable', admission: 'unavailable',
      quiescence: 'unavailable', durability: 'unavailable', reasons: ['maintenance_exclusion_unavailable']});
  }
  async preview(context: C, input: unknown): Promise<Preview> {
    await this.#policy.inspect(context);
    const plan = parsePlan(input);
    return Object.freeze({protocol: PROTOCOL, informative: true, snapshot: 'caller_export_unverified',
      plan, digest: planDigest(plan), limitations: Object.freeze([
        'No active inventory inspected; caller export is unverified.',
        'No consent, session, exclusion or resource reservation. Repeat under proven exclusion.',
      ])});
  }
  async enter(context: C, request: MutationRequest): Promise<MaintenanceResult> {
    return this.#rejectMutation(context, 'enter', 'interrupt', request);
  }
  async apply(context: C, request: SessionRequest): Promise<MaintenanceResult> {
    return this.#rejectMutation(context, 'apply', undefined, request);
  }
  async recover(context: C, request: MutationRequest): Promise<MaintenanceResult> {
    return this.#rejectMutation(context, 'recover', 'recover', request);
  }
  async leave(context: C, request: SessionRequest): Promise<MaintenanceResult> {
    return this.#rejectMutation(context, 'leave', 'reopen', request);
  }
  async validate(context: C, input: unknown): Promise<MaintenanceResult> {
    await this.#policy.inspect(context);
    const session = parseSession(input);
    return rejection(session.operationId, 'maintenance_exclusion_unavailable');
  }
  async inspect(context: C, input: unknown, operationId: string): Promise<readonly MaintenanceResult[]> {
    await this.#policy.inspect(context);
    const binding = parseBinding(input);
    if (typeof operationId !== 'string' || !operationId.length || operationId.length > 4096) fail('maintenance_protocol_invalid');
    if (!this.#persistence) fail('maintenance_exclusion_unavailable');
    try {
      const records = wireSnapshot(await this.#persistence.readOperation(binding.installationId, operationId));
      if (!Array.isArray(records)) fail('maintenance_persistence_failed');
      const requests = new Set<string>(), nonces = new Set<string>();
      return records.map(value => {
        const record = parseRequestRecord(value);
        if (requests.has(record.identity.requestId) || nonces.has(record.identity.nonce)) fail('maintenance_persistence_failed');
        requests.add(record.identity.requestId); nonces.add(record.identity.nonce);
        if (record.identity.operationId !== operationId || record.identity.installationId !== binding.installationId ||
            record.identity.generation !== binding.generation) fail('maintenance_persistence_failed');
        if (record.result === null) return rejection(operationId, 'maintenance_outcome_indeterminate', true);
        const result = parseResult(record.result);
        if (result.operationId !== operationId) fail('maintenance_persistence_failed');
        return result;
      });
    } catch { return fail('maintenance_persistence_failed'); }
  }
  async #rejectMutation(context: C, method: RequestIdentity['method'], action: Action | undefined,
    request: MutationRequest | SessionRequest): Promise<MaintenanceResult> {
    // Snapshot request before awaits; reject extra fields, accessors and inherited input.
    const snapshot = wireSnapshot(request) as Record<string, unknown>;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) fail('maintenance_protocol_invalid');
    const expected = method === 'apply' || method === 'leave' ? ['requestId', 'plan', 'authorization', 'session'] : ['requestId', 'plan', 'authorization'];
    if (Object.keys(snapshot).length !== expected.length || expected.some(k => !Object.hasOwn(snapshot, k))) fail('maintenance_protocol_invalid');
    const plan = parsePlan(snapshot.plan);
    let claimed = false;
    try {
      const authorization = await this.#policy.authorize(context, snapshot.authorization, plan, action ?? applyAction(plan));
      if (method === 'apply' || method === 'leave') {
        const session = parseSession(snapshot.session);
        if (session.operationId !== plan.operationId || session.planId !== plan.planId ||
            session.planDigest !== planDigest(plan) || session.installationId !== plan.binding.installationId ||
            session.generation !== plan.binding.generation) fail('maintenance_plan_stale');
      }
      const identity = requestIdentity(snapshot.requestId as string, method, plan.operationId, authorization, snapshot);
      if (this.#ledger) {
        const cached = await this.#ledger.claim(identity);
        if (cached) return cached;
        claimed = true;
        return await this.#ledger.complete(identity, rejection(plan.operationId, 'maintenance_exclusion_unavailable'));
      }
      return rejection(plan.operationId, 'maintenance_exclusion_unavailable');
    } catch (error) {
      const code = normalizeError(error);
      const uncertain = claimed || code === 'maintenance_outcome_indeterminate';
      if (this.#persistence) {
        try { await this.#persistence.recordRejection({protocol: PROTOCOL, method, code}); }
        catch { return rejection(plan.operationId, uncertain ? 'maintenance_outcome_indeterminate' : 'maintenance_persistence_failed', uncertain); }
      }
      return rejection(plan.operationId, code, uncertain);
    }
  }
}
function rejection(operationId: string, code: ErrorCode, indeterminate = false): MaintenanceResult {
  // Unknown reflects lack of a native admission observer. No claim about a live service.
  return parseResult({protocol: PROTOCOL, operationId, outcome: indeterminate ? 'indeterminate' : 'rejected',
    code, evidenceRef: null, admission: 'unknown'});
}
