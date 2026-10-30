import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PortableMaintenanceBackend} from '../src/maintenance/backend.ts';
import {MaintenancePolicy} from '../src/maintenance/policy.ts';
import {RequestLedger, requestIdentity, type RequestRecord} from '../src/maintenance/persistence.ts';
import {authorization, authorityFixture, plan, PersistenceDouble} from './helpers/maintenance.ts';

const identity = () => requestIdentity('r1', 'enter', 'operation-1', authorization(), {plan: plan(), authorization: authorization()});
const record = (): RequestRecord => ({identity: identity(), result: {protocol: 'maintenance/1', operationId: 'operation-1',
  outcome: 'applied', code: null, evidenceRef: 'e1', admission: 'closed'}});
const failure = /^MaintenanceError: maintenance_persistence_failed$/;
async function inspect(records: unknown) {
  const f = authorityFixture(), store = new PersistenceDouble();
  store.readOperation = async () => records as RequestRecord[];
  return new PortableMaintenanceBackend(f.policy, store).inspect(f.peer, plan().binding, 'operation-1');
}

test('inspection validates every identity field, not just installation/generation/operation', async () => {
  const bad: Record<string, unknown> = {protocol: 'maintenance/2', installationId: '', generation: -1, requestId: '../bad',
    operationId: '', method: 'execute', contentDigest: 'not-a-digest', principalId: '', authorizationId: 42, nonce: ''};
  const accepted: string[] = [];
  for (const key of Object.keys(identity())) {
    for (const mode of ['missing', 'malformed']) {
      const r = structuredClone(record()) as any;
      if (mode === 'missing') delete r.identity[key]; else r.identity[key] = bad[key];
      try { await inspect([r]); accepted.push(`${key}:${mode}`); }
      catch (error) { assert.match(String(error), failure); }
    }
  }
  assert.deepEqual(accepted, []);
});

test('inspection rejects partial result envelopes instead of interpreting falsy values as pending', async () => {
  for (const result of [undefined, false, 0, '']) {
    const r: any = structuredClone(record());
    if (result === undefined) delete r.result; else r.result = result;
    await assert.rejects(inspect([r]), failure);
  }
  await assert.rejects(inspect([{...record(), unexpected: true}]), failure);
  await assert.rejects(inspect([{...record(), identity: {...identity(), unexpected: true}}]), failure);
  const pending = await inspect([{...record(), result: null}]);
  assert.equal(pending[0].outcome, 'indeterminate');
});

test('inspection rejects sparse collections and accessors without evaluating them', async () => {
  await assert.rejects(inspect([, record()]), failure);
  let calls = 0;
  const r = structuredClone(record());
  Object.defineProperty(r.identity, 'principalId', {enumerable: true, get() {calls++; return 'admin-1';}});
  await assert.rejects(inspect([r]), failure);
  assert.equal(calls, 0);
});

test('inspection rejects duplicate requests and nonce reuse in an operation snapshot', async () => {
  const r = record();
  await assert.rejects(inspect([r, {...r, result: null}]), failure);
  await assert.rejects(inspect([r, {...r, identity: {...r.identity, requestId: 'r2'}}]), failure);
  // Different requests with different nonces are legitimate history.
  assert.equal((await inspect([r, {...r, identity: {...r.identity, requestId: 'r2', nonce: 'n2'}}])).length, 2);
});

test('ledger rejects malformed identities before claiming or completing storage', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store);
  const malformed = {...identity(), contentDigest: 'bad'};
  await assert.rejects(ledger.claim(malformed), failure);
  assert.equal(store.claims, 0);
  let writes = 0; store.complete = async () => { writes++; };
  await assert.rejects(ledger.complete(malformed, record().result!), failure);
  assert.equal(writes, 0);
});

test('ledger rejects contradictory claim envelopes and unexpected record fields', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store);
  for (const response of [{kind: 'new', record: record()}, {kind: 'existing', record: {...record(), extra: true}},
    {kind: 'existing', record: record(), extra: true}, {kind: 'conflict', record: record()}, {kind: 'replay', extra: true}]) {
    store.claim = async () => response as any;
    await assert.rejects(ledger.claim(identity()), failure);
  }
});

test('historical inspection uses independent current authority before reading storage', async () => {
  const f = authorityFixture(), store = new PersistenceDouble();
  let reads = 0; store.readOperation = async () => {reads++; return [record()];};
  // Historical administrator may be revoked; the auditor is a different principal.
  const peer = {};
  const policy = new MaintenancePolicy({...f.authority,
    authenticate: async context => context === peer ? {id: 'auditor-2', roles: ['auditor']} : null,
    policy: async () => ({id: 'audit', version: 2, permissions: {auditor: ['inspect'] as const}}),
    consent: async () => {throw Error('must not consult old consent');}});
  const backend = new PortableMaintenanceBackend(policy, store);
  assert.equal((await backend.inspect(peer, plan().binding, 'operation-1'))[0].outcome, 'applied');
  await assert.rejects(backend.inspect({}, plan().binding, 'operation-1'), /authorization_required/);
  assert.equal(reads, 1); assert.equal(store.claims, 0); assert.equal(store.nonces.size, 0);
});

test('deduplication compares the complete identity and reauthorizes before cache lookup', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store);
  for (const patch of [{method: 'recover'}, {principalId: 'other'}, {authorizationId: 'other'}, {nonce: 'other'},
    {requestId: 'r2'}, {generation: 2}, {contentDigest: 'sha256:' + 'b'.repeat(64)}]) {
    store.claim = async () => ({kind: 'existing', record: {...record(), identity: {...identity(), ...patch}}}) as any;
    await assert.rejects(ledger.claim(identity()), failure);
  }
  const f = authorityFixture(), validStore = new PersistenceDouble(), backend = new PortableMaintenanceBackend(f.policy, validStore);
  const request = {requestId: 'r1', plan: plan(), authorization: authorization()};
  await backend.enter(f.peer, request);
  const claims = validStore.claims;
  f.state.now = 200;
  assert.equal((await backend.enter(f.peer, request)).code, 'maintenance_authorization_stale');
  f.state.now = 150; f.state.policy.permissions = {operator: ['inspect']};
  assert.equal((await backend.enter(f.peer, request)).code, 'maintenance_authorization_required');
  assert.equal(validStore.claims, claims);
});

test('identity validators reject trailing line terminators in request IDs and digests', async () => {
  for (const suffix of ['\n', '\r', '\r\n']) {
    for (const field of ['requestId', 'contentDigest'] as const) {
      const store = new PersistenceDouble(), ledger = new RequestLedger(store);
      await assert.rejects(ledger.claim({...identity(), [field]: identity()[field] + suffix}), failure);
      assert.equal(store.claims, 0);
    }
  }
});
