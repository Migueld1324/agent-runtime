import {mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {type InstallationBinding, fail} from './contracts.ts';
import {verifyInventory, RESOURCE_LAYOUT} from './inventory.ts';
import {privateDirectory, syncDirectory} from './local-storage.ts';
import {prepareInspectionSnapshot} from './artifacts.ts';
import {inspectCheckpoints, inspectControl, inspectGrants, inspectOperationsInventory, type RunInspection} from './inspectors.ts';
import {inspectRegistry} from './registry-inspector.ts';

/** Authority composition: binding MUST come from the verified administrative
 * journal. The API cannot grant an exclusion capability or trust client exports. */
export function inspectProvisionedInstallation(root: string, binding: InstallationBinding, evidenceDirectory: string) {
  verifyInventory(root, binding);
  for (const [id,kind,schema] of RESOURCE_LAYOUT) {
    const resource = binding.inventory.find(r => r.id === id);
    if (resource?.kind !== kind || resource.schema !== schema) fail('maintenance_inventory_invalid');
  }
  privateDirectory(dirname(evidenceDirectory));
  mkdirSync(evidenceDirectory, {mode: 0o700}); syncDirectory(dirname(evidenceDirectory));
  const snapshots = new Map<string, ReturnType<typeof prepareInspectionSnapshot>>();
  for (const resource of binding.inventory) {
    if (resource.kind === 'store' && resource.presence === 'present') snapshots.set(resource.id,
      prepareInspectionSnapshot(join(root,resource.id),join(evidenceDirectory,resource.id)));
  }
  const runs: RunInspection[] = [];
  for (const [name,version] of [['runtime.sqlite','v1'],['runtime-v2.sqlite','v2'],['runtime-v3.sqlite','v3']] as const) {
    const snapshot = snapshots.get(name);
    if (snapshot) runs.push(...inspectCheckpoints(snapshot.database,version,snapshots.get('runtime-operations.sqlite')?.database).runs);
  }
  const operationsPath=snapshots.get('runtime-operations.sqlite')?.database;
  if (operationsPath) inspectOperationsInventory(operationsPath,runs.filter(run=>run.version==='v3').map(run=>run.runId));
  if (binding.inventory.some(r => r.id === 'runtime-control.sqlite' && r.presence === 'present')) inspectControl(join(root,'runtime-control.sqlite'));
  const grantsPath = snapshots.get('tool-grants-v2.sqlite')?.database;
  const grants = grantsPath ? inspectGrants(grantsPath) : [];
  const registry = inspectRegistry(join(root,'tool-registry'));
  verifyInventory(root,binding);
  return {version:'maintenance-inspection/1' as const, installationId:binding.installationId,generation:binding.generation,
    boundary:'unavailable' as const, runs, grants, registry,
    allRunsTerminal:runs.every(run=>run.terminal),
    snapshots:[...snapshots.entries()].map(([resource,snapshot])=>({resource,receiptDigest:snapshot.receiptDigest,recoveryPerformedOnCopy:true as const}))};
}
