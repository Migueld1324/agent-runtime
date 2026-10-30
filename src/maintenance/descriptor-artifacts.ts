import {validateManifest, descriptorFingerprint} from '../v2/registry.ts';
import {type MaintenancePlan, fail} from './contracts.ts';
import type {ArtifactReference} from './artifacts.ts';

/** Storage verification only; no registry publication or permission transfer. */
export function verifyDescriptorArtifact(plan: MaintenancePlan, reference: ArtifactReference, bytes: Uint8Array): string | null {
  if (plan.operation !== 'descriptor_replace') return null;
  try {
    const descriptor = validateManifest(JSON.parse(Buffer.from(bytes).toString('utf8')));
    const expected = reference.purpose === 'backup' ? plan.sourceFingerprint : plan.targetFingerprint;
    if ('sha256:' + descriptorFingerprint(descriptor) !== expected) fail('maintenance_persistence_failed');
    return descriptor.id;
  } catch { return fail('maintenance_persistence_failed'); }
}
