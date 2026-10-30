import {readdirSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {descriptorFingerprint, validateManifest} from '../v2/registry.ts';
import {physical, readRegular, bytesDigest} from './local-storage.ts';
import {fail} from './contracts.ts';

/** Reads all entries without listTools' directory initialization. Historical grants
 * need not match the current descriptor: no grant is rewritten or transferred. */
export function inspectRegistry(directory: string): readonly {id: string; fingerprint: string; contentDigest: string}[] {
  try {
    physical(directory);
    if (!lstatSync(directory).isDirectory()) fail('maintenance_inventory_invalid');
    const ids = new Set<string>();
    return readdirSync(directory).sort().map(name => {
      if (!/^[a-z]+(?:\.[a-z]+)*\.json$/.test(name)) fail('maintenance_inventory_invalid');
      const bytes = readRegular(join(directory,name),8192);
      const descriptor = validateManifest(JSON.parse(bytes.toString('utf8')));
      if (name !== descriptor.id + '.json' || ids.has(descriptor.id)) fail('maintenance_inventory_invalid');
      ids.add(descriptor.id);
      return {id:descriptor.id,fingerprint:descriptorFingerprint(descriptor),contentDigest:bytesDigest(bytes)};
    });
  } catch { return fail('maintenance_inventory_invalid'); }
}
