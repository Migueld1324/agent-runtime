import {randomUUID} from 'node:crypto';
import {mkdirSync, lstatSync, readdirSync, chmodSync, openSync, closeSync, fsyncSync} from 'node:fs';
import {dirname, basename, join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {canonical} from './digest.ts';
import {bytesDigest, physical, privateDirectory, readProtected, readRegular, storageFailure, syncDirectory, writeExclusive} from './local-storage.ts';

export interface ArtifactReference { version: 'maintenance-artifact/1'; id: string; digest: string; bytes: number; purpose: 'backup' | 'staging'; }
/** Private, durable, immutable-by-API content storage. References must be placed in
 * the anchored journal before they can serve as evidence. No publish/delete API. */
export class MaintenanceArtifacts {
  readonly #directory: string;
  constructor(directory: string) { privateDirectory(directory); this.#directory = directory; }
  save(purpose: 'backup' | 'staging', content: Uint8Array, expectedDigest: string): ArtifactReference {
    if (!['backup','staging'].includes(purpose) || !(content instanceof Uint8Array) || content.length > 4 * 1024 * 1024) storageFailure();
    const bytes = Buffer.from(content);
    if (bytesDigest(bytes) !== expectedDigest) storageFailure();
    privateDirectory(this.#directory);
    const reference: ArtifactReference = {version: 'maintenance-artifact/1', id: randomUUID(), digest: expectedDigest, bytes: bytes.length, purpose};
    writeExclusive(join(this.#directory, reference.id), bytes);
    writeExclusive(join(this.#directory, reference.id + '.json'), canonical(reference));
    this.verify(reference);
    return Object.freeze(reference);
  }
  read(reference: ArtifactReference): Buffer {
    this.verify(reference);
    return readProtected(join(this.#directory,reference.id));
  }
  verify(reference: ArtifactReference): void {
    if (!/^[a-f0-9-]{36}$/.test(reference.id) || reference.version !== 'maintenance-artifact/1') storageFailure();
    const descriptor = readProtected(join(this.#directory, reference.id + '.json'));
    if (descriptor.toString() !== canonical(reference)) storageFailure();
    const bytes = readProtected(join(this.#directory, reference.id));
    if (bytes.length !== reference.bytes || bytesDigest(bytes) !== reference.digest) storageFailure();
  }
}

/** Captures all SQLite inputs into private evidence, then lets SQLite recover only
 * the copies. Source must be quiescent under a future M3 boundary before this
 * observation can support an operation. No flag supplied by a caller upgrades it. */
export function prepareInspectionSnapshot(source: string, destination: string): {
  database: string; receiptDigest: string; boundary: 'unavailable'; recoveryPerformedOnCopy: true;
} {
  privateDirectory(dirname(destination));
  physical(source);
  const names = readdirSync(dirname(source)).filter(name => name === basename(source) || name.startsWith(basename(source) + '-')).sort();
  if (names.some(name => ![basename(source), basename(source) + '-wal', basename(source) + '-shm', basename(source) + '-journal'].includes(name))) storageFailure();
  mkdirSync(destination, {mode: 0o700});
  const evidence = join(destination, 'evidence'), working = join(destination, 'working');
  mkdirSync(evidence, {mode: 0o700}); mkdirSync(working, {mode: 0o700});
  const records = names.map(name => {
    const path = join(dirname(source), name), identity = physical(path);
    if (!lstatSync(path).isFile() || lstatSync(path).size > 64 * 1024 * 1024) storageFailure();
    const bytes = readRegular(path, 64 * 1024 * 1024);
    writeExclusive(join(evidence, name), bytes); writeExclusive(join(working, name), bytes);
    return {name, identity, digest: bytesDigest(bytes)};
  });
  const encoded = canonical({version: 'maintenance-snapshot/1', boundary: 'unavailable', records});
  writeExclusive(join(destination, 'receipt.json'), encoded);
  // Detect observed changes, but never mistake this for an exclusion proof.
  for (const record of records) {
    const path = join(dirname(source), record.name);
    if (physical(path) !== record.identity || bytesDigest(readRegular(path, 64 * 1024 * 1024)) !== record.digest) storageFailure();
  }
  if (JSON.stringify(names) !== JSON.stringify(readdirSync(dirname(source)).filter(name => name === basename(source) || name.startsWith(basename(source) + '-')).sort())) storageFailure();
  const db = new DatabaseSync(join(working, basename(source)));
  const snapshot = join(destination, 'inspection.sqlite');
  try {
    db.exec('PRAGMA busy_timeout=0; PRAGMA trusted_schema=OFF');
    const check = db.prepare('PRAGMA integrity_check').all();
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') storageFailure();
    db.prepare('VACUUM INTO ?').run(snapshot);
  } finally { db.close(); }
  const copy = new DatabaseSync(snapshot);
  try { copy.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA'); } finally { copy.close(); }
  chmodSync(snapshot, 0o600);
  const fd = openSync(snapshot, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(destination);
  return {database: snapshot, receiptDigest: bytesDigest(encoded), boundary: 'unavailable', recoveryPerformedOnCopy: true};
}
