/** Portable administrative wire protocol. No runtime/tool authority is imported here. */
export const PROTOCOL = 'maintenance/1' as const;
export const ERROR_CODES = [
  'maintenance_protocol_invalid', 'maintenance_exclusion_unavailable',
  'maintenance_authorization_required', 'maintenance_authorization_stale',
  'maintenance_busy', 'maintenance_quiescence_unproven', 'maintenance_boundary_unproven',
  'maintenance_inventory_invalid', 'maintenance_nonterminal_runs', 'maintenance_plan_stale',
  'maintenance_persistence_failed', 'maintenance_outcome_indeterminate',
  'maintenance_request_conflict', 'maintenance_evidence_insufficient',
] as const;
export type ErrorCode = typeof ERROR_CODES[number];
export class MaintenanceError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) { super(code); this.name = 'MaintenanceError'; this.code = code; }
}
export function fail(code: ErrorCode): never { throw new MaintenanceError(code); }
export function normalizeError(error: unknown): ErrorCode {
  return error instanceof MaintenanceError ? error.code : 'maintenance_outcome_indeterminate';
}

// Only bounded plain JSON data crosses this boundary. Never invoke accessors/toJSON.
export function wireSnapshot(input: unknown): unknown {
  let nodes = 0, units = 0;
  const seen = new Set<object>();
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 20000 || depth > 32) fail('maintenance_protocol_invalid');
    if (typeof v === 'string') {
      units += v.length;
      if (units > 262144 || /[\uD800-\uDFFF]/u.test(v)) fail('maintenance_protocol_invalid');
      return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0)) return v;
    if (!v || typeof v !== 'object' || seen.has(v)) fail('maintenance_protocol_invalid');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype) &&
        !(Object.getPrototypeOf(v) === null && !array)) fail('maintenance_protocol_invalid');
    seen.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(v).some(k => typeof k !== 'string')) fail('maintenance_protocol_invalid');
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, d] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!d.enumerable || !('value' in d) || /[\uD800-\uDFFF]/u.test(key)) fail('maintenance_protocol_invalid');
      if (array && !/^(0|[1-9][0-9]*)$/.test(key)) fail('maintenance_protocol_invalid');
      units += key.length;
      if (units > 262144) fail('maintenance_protocol_invalid');
      out[key] = copy(d.value, depth + 1);
    }
    seen.delete(v);
    if (array) {
      if (Object.keys(out).length !== (v as unknown[]).length) fail('maintenance_protocol_invalid');
      return Object.freeze(Array.from({length: (v as unknown[]).length}, (_, i) => out[String(i)]));
    }
    return Object.freeze(out);
  }
  try { return copy(input, 0); } catch { return fail('maintenance_protocol_invalid'); }
}

type Parser<T> = (value: unknown) => T;
type Parsed<P> = P extends Parser<infer T> ? T : never;
const str: Parser<string> = v => typeof v === 'string' && v.length > 0 && v.length <= 4096 ? v : fail('maintenance_protocol_invalid');
const integer: Parser<number> = v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail('maintenance_protocol_invalid');
const bool: Parser<boolean> = v => typeof v === 'boolean' ? v : fail('maintenance_protocol_invalid');
const choice = <const T extends readonly string[]>(...values: T): Parser<T[number]> => v =>
  typeof v === 'string' && values.includes(v) ? v as T[number] : fail('maintenance_protocol_invalid');
const list = <T>(parse: Parser<T>): Parser<T[]> => v => Array.isArray(v) && v.length <= 1024 ? v.map(parse) : fail('maintenance_protocol_invalid');
const nullable = <T>(parse: Parser<T>): Parser<T | null> => v => v === null ? null : parse(v);
const object = <T extends Record<string, Parser<unknown>>>(shape: T): Parser<{[K in keyof T]: Parsed<T[K]>}> => v => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('maintenance_protocol_invalid');
  const keys = Object.keys(v);
  if (keys.length !== Object.keys(shape).length || keys.some(k => !Object.hasOwn(shape, k))) fail('maintenance_protocol_invalid');
  const out = Object.create(null);
  for (const k of Object.keys(shape)) out[k] = shape[k]((v as Record<string, unknown>)[k]);
  return out;
};
const protocol = choice(PROTOCOL);
const digest: Parser<string> = v => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v) ? v : fail('maintenance_protocol_invalid');
const resource = object({id: str, kind: choice('store', 'registry', 'sidecar', 'control'), identity: str,
  schema: str, presence: choice('present', 'expected_absent')});
