/** Authority-only local storage primitives. Never exposed as client path APIs. */
import {createHash} from 'node:crypto';
import {constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, statfsSync, writeFileSync} from 'node:fs';
import {dirname, resolve, parse} from 'node:path';
import {fail} from './contracts.ts';

export function storageFailure(): never { return fail('maintenance_persistence_failed'); }
export const bytesDigest = (bytes: Uint8Array | string): string => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export function physical(path: string): string {
  const s = lstatSync(path, {bigint: true});
  if (s.isSymbolicLink() || (!s.isFile() && !s.isDirectory()) || (s.isFile() && s.nlink !== 1n)) storageFailure();
  return `${s.dev}:${s.ino}`;
}
/** Ancestors cannot be substituted by ordinary users. A sticky shared ancestor
 * (e.g. /tmp) is permitted only above a private authority-owned directory. */
export function privateDirectory(path: string): void {
  if (process.platform !== 'linux' || !process.getuid) storageFailure();
  if (resolve(path) !== path || realpathSync(path) !== path) storageFailure();
  const uid = process.getuid();
  const leaf = lstatSync(path);
  if (!leaf.isDirectory() || leaf.uid !== uid || (leaf.mode & 0o077)) storageFailure();
  let p = dirname(path);
  while (true) {
    const s = lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.uid !== 0 && s.uid !== uid) ||
        ((s.mode & 0o022) !== 0 && (s.mode & 0o1000) === 0)) storageFailure();
    if (p === parse(p).root) break;
    p = dirname(p);
  }
  // Initial local-only candidate profile; reject network and unknown filesystems.
  const type = Number(statfsSync(path).type);
  if (![0xef53, 0x58465342, 0x9123683e, 0x794c7630, 0x01021994].includes(type)) storageFailure();
}
export function protectedFile(path: string): void {
  privateDirectory(dirname(path));
  physical(path);
  const s = lstatSync(path);
  if (!s.isFile() || s.uid !== process.getuid!() || (s.mode & 0o077)) storageFailure();
}
export function syncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function writeExclusive(path: string, bytes: Uint8Array | string): void {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
export function readProtected(path: string, max = 4 * 1024 * 1024): Buffer {
  protectedFile(path);
  return readRegular(path, max);
}
export function readRegular(path: string, max = 4 * 1024 * 1024): Buffer {
  const before = physical(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const s = fstatSync(fd, {bigint: true});
    if (!s.isFile() || s.nlink !== 1n || `${s.dev}:${s.ino}` !== before || s.size > BigInt(max)) storageFailure();
    const bytes = readFileSync(fd);
    if (bytes.length > max || physical(path) !== before) storageFailure();
    return bytes;
  } finally { closeSync(fd); }
}
