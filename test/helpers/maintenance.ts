import {type MaintenanceAuthorization, type MaintenanceResult} from '../../src/maintenance/contracts.ts';
import {canonical} from '../../src/maintenance/digest.ts';
import {type AdministrativePolicy, type Authority, MaintenancePolicy} from '../../src/maintenance/policy.ts';
import {type Claim, type MaintenancePersistence, type RequestIdentity, type RequestRecord, type RejectionAudit} from '../../src/maintenance/persistence.ts';

export {hash, plan, authorization} from './maintenance-plan.ts';
import {plan, authorization} from './maintenance-plan.ts';

export function authorityFixture(p = plan()) {
  const peer = Object.freeze({});
  const state = {now: 150, consent: authorization(p) as MaintenanceAuthorization | null,
    policy: {id: 'administrative', version: 1, permissions: {operator: ['inspect', 'interrupt', 'apply', 'revoke_historical', 'recover', 'reopen']}} as AdministrativePolicy};
  const authority: Authority<object> = {
    authenticate: async context => context === peer ? {id: 'admin-1', roles: ['operator']} : null,
    policy: async () => state.policy,
    consent: async id => state.consent?.authorizationId === id ? state.consent : null,
    now: () => state.now,
  };
  return {peer, state, authority, policy: new MaintenancePolicy(authority)};
}
/** Test double, deliberately not exported from src. Snapshot/reopen models a durable
 * adapter's contract; it does NOT demonstrate fsync, isolation, an anchor or crash safety. */
export class PersistenceDouble implements MaintenancePersistence {
  records = new Map<string, RequestRecord>();
  nonces = new Set<string>();
  failure: 'claim-before' | 'claim-after' | 'complete-before' | 'complete-after' | 'read' | null = null;
  claims = 0;
  rejections: RejectionAudit[] = [];
  async recordRejection(event: RejectionAudit) { this.rejections.push(structuredClone(event)); }
  key(i: RequestIdentity) { return JSON.stringify([i.installationId, i.requestId]); }
  async claim(identity: RequestIdentity): Promise<Claim> {
    this.claims++;
    if (this.failure === 'claim-before') throw Error('SECRET storage path');
    const key = this.key(identity), old = this.records.get(key);
    if (old) return canonical(old.identity) === canonical(identity) ? {kind: 'existing', record: structuredClone(old)} : {kind: 'conflict'};
    const nonce = JSON.stringify([identity.installationId, identity.nonce]);
    if (this.nonces.has(nonce)) return {kind: 'replay'};
    this.nonces.add(nonce);
    this.records.set(key, {identity: structuredClone(identity), result: null});
    if (this.failure === 'claim-after') throw Error('SECRET storage path');
    return {kind: 'new'};
  }
  async complete(identity: RequestIdentity, result: MaintenanceResult): Promise<void> {
    if (this.failure === 'complete-before') throw Error('SECRET storage path');
    const old = this.records.get(this.key(identity));
    if (!old || canonical(old.identity) !== canonical(identity) || (old.result && canonical(old.result) !== canonical(result))) throw Error('invalid completion');
    old.result = structuredClone(result);
    if (this.failure === 'complete-after') throw Error('SECRET storage path');
  }
  async read(installationId: string, requestId: string) {
    if (this.failure === 'read') throw Error('SECRET storage path');
    return structuredClone(this.records.get(JSON.stringify([installationId, requestId])) ?? null);
  }
  async readOperation(installationId: string, operationId: string) {
    if (this.failure === 'read') throw Error('SECRET storage path');
    return structuredClone([...this.records.values()].filter(r => r.identity.installationId === installationId && r.identity.operationId === operationId));
  }
  reopen() {
    const store = new PersistenceDouble();
    store.records = structuredClone(this.records); store.nonces = structuredClone(this.nonces);
    store.rejections = structuredClone(this.rejections);
    return store;
  }
}
