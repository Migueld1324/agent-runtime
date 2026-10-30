import {type Action, type MaintenanceAuthorization, type MaintenancePlan, fail, parseAuthorization, parsePlan} from './contracts.ts';
import {canonical, planDigest} from './digest.ts';

export interface Principal { id: string; roles: readonly string[] }
export interface AdministrativePolicy {
  id: string;
  version: number;
  permissions: Readonly<Record<string, readonly Action[]>>;
}
/** Implemented by the trusted transport/authority, never by a wire request.
 * Consent lookup MUST exclude revoked records; policy and identity are read anew.
 * The context is transport-owned (peer identity), not a claimed principal JSON.
 */
export interface Authority<C> {
  authenticate(context: C): Promise<Principal | null>;
  policy(): Promise<AdministrativePolicy>;
  consent(id: string): Promise<MaintenanceAuthorization | null>;
  now(): number;
}
export class MaintenancePolicy<C> {
  readonly #authority: Authority<C>;
  constructor(authority: Authority<C>) { this.#authority = authority; }
  async inspect(context: C): Promise<Principal> {
    try {
      const principal = await this.#authority.authenticate(context);
      const policy = await this.#authority.policy();
      if (!principal || !principal.roles.some(role => Object.hasOwn(policy.permissions, role) && policy.permissions[role].includes('inspect'))) fail('maintenance_authorization_required');
      return principal;
    } catch { return fail('maintenance_authorization_required'); }
  }
  async authorize(context: C, input: unknown, planInput: unknown, action: Action): Promise<MaintenanceAuthorization> {
    const a = parseAuthorization(input), plan = parsePlan(planInput);
    let principal: Principal | null, policy: AdministrativePolicy, consent: MaintenanceAuthorization | null, now: number;
    try {
      principal = await this.#authority.authenticate(context);
      policy = await this.#authority.policy();
      consent = await this.#authority.consent(a.authorizationId);
      now = this.#authority.now();
    } catch { return fail('maintenance_authorization_required'); }
    // Authenticate before looking at/consuming any other principal's nonce.
    if (!principal || principal.id !== a.principalId || !principal.roles.includes(a.role) ||
        !Object.hasOwn(policy.permissions, a.role) || !policy.permissions[a.role].includes(action)) fail('maintenance_authorization_required');
    if (!consent || canonical(parseAuthorization(consent)) !== canonical(a) ||
        a.policyId !== policy.id || a.policyVersion !== policy.version || a.action !== action ||
        !Number.isSafeInteger(now) || now < a.notBefore || now >= a.expiresAt) fail('maintenance_authorization_stale');
    if (a.planId !== plan.planId || a.planDigest !== planDigest(plan) ||
        a.installationId !== plan.binding.installationId || a.generation !== plan.binding.generation ||
        a.interruption !== plan.interruption) fail('maintenance_plan_stale');
    return a;
  }
}

export function applyAction(plan: MaintenancePlan): Action {
  return plan.operation === 'historical_grant_revoke' ? 'revoke_historical' : 'apply';
}
