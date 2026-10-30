import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STATES} from '../src/maintenance/contracts.ts';
import {transition, bootState, interrupted, reconcile, type Checks, type RecoveryFacts} from '../src/maintenance/state.ts';

const checks: Checks = Object.fromEntries(['authorized', 'generation', 'intentDurable', 'admissionClosed',
  'accessRevoked', 'quiescence', 'runtimeLock', 'planValid', 'backupDurable', 'preparedDurable',
  'resultDurable', 'destinationVerified', 'publisherRetired', 'handlesClosed', 'lockReleased',
  'closureDurable', 'compatibleExecutors', 'recoveryVerified', 'inventoryValid'].map(k => [k, 'confirmed']));
const allowed = new Set(['CLOSED:NORMAL', 'NORMAL:CLOSING', 'CLOSING:QUIESCENT', 'QUIESCENT:PREPARED',
  'PREPARED:PUBLISHING', 'PUBLISHING:VERIFIED', 'VERIFIED:CLOSED', 'CLOSING:QUARANTINED',
  'QUIESCENT:QUARANTINED', 'PREPARED:QUARANTINED', 'PUBLISHING:QUARANTINED',
  'VERIFIED:QUARANTINED', 'QUARANTINED:CLOSED']);
test('all 64 transitions match ADR-088; missing or unknown evidence cannot advance', () => {
  for (const from of STATES) for (const to of STATES) {
    if (allowed.has(`${from}:${to}`)) {
      assert.equal(transition(from, to, checks), to);
      if (to !== 'QUARANTINED') {
        assert.throws(() => transition(from, to, {}), /evidence_insufficient/);
        assert.throws(() => transition(from, to, Object.fromEntries(Object.keys(checks).map(k => [k, 'unknown']))), /evidence_insufficient/);
      }
    } else assert.throws(() => transition(from, to, checks), /evidence_insufficient/);
  }
  for (const key of ['publisherRetired', 'handlesClosed', 'lockReleased', 'closureDurable', 'compatibleExecutors'] as const) {
    assert.throws(() => transition('CLOSED', 'NORMAL', {...checks, [key]: 'unknown'}));
  }
  assert.throws(() => transition('QUARANTINED', 'CLOSED', {...checks, recoveryVerified: 'denied'}));
  assert.throws(() => transition('PREPARED', 'PUBLISHING', {...checks, authorized: 'denied'}));
});
test('boot ignores historical NORMAL; cancellation/loss/uncertainty never reopen', () => {
  for (const state of [...STATES, 'corrupt', null]) assert.equal(bootState(state), 'CLOSED');
  for (const state of STATES) for (const cause of ['cancel', 'authority_lost', 'storage_failed', 'unknown'] as const) {
    assert.equal(interrupted(state, cause), state === 'CLOSED' ? 'CLOSED' : 'QUARANTINED');
  }
});
const facts = (): RecoveryFacts => ({previousPublisherRetired: 'confirmed', exclusiveAccess: 'confirmed',
  identityAndGeneration: 'confirmed', inventoryValid: 'confirmed', intentDurable: 'confirmed', backupValid: 'confirmed',
  stagingCoherent: 'confirmed', preparedDurable: 'confirmed', destinationSynced: 'confirmed', terminalRuns: 'confirmed',
  active: 'source', recorded: 'none'});
test('recovery matrix recommends evidence only, never republishes or automatically reopens', () => {
  assert.equal(reconcile(facts()).outcome, 'not_applied');
  assert.equal(reconcile({...facts(), active: 'destination'}).outcome, 'applied');
  assert.equal(reconcile({...facts(), active: 'destination', recorded: 'applied'}).outcome, 'already_applied');
  assert.equal(reconcile({...facts(), recorded: 'applied'}).outcome, 'indeterminate');
  assert.equal(reconcile({...facts(), active: 'destination', recorded: 'not_applied'}).outcome, 'indeterminate');
  assert.equal(reconcile({...facts(), terminalRuns: 'denied'}).outcome, 'rejected');
  for (const key of ['previousPublisherRetired', 'exclusiveAccess', 'identityAndGeneration', 'inventoryValid', 'intentDurable', 'backupValid'] as const) {
    for (const value of ['unknown', 'denied'] as const) assert.equal(reconcile({...facts(), [key]: value}).outcome, 'indeterminate');
  }
  for (const active of ['source', 'destination', 'unexpected', 'unknown'] as const) for (const recorded of ['none', 'applied', 'not_applied', 'unknown'] as const) {
    const d = reconcile({...facts(), active, recorded});
    assert.equal(d.publish, false); assert.equal(d.reopen, false); assert.equal(d.state, 'QUARANTINED');
  }
  assert.equal(reconcile({...facts(), active: 'destination', destinationSynced: 'unknown'}).outcome, 'indeterminate');
  assert.equal(reconcile({...facts(), active: 'destination', preparedDurable: 'unknown'}).outcome, 'indeterminate');
});