const binding = object({protocol, installationId: str, generation: integer, rootIdentity: str,
  volumeIdentity: str, inventory: list(resource)});
export const ACTIONS = ['inspect', 'interrupt', 'apply', 'revoke_historical', 'recover', 'reopen'] as const;
const action = choice(...ACTIONS);
const grant = object({capability: str, descriptorHash: digest, scope: str});
const plan = object({protocol, planId: str, operationId: str, operationVersion: integer,
  operation: choice('descriptor_replace', 'historical_grant_revoke'), binding,
  resources: list(str), sourceFingerprint: digest, targetFingerprint: digest, contentDigest: digest,
  changes: list(str), restrictions: list(str), affectedGrants: list(grant), preconditions: list(str),
  recovery: choice('reconcile_exact'), interruption: choice('none', 'graceful', 'forced')});
const authorization = object({protocol, authorizationId: str, principalId: str, role: str,
  policyId: str, policyVersion: integer, action, planId: str, planDigest: digest,
  installationId: str, generation: integer, nonce: str, notBefore: integer, expiresAt: integer,
  interruption: choice('none', 'graceful', 'forced')});
const session = object({protocol, reference: str, generation: integer, installationId: str,
  operationId: str, planId: str, planDigest: digest, publisherId: str, evidenceRefs: list(str)});
export const STATES = ['CLOSED', 'NORMAL', 'CLOSING', 'QUIESCENT', 'PREPARED', 'PUBLISHING', 'VERIFIED', 'QUARANTINED'] as const;
const admission = choice('closed', 'open', 'unknown');
const result = object({protocol, operationId: str,
  outcome: choice('rejected', 'not_applied', 'applied', 'already_applied', 'indeterminate'),
  code: nullable(choice(...ERROR_CODES)), evidenceRef: nullable(str), admission});
const evidence = object({protocol, evidenceId: str, sequence: integer, installationId: str,
  generation: integer, operationId: str, planDigest: digest, authorizationId: str,
  sessionRef: nullable(str), resources: list(str),
  observations: list(object({check: str, origin: str, kind: choice('fact', 'inference', 'unavailable'), value: choice('confirmed', 'denied', 'unknown')})),
  preconditions: list(str), postconditions: list(str), decision: choice('allow', 'deny', 'quarantine'),
  durableResult: nullable(result)});
const capabilities = object({protocol, adapterId: str, adapterVersion: str, profile: nullable(str),
  operations: list(object({operation: choice('descriptor_replace', 'historical_grant_revoke'), version: integer})),
  access: choice('proven', 'unavailable', 'unknown'), admission: choice('proven', 'unavailable', 'unknown'),
  quiescence: choice('proven', 'unavailable', 'unknown'), durability: choice('proven', 'unavailable', 'unknown'),
  reasons: list(choice(...ERROR_CODES))});
const requestId: Parser<string> = v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v) ? v : fail('maintenance_protocol_invalid');
const requestIdentity = object({protocol, installationId: str, generation: integer, requestId,
  operationId: str, method: choice('enter', 'apply', 'recover', 'leave'), contentDigest: digest,
  principalId: str, authorizationId: str, nonce: str});
