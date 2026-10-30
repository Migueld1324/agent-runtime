import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PortableMaintenanceBackend} from '../src/maintenance/backend.ts';
import {planDigest} from '../src/maintenance/digest.ts';
import {authorization, authorityFixture, plan, PersistenceDouble} from './helpers/maintenance.ts';

const session = () => ({protocol: 'maintenance/1', reference: 'forged', generation: 1, installationId: 'installation-1',
  operationId: 'operation-1', planId: 'plan-1', planDigest: planDigest(plan()), publisherId: 'fake', evidenceRefs: []});
test('portable probe/preview have no persistence effects and never reserve consent or exclusion', async () => {
  const f = authorityFixture(), store = new PersistenceDouble(), backend = new PortableMaintenanceBackend(f.policy, store);
  const capabilities = await backend.probe(plan().binding);
  assert.equal(capabilities.profile, null); assert.deepEqual([...capabilities.operations], []);
  for (const field of ['access', 'admission', 'quiescence', 'durability'] as const) assert.equal(capabilities[field], 'unavailable');
  const preview = await backend.preview(f.peer, plan());
  assert.equal(preview.informative, true); assert.equal(preview.snapshot, 'caller_export_unverified');
  assert.equal(preview.digest, planDigest(plan())); assert.equal(store.claims, 0);
  await assert.rejects(backend.preview({}, plan()), /authorization_required/);
  await assert.rejects(backend.probe({...plan().binding, protocol: 'maintenance/2'}), /protocol_invalid/);
});
test('all mutating operations remain unavailable even with valid consent and shaped session', async () => {
  for (const method of ['enter', 'apply', 'recover', 'leave'] as const) {
    const f = authorityFixture(), backend = new PortableMaintenanceBackend(f.policy);
    const action = {enter: 'interrupt', apply: 'apply', recover: 'recover', leave: 'reopen'} as const;
    const a = {...authorization(), action: action[method]}; f.state.consent = a;
    const request = {requestId: 'r1', plan: plan(), authorization: a};
    const r = method === 'apply' || method === 'leave' ? await backend[method](f.peer, {...request, session: session()}) : await backend[method](f.peer, request);
    assert.equal(r.outcome, 'rejected'); assert.equal(r.code, 'maintenance_exclusion_unavailable');
    assert.equal(r.admission, 'unknown'); assert.equal(r.evidenceRef, null);
  }
  const f = authorityFixture(), backend = new PortableMaintenanceBackend(f.policy);
  assert.equal((await backend.validate(f.peer, session())).code, 'maintenance_exclusion_unavailable');
  await assert.rejects(backend.inspect(f.peer, plan().binding, 'operation-1'), /exclusion_unavailable/);
});
test('backend composes authorization before atomic nonce claim and reauthenticates cached results', async () => {
  const f = authorityFixture(), store = new PersistenceDouble(), backend = new PortableMaintenanceBackend(f.policy, store);
  const request = {requestId: 'r1', plan: plan(), authorization: authorization()};
  assert.equal((await backend.enter({}, request)).code, 'maintenance_authorization_required');
  assert.equal(store.claims, 0);
  assert.deepEqual(store.rejections, [{protocol: 'maintenance/1', method: 'enter', code: 'maintenance_authorization_required'}]);
  const first = await backend.enter(f.peer, request);
  assert.deepEqual(await backend.enter(f.peer, request), first);
  assert.equal((await backend.enter(f.peer, {...request, requestId: 'r2'})).code, 'maintenance_authorization_stale');
  assert.equal(store.records.size, 1);
  f.state.consent = null;
  assert.equal((await backend.enter(f.peer, request)).code, 'maintenance_authorization_stale');
  assert.deepEqual(await backend.inspect(f.peer, plan().binding, 'operation-1'), [first]);
  await assert.rejects(backend.inspect({}, plan().binding, 'operation-1'), /authorization_required/);
});
test('backend lost acknowledgement is inspectable; storage failure and restart never reopen', async () => {
  const f = authorityFixture(), store = new PersistenceDouble(), backend = new PortableMaintenanceBackend(f.policy, store);
  const request = {requestId: 'r1', plan: plan(), authorization: authorization()};
  store.failure = 'complete-after';
  const r = await backend.enter(f.peer, request);
  assert.equal(r.outcome, 'indeterminate'); assert.equal(r.code, 'maintenance_outcome_indeterminate');
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  const reopened = new PortableMaintenanceBackend(f.policy, store.reopen());
  assert.equal((await reopened.enter(f.peer, request)).outcome, 'rejected');
  assert.equal((await reopened.inspect(f.peer, plan().binding, 'operation-1'))[0].code, 'maintenance_exclusion_unavailable');
  store.failure = 'read';
  await assert.rejects(backend.inspect(f.peer, plan().binding, 'operation-1'), /^MaintenanceError: maintenance_persistence_failed$/);
});
test('request snapshots reject client capability switches and freeze input before authentication awaits', async () => {
  const f = authorityFixture(), backend = new PortableMaintenanceBackend(f.policy);
  const request = {requestId: 'r1', plan: plan(), authorization: authorization()};
  await assert.rejects(backend.enter(f.peer, {...request, nativeCapable: true} as any), /protocol_invalid/);
  let calls = 0;
  await assert.rejects(backend.enter(f.peer, {...request, get plan() {calls++; return plan();}}), /protocol_invalid/);
  assert.equal(calls, 0);
  const pending = backend.enter(f.peer, request); request.plan.contentDigest = 'sha256:' + 'd'.repeat(64);
  assert.equal((await pending).code, 'maintenance_exclusion_unavailable');
});
test('audit storage failure cannot hide an unresolved intent or consume foreign consent', async () => {
  const f = authorityFixture(), store = new PersistenceDouble(), backend = new PortableMaintenanceBackend(f.policy, store);
  const request = {requestId: 'r1', plan: plan(), authorization: authorization()};
  store.failure = 'complete-before';
  assert.equal((await backend.enter(f.peer, request)).outcome, 'indeterminate');
  store.recordRejection = async () => {throw Error('SECRET audit failure');};
  assert.equal((await backend.enter(f.peer, request)).outcome, 'indeterminate');
  const foreign = await backend.enter({}, {...request, requestId: 'r2'});
  assert.equal(foreign.code, 'maintenance_persistence_failed');
  assert.equal(store.records.size, 1); assert.equal(store.nonces.size, 1);
  assert.ok(!JSON.stringify(foreign).includes('SECRET'));
});
