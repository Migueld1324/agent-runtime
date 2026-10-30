import {createNewStore, NEW_STORE_IDS, type NewStoreId} from './provision-stores.ts';
import {randomUUID} from 'node:crypto';
import {lstatSync, mkdirSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {dirname, join} from 'node:path';
import {parseBinding, fail, type InstallationBinding} from './contracts.ts';
import {physical, privateDirectory, syncDirectory, readRegular} from './local-storage.ts';

export const RESOURCE_LAYOUT = [
  ['runtime.sqlite', 'store', 'checkpoint-v1/1'],
  ['runtime-v2.sqlite', 'store', 'checkpoint-v2/1'],
  ['runtime-v3.sqlite', 'store', 'checkpoint-v3/1'],
  ['runtime-operations.sqlite', 'store', 'operations/1'],
  ['tool-grants-v2.sqlite', 'store', 'grants/1'],
  ['runtime-control.sqlite', 'control', 'control/1'],
  ['tool-registry', 'registry', 'descriptor/1+2'],
] as const;
export interface InventoryObservation {
  inventoryVersion: 'maintenance-inventory/1';
  binding: InstallationBinding;
  origin: 'local-filesystem';
  boundary: 'unavailable';
}
/** Explicit new provisioning only; no adoption of existing data or client identity. */
export function provisionInventory(root: string, initialize: readonly NewStoreId[] = []): InstallationBinding {
  if (new Set(initialize).size !== initialize.length || initialize.some(id=>!NEW_STORE_IDS.includes(id))) fail('maintenance_inventory_invalid');
  privateDirectory(dirname(root));
  mkdirSync(root, {mode: 0o700});
  mkdirSync(join(root, 'tool-registry'), {mode: 0o700});
  for (const id of initialize) createNewStore(root,id);
  syncDirectory(root); syncDirectory(dirname(root));
  return parseBinding({protocol: 'maintenance/1', installationId: randomUUID(), generation: 0,
    rootIdentity: physical(root), volumeIdentity: String(lstatSync(root, {bigint: true}).dev),
    inventory: RESOURCE_LAYOUT.flatMap(([id, kind, schema]) => [
      {id, kind, schema, presence: kind === 'registry' || initialize.includes(id as NewStoreId) ? 'present' : 'expected_absent',
        identity: kind === 'registry' || initialize.includes(id as NewStoreId) ? resourceIdentity(root, id) : 'never-created'},
      ...(kind === 'registry' ? [] : ['-wal', '-shm', '-journal'].map(suffix => ({id: id + suffix,
        kind: 'sidecar', schema: 'sqlite-sidecar/1', presence: 'expected_absent', identity: 'never-created'}))),
    ])});
}
/** This checks provenance against the protected binding, not against caller input.
 * Observations are not a claim of quiescence, terminality or historical truth. */
export function verifyInventory(root: string, trusted: InstallationBinding): InventoryObservation {
  try {
    const binding = parseBinding(trusted);
    privateDirectory(root);
    if (physical(root) !== binding.rootIdentity || String(lstatSync(root, {bigint: true}).dev) !== binding.volumeIdentity) fail('maintenance_inventory_invalid');
    const expected = RESOURCE_LAYOUT.flatMap(([id, kind]) => [id, ...(kind === 'registry' ? [] : ['-wal', '-shm', '-journal'].map(suffix => id + suffix))]);
    if (binding.inventory.length !== expected.length || expected.some(id => !binding.inventory.some(r => r.id === id))) fail('maintenance_inventory_invalid');
    const observed = new Set(readdirSync(root));
    for (const resource of binding.inventory) {
      if (resource.presence === 'expected_absent') {
        if (observed.has(resource.id) || resource.identity !== 'never-created') fail('maintenance_inventory_invalid');
      } else {
        if (!observed.has(resource.id) || resourceIdentity(root, resource.id) !== resource.identity) fail('maintenance_inventory_invalid');
        observed.delete(resource.id);
      }
    }
    if (observed.size) fail('maintenance_inventory_invalid');
    return {inventoryVersion: 'maintenance-inventory/1', binding, origin: 'local-filesystem', boundary: 'unavailable'};
  } catch { return fail('maintenance_inventory_invalid'); }
}

function resourceIdentity(root: string, id: string): string {
  const path=join(root,id), identity=physical(path);
  if(id!=='runtime-operations.sqlite') return identity;
  const bytes=readRegular(path,64*1024*1024);
  if(bytes.length<20 || bytes[18]!==1 || bytes[19]!==1 || readdirSync(root).some(name=>name.startsWith(id+'-'))) fail('maintenance_inventory_invalid');
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    const rows=db.prepare('SELECT id,version FROM metadata').all();
    if(rows.length!==1 || rows[0].version!==1 || typeof rows[0].id!=='string' || !/^[a-f0-9-]{36}$/.test(rows[0].id)) fail('maintenance_inventory_invalid');
    return identity+'/operations:'+rows[0].id;
  } finally {db.close();}
}
