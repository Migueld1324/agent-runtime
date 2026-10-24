import { createHash } from 'node:crypto';

// PoC policy: a single named file in the sandbox workspace may be created
// only after exact-content approval. All other operations are denied.
export type PolicyDecision =
  | { decision: 'require_approval'; capabilityId: 'filesystem.write'; contentHash: string }
  | { decision: 'deny'; reason: string };

export interface Approval {
  decision: 'approve' | 'deny';
  runId: string;
  fileName: string;
  contentHash: string;
}

export const contentHash = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export function isSafeFileName(fileName: string): boolean {
  return /^(?!\.)(?!.*\.\.)([A-Za-z0-9_-][A-Za-z0-9_.-]{0,90})\.md$/.test(fileName);
}

export function evaluateWrite(fileName: string, content: string): PolicyDecision {
  if (!isSafeFileName(fileName)) {
    return { decision: 'deny', reason: 'Only safe .md basenames inside the PoC workspace are permitted' };
  }
  if (!content.trim() || Buffer.byteLength(content, 'utf8') > 16_384) {
    return { decision: 'deny', reason: 'File content is empty or exceeds the 16 KiB limit' };
  }
  return { decision: 'require_approval', capabilityId: 'filesystem.write', contentHash: contentHash(content) };
}

export function validateApproval(
  approval: unknown,
  expected: { runId: string; fileName: string; content: string },
): boolean {
  if (!approval || typeof approval !== 'object') throw new Error('Invalid approval payload');
  const value = approval as Partial<Approval>;
  if (value.runId !== expected.runId || value.fileName !== expected.fileName ||
      value.contentHash !== contentHash(expected.content)) {
    throw new Error('Approval does not match the exact run, target file, and contents');
  }
  if (value.decision === 'deny') return false;
  if (value.decision !== 'approve') throw new Error('Unknown approval decision');
  return true;
}