const requestRecord = object({identity: requestIdentity, result: nullable(result)});
export type RequestIdentity = Parsed<typeof requestIdentity>;
export type RequestRecord = Parsed<typeof requestRecord>;
export type Claim = {kind: 'new'} | {kind: 'existing'; record: RequestRecord} | {kind: 'conflict'} | {kind: 'replay'};
export type InstallationBinding = Parsed<typeof binding>;
export type MaintenancePlan = Parsed<typeof plan>;
export type MaintenanceAuthorization = Parsed<typeof authorization>;
export type MaintenanceSession = Parsed<typeof session>;
export type MaintenanceEvidence = Parsed<typeof evidence>;
export type MaintenanceResult = Parsed<typeof result>;
export type BackendCapabilities = Parsed<typeof capabilities>;
export type Action = typeof ACTIONS[number];
export type State = typeof STATES[number];
export type Admission = MaintenanceResult['admission'];

function parse<T>(parser: Parser<T>, value: unknown): T {
  return wireSnapshot(parser(wireSnapshot(value))) as T;
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) fail('maintenance_protocol_invalid');
}
export function parseBinding(value: unknown): InstallationBinding {
  const b = parse(binding, value); unique(b.inventory.map(r => r.id));
  if (!b.inventory.length) fail('maintenance_inventory_invalid');
  return b;
}
export function parsePlan(value: unknown): MaintenancePlan {
  const p = parse(plan, value); parseBinding(p.binding); unique(p.resources);
  unique(p.affectedGrants.map(g => JSON.stringify([g.capability, g.descriptorHash, g.scope])));
  if (p.operationVersion !== 1 || !p.resources.length || p.resources.some(id => !p.binding.inventory.some(r => r.id === id))) fail('maintenance_protocol_invalid');
  if (p.operation === 'historical_grant_revoke' && p.affectedGrants.length !== 1) fail('maintenance_protocol_invalid');
  return p;
}
export function parseAuthorization(value: unknown): MaintenanceAuthorization {
  const a = parse(authorization, value);
  if (a.expiresAt <= a.notBefore) fail('maintenance_protocol_invalid');
  return a;
}
export const parseSession = (v: unknown): MaintenanceSession => parse(session, v);
export const parseCapabilities = (v: unknown): BackendCapabilities => parse(capabilities, v);
export function parseEvidence(v: unknown): MaintenanceEvidence {
  const e = parse(evidence, v);
  if (e.durableResult) {
    const r = parseResult(e.durableResult);
    if (r.operationId !== e.operationId || (r.evidenceRef !== null && r.evidenceRef !== e.evidenceId)) fail('maintenance_protocol_invalid');
  }
  if (e.observations.some(o => o.kind === 'unavailable' && o.value !== 'unknown')) fail('maintenance_protocol_invalid');
  return e;
}
export function parseResult(v: unknown): MaintenanceResult {
  const r = parse(result, v);
  if (['applied', 'already_applied', 'not_applied'].includes(r.outcome) && (!r.evidenceRef || r.code !== null)) fail('maintenance_protocol_invalid');
  if (['rejected', 'indeterminate'].includes(r.outcome) && r.code === null) fail('maintenance_protocol_invalid');
  if (r.outcome === 'indeterminate' && r.admission === 'open') fail('maintenance_protocol_invalid');
  return r;
}

/** Structural consistency only; authenticated historical provenance belongs to M2. */
export const parseRequestIdentity = (v: unknown): RequestIdentity => parse(requestIdentity, v);
export function parseRequestRecord(v: unknown): RequestRecord {
  const record = parse(requestRecord, v);
  if (record.result !== null) {
    const result = parseResult(record.result);
    if (result.operationId !== record.identity.operationId) fail('maintenance_protocol_invalid');
  }
  return record;
}
export function parseClaim(v: unknown): Claim {
  const snapshot = wireSnapshot(v);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) fail('maintenance_protocol_invalid');
  const kind = (snapshot as Record<string, unknown>).kind;
  if (kind === 'existing') {
    const claim = parse(object({kind: choice('existing'), record: requestRecord}), snapshot);
    parseRequestRecord(claim.record);
    return claim;
  }
  const tag = parse(object({kind: choice('new', 'conflict', 'replay')}), snapshot);
  return tag;
}
