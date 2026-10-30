import {PROTOCOL, type MaintenanceAuthorization, type MaintenancePlan} from '../../src/maintenance/contracts.ts';
import {planDigest} from '../../src/maintenance/digest.ts';

export const hash = (character = 'a') => 'sha256:' + character.repeat(64);
export function plan(): MaintenancePlan {
  return {protocol: PROTOCOL, planId: 'plan-1', operationId: 'operation-1', operationVersion: 1,
    operation: 'descriptor_replace', binding: {protocol: PROTOCOL, installationId: 'installation-1',
      generation: 1, rootIdentity: 'root-1', volumeIdentity: 'volume-1',
      inventory: [{id: 'registry', kind: 'registry', identity: 'registry-1', schema: 'descriptor/1', presence: 'present'}]},
    resources: ['registry'], sourceFingerprint: hash(), targetFingerprint: hash('b'), contentDigest: hash('c'),
    changes: ['replace descriptor'], restrictions: ['no grant transfer'], affectedGrants: [],
    preconditions: ['all runs terminal'], recovery: 'reconcile_exact', interruption: 'graceful'};
}
export function authorization(p = plan()): MaintenanceAuthorization {
  return {protocol: PROTOCOL, authorizationId: 'consent-1', principalId: 'admin-1', role: 'operator',
    policyId: 'administrative', policyVersion: 1, action: 'interrupt', planId: p.planId, planDigest: planDigest(p),
    installationId: p.binding.installationId, generation: p.binding.generation,
    nonce: 'nonce-1', notBefore: 100, expiresAt: 200, interruption: p.interruption};
}
