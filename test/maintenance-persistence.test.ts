import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseResult} from '../src/maintenance/contracts.ts';
import {RequestLedger, requestIdentity} from '../src/maintenance/persistence.ts';
import {authorization, plan, PersistenceDouble} from './helpers/maintenance.ts';

const identity = (id = 'request-1') => requestIdentity(id, 'enter', 'operation-1', authorization(), {plan: plan(), authorization: authorization()});
const result = () => parseResult({protocol: 'maintenance/1', operationId: 'operation-1', outcome: 'applied',
  code: null, evidenceRef: 'durable-evidence-1', admission: 'closed'});
test('lost response and reopen return the exact result without a second effect', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store), id = identity();
  assert.equal(await ledger.claim(id), null);
  await ledger.complete(id, result());
  const reopened = new RequestLedger(store.reopen());
  assert.deepEqual(await reopened.claim(id), result());
  await assert.rejects(reopened.claim({...id, contentDigest: 'sha256:' + '0'.repeat(64)}), /request_conflict/);
  await assert.rejects(reopened.claim(identity('request-2')), /authorization_stale/);
});
test('concurrent claims have a single owner and do not treat pending intent as success', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store);
  const outcomes = await Promise.allSettled([ledger.claim(identity()), ledger.claim(identity())]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
  assert.equal(store.records.size, 1);
  await assert.rejects(new RequestLedger(store.reopen()).claim(identity()), /outcome_indeterminate/);
});
test('request identity cannot be reused by another principal, generation, action or operation', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store), id = identity();
  await ledger.claim(id);
  for (const patch of [{principalId: 'other'}, {generation: 2}, {method: 'recover' as const}, {operationId: 'other'}, {authorizationId: 'other', nonce: 'other'}]) {
    await assert.rejects(ledger.claim({...id, ...patch}), /request_conflict/);
  }
  assert.equal(store.nonces.size, 1);
  await assert.rejects(ledger.complete(id, {...result(), operationId: 'other'}), /persistence_failed/);
});
test('corrupt persisted result is rejected; completed receipts cannot be overwritten', async () => {
  const store = new PersistenceDouble(), ledger = new RequestLedger(store), id = identity();
  await ledger.claim(id); await ledger.complete(id, result());
  await assert.rejects(ledger.complete(id, {...result(), evidenceRef: 'different'}), /outcome_indeterminate/);
  assert.deepEqual(await ledger.claim(id), result());
  const record = store.records.get(store.key(id))!;
  record.result = {...result(), protocol: 'future'} as any;
  await assert.rejects(ledger.claim(id), /^MaintenanceError: maintenance_persistence_failed$/);
  record.result = {...result(), operationId: 'foreign'};
  await assert.rejects(ledger.claim(id), /persistence_failed/);
});
for (const failure of ['claim-before', 'claim-after', 'complete-before', 'complete-after'] as const) {
  test(`storage fault ${failure} neither invents success nor permits automatic execution`, async () => {
    const store = new PersistenceDouble(), ledger = new RequestLedger(store), id = identity();
    if (failure.startsWith('claim')) {
      store.failure = failure;
      await assert.rejects(ledger.claim(id), /^MaintenanceError: maintenance_persistence_failed$/);
      assert.equal(store.records.size, failure === 'claim-before' ? 0 : 1);
    } else {
      await ledger.claim(id); store.failure = failure;
      await assert.rejects(ledger.complete(id, result()), /^MaintenanceError: maintenance_outcome_indeterminate$/);
      const reopened = new RequestLedger(store.reopen());
      if (failure === 'complete-after') assert.deepEqual(await reopened.claim(id), result());
      else await assert.rejects(reopened.claim(id), /outcome_indeterminate/);
    }
  });
}
