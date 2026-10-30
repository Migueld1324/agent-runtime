import {createHash} from 'node:crypto';
import {parsePlan, wireSnapshot} from './contracts.ts';

/** maintenance-canonical/1: sorted UTF-16 keys; ordered arrays; exact Unicode;
 * safe integers only; JSON escaping; no whitespace; UTF-8 encoding. */
export function canonical(value: unknown): string {
  const snapshot = wireSnapshot(value);
  function encode(v: unknown): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(encode).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + encode((v as Record<string, unknown>)[k])).join(',') + '}';
  }
  return encode(snapshot);
}
export function digestData(domain: 'plan' | 'request', value: unknown): string {
  return 'sha256:' + createHash('sha256').update(`maintenance/1\nmaintenance-canonical/1\n${domain}\n`, 'utf8').update(canonical(value), 'utf8').digest('hex');
}
export const planDigest = (value: unknown): string => digestData('plan', parsePlan(value));
