import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePlan, parseBinding, parseAuthorization, parseSession, parseEvidence, parseResult, parseCapabilities, normalizeError, wireSnapshot} from '../src/maintenance/contracts.ts';
import {canonical, digestData, planDigest} from '../src/maintenance/digest.ts';
import {authorization, hash, plan} from './helpers/maintenance-plan.ts';

test('maintenance/1 validates every wire object, rejects versions and unknown fields', () => {
  const p = plan(), a = authorization(p);
  const s = {protocol: 'maintenance/1', reference: 'opaque', generation: 1, installationId: 'installation-1',
    operationId: p.operationId, planId: p.planId, planDigest: planDigest(p), publisherId: 'unique', evidenceRefs: []};
  const r = {protocol: 'maintenance/1', operationId: p.operationId, outcome: 'applied', code: null, evidenceRef: 'e1', admission: 'closed'};
  const e = {protocol: 'maintenance/1', evidenceId: 'e1', sequence: 1, installationId: 'installation-1', generation: 1,
    operationId: p.operationId, planDigest: planDigest(p), authorizationId: a.authorizationId, sessionRef: 'opaque',
    resources: ['registry'], observations: [{check: 'sync', origin: 'adapter', kind: 'fact', value: 'confirmed'}],
    preconditions: [], postconditions: [], decision: 'allow', durableResult: r};
  const c = {protocol: 'maintenance/1', adapterId: 'portable', adapterVersion: '1', profile: null, operations: [],
    access: 'unknown', admission: 'unknown', quiescence: 'unknown', durability: 'unknown', reasons: []};
  const objects: [((v: unknown) => unknown), object][] = [[parsePlan, p], [parseBinding, p.binding], [parseAuthorization, a], [parseSession, s], [parseEvidence, e], [parseResult, r], [parseCapabilities, c]];
  for (const [parse, value] of objects) {
    assert.ok(Object.isFrozen(parse(value)));
    for (const invalid of [null, [], {...value, protocol: 'maintenance/2'}, {...value, injected: 'SECRET'}]) assert.throws(() => parse(invalid), /maintenance_protocol_invalid/);
    for (const key of Object.keys(value)) { const missing = {...value} as Record<string, unknown>; delete missing[key]; assert.throws(() => parse(missing)); }
  }
  assert.throws(() => parseResult({...r, evidenceRef: null}));
  assert.throws(() => parseResult({...r, outcome: 'indeterminate', admission: 'open', code: 'maintenance_outcome_indeterminate'}));
  assert.throws(() => parseAuthorization({...a, expiresAt: a.notBefore}));
  assert.throws(() => parseBinding({...p.binding, inventory: []}), /maintenance_inventory_invalid/);
  assert.throws(() => parsePlan({...p, resources: ['registry', 'registry']}));
  assert.throws(() => parsePlan({...p, resources: ['unknown']}));
  assert.throws(() => parsePlan({...p, operationVersion: 2}));
  assert.throws(() => parsePlan({...p, operation: 'historical_grant_revoke'}));
  assert.equal(normalizeError(Error('SECRET')), 'maintenance_outcome_indeterminate');
});

test('canonical codec rejects ambiguous representations without invoking getters', () => {
  let calls = 0;
  const accessor = {get secret() { calls++; return 'SECRET'; }};
  const cycle: any = {}; cycle.self = cycle;
  const hidden = {}; Object.defineProperty(hidden, 'secret', {value: 1});
  const extra: any = []; extra.x = 1;
  for (const value of [accessor, cycle, hidden, extra, [, 1], undefined, NaN, Infinity, -0, 1.5, 2 ** 53, 1n, new Date(), Object.create({x: 1}), {x: undefined}, '\ud800', '\udc00', {[Symbol()]: 1}, () => 1]) {
    assert.throws(() => canonical(value), /^MaintenanceError: maintenance_protocol_invalid$/);
  }
  assert.equal(calls, 0);
  assert.throws(() => canonical('a'.repeat(262145)));
  let deep: unknown = 1; for (let i = 0; i < 34; i++) deep = [deep];
  assert.throws(() => canonical(deep));
  assert.equal(canonical({'\uE000': 1, '😀': 2, a: '\n'}), '{"a":"\\n","😀":2,"":1}');
  assert.notEqual(canonical('é'), canonical('é'));
  const p = plan(), snapshot = parsePlan(p); p.resources.push('other');
  assert.deepEqual([...snapshot.resources], ['registry']);
  assert.ok(Object.isFrozen(snapshot.binding.inventory));
  assert.equal(canonical(wireSnapshot({__proto__: null, a: 1})), '{"a":1}');
});

test('plan digest has a fixed domain-separated vector and commits every plan field', () => {
  const p = plan();
  assert.equal(planDigest(p), 'sha256:054fbada1cddb34d168121cb4a87c6c080a0c51a331d19a459276f8b5726b655');
  const reversed = Object.fromEntries(Object.entries(p).reverse());
  assert.equal(planDigest(p), planDigest(reversed));
  assert.notEqual(planDigest(p), digestData('request', p));
  const edits: Array<(p: ReturnType<typeof plan>) => void> = [
    p => p.planId += '2', p => p.operationId += '2', p => p.binding.generation++,
    p => p.binding.installationId += '2', p => p.binding.rootIdentity += '2', p => p.binding.volumeIdentity += '2',
    p => p.binding.inventory[0].identity += '2', p => p.binding.inventory[0].schema += '2',
    p => p.binding.inventory[0].presence = 'expected_absent', p => p.sourceFingerprint = hash('d'),
    p => p.targetFingerprint = hash('d'), p => p.contentDigest = hash('d'), p => p.changes.push('é😀'),
    p => p.restrictions.push('restriction'), p => p.preconditions.push('condition'), p => p.interruption = 'forced',
    p => p.affectedGrants.push({capability: 'write', descriptorHash: hash(), scope: 'exact'}),
  ];
  for (const edit of edits) { const changed = plan(); edit(changed); assert.notEqual(planDigest(changed), planDigest(p)); }
  assert.notEqual(digestData('plan', ['a', 'b']), digestData('plan', ['b', 'a']));
});
