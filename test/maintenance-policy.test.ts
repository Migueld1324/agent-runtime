import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS} from '../src/maintenance/contracts.ts';
import {MaintenancePolicy, applyAction} from '../src/maintenance/policy.ts';
import {authorization, authorityFixture, plan, hash} from './helpers/maintenance.ts';

test('administrative actions require their own trusted identity, role and consent', async () => {
  for (const action of ACTIONS) {
    const p = plan(), f = authorityFixture(p), a = {...authorization(p), action};
    f.state.consent = a;
    assert.equal((await f.policy.authorize(f.peer, a, p, action)).action, action);
    await assert.rejects(f.policy.authorize({principalId: 'admin-1', role: 'operator'}, a, p, action), /authorization_required/);
    await assert.rejects(f.policy.authorize(f.peer, {...a, principalId: 'other'}, p, action), /authorization_required/);
    await assert.rejects(f.policy.authorize(f.peer, {capability: 'write', descriptor_hash: hash(), scope: '*'}, p, action), /protocol_invalid/);
    f.state.policy.permissions = {operator: ACTIONS.filter(other => other !== action)};
    await assert.rejects(f.policy.authorize(f.peer, a, p, action), /authorization_required/);
  }
  const p = plan(); assert.equal(applyAction(p), 'apply');
  p.operation = 'historical_grant_revoke'; assert.equal(applyAction(p), 'revoke_historical');
});

test('policy rechecks expiration, revocation, version and exact consent on every action', async () => {
  const p = plan(), f = authorityFixture(p), a = authorization(p);
  for (const now of [99, 200, 201, NaN]) {
    f.state.now = now;
    await assert.rejects(f.policy.authorize(f.peer, a, p, 'interrupt'), /authorization_stale/);
  }
  f.state.now = 100;
  await f.policy.authorize(f.peer, a, p, 'interrupt');
  f.state.consent = null;
  await assert.rejects(f.policy.authorize(f.peer, a, p, 'interrupt'), /authorization_stale/);
  f.state.consent = a;
  f.state.policy.version++;
  await assert.rejects(f.policy.authorize(f.peer, a, p, 'interrupt'), /authorization_stale/);
  f.state.policy.version--;
  for (const patch of [{nonce: 'forged'}, {authorizationId: 'other'}, {action: 'apply'}, {expiresAt: 999}, {interruption: 'forced'}]) {
    await assert.rejects(f.policy.authorize(f.peer, {...a, ...patch}, p, 'interrupt'), /authorization_stale/);
  }
  const changed = plan(); changed.contentDigest = hash('d');
  await assert.rejects(f.policy.authorize(f.peer, a, changed, 'interrupt'), /plan_stale/);
  changed.contentDigest = p.contentDigest; changed.binding.generation++;
  await assert.rejects(f.policy.authorize(f.peer, a, changed, 'interrupt'), /plan_stale/);
});

test('inspection is separately authenticated and authority failures reveal no diagnostics', async () => {
  const f = authorityFixture();
  await f.policy.inspect(f.peer);
  await assert.rejects(f.policy.inspect({}), /authorization_required/);
  f.state.policy.permissions = {operator: ['apply']};
  await assert.rejects(f.policy.inspect(f.peer), /authorization_required/);
  const policy = new MaintenancePolicy({...f.authority, authenticate: async () => {throw Error('SECRET');}});
  await assert.rejects(policy.authorize(f.peer, authorization(), plan(), 'interrupt'), /^MaintenanceError: maintenance_authorization_required$/);
});
