import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from '../paths.ts';
import { isSafeFileName } from '../policy.ts';
import { descriptorFingerprint, findTool } from '../v2/registry.ts';
import { evaluate, GrantStore } from '../v2/policy.ts';

const MAX_BYTES = 16_384;
export interface ObjectiveCriterion {
  id: 'objective-file';
  kind: 'workspace.file_content';
  version: 1;
  fileName: string;
  expectedContent: string;
}
export interface ObjectiveContext {
  runId: string; objective: string; scopeId: string; criterion: ObjectiveCriterion;
}
export interface VerificationEvidence {
  criterionId: string;
  criterionVersion: 1;
  criterionHash: string;
  outcome: 'passed' | 'failed' | 'inconclusive';
  reason: 'content_matches' | 'file_missing' | 'content_differs' | 'not_regular_file'
    | 'unsafe_resource' | 'policy_denied' | 'read_unavailable';
  checkedAt: string;
  retryable: boolean;
  actualHash?: string;
  bytes?: number;
  descriptorHash?: string;
}
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export function validateCriterion(value: unknown): ObjectiveCriterion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objective criterion is required');
  const c = value as Record<string, unknown>;
  if (Object.keys(c).some(k => !['id','kind','version','fileName','expectedContent'].includes(k)) ||
      c.id !== 'objective-file' || c.kind !== 'workspace.file_content' || c.version !== 1 ||
      typeof c.fileName !== 'string' || !isSafeFileName(c.fileName) ||
      typeof c.expectedContent !== 'string' || Buffer.byteLength(c.expectedContent, 'utf8') > MAX_BYTES) {
    throw new Error('Invalid objective criterion');
  }
  return {id:'objective-file',kind:'workspace.file_content',version:1,fileName:c.fileName,expectedContent:c.expectedContent};
}
export function criterionHash(context: ObjectiveContext): string {
  if (typeof context.runId !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(context.runId) ||
      typeof context.objective !== 'string' || !context.objective.trim() || context.objective.length > 2_000 ||
      typeof context.scopeId !== 'string' || !context.scopeId.trim()) throw new Error('Invalid objective context');
  return hash(JSON.stringify({runId:context.runId,objective:context.objective,scopeId:context.scopeId,
    criterion:validateCriterion(context.criterion)}));
}
export function assertObjective(context: ObjectiveContext & {stateVersion: number; criterionHash: string}): void {
  if (![1,2].includes(context.stateVersion)) throw new Error('Legacy or unsupported checkpoint: explicit migration required');
  if (criterionHash(context) !== context.criterionHash) throw new Error('Objective criterion changed; continuation refused');
}

/** Trusted, bounded read. Uses the registered read capability and current policy;
 * it never asks a model to evaluate its own output or executes a write to verify. */
export async function verifyObjective(context: ObjectiveContext): Promise<VerificationEvidence> {
  const criterion = validateCriterion(context.criterion);
  const base = {criterionId:criterion.id,criterionVersion:1 as const,criterionHash:criterionHash(context),
    checkedAt:new Date().toISOString(),retryable:false};
  const tool = await findTool('filesystem.read');
  const descriptorHash = descriptorFingerprint(tool);
  const evidence = {...base,descriptorHash};
  if (tool.adapter !== 'builtin.filesystem.read' || JSON.stringify(tool.effects) !== JSON.stringify(['read'])) {
    return {...evidence,outcome:'inconclusive',reason:'policy_denied'};
  }
  const grants = new GrantStore();
  try {
    if (evaluate(tool,{fileName:criterion.fileName},context.scopeId,grants) !== 'allow') {
      return {...evidence,outcome:'inconclusive',reason:'policy_denied'};
    }
  } finally { grants.close(); }
  try {
    const root = await lstat(WORKSPACE_DIR);
    if (!root.isDirectory() || root.isSymbolicLink()) return {...evidence,outcome:'inconclusive',reason:'unsafe_resource'};
    const path = join(WORKSPACE_DIR,criterion.fileName);
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) return {...evidence,outcome:'inconclusive',reason:'unsafe_resource'};
    if (!entry.isFile()) return {...evidence,outcome:'failed',reason:'not_regular_file'};
    const handle = await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) return {...evidence,outcome:'failed',reason:'not_regular_file'};
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const {bytesRead} = await handle.read(buffer,length,buffer.length-length,length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const actual = buffer.subarray(0,length);
      if (length > MAX_BYTES) return {...evidence,outcome:'failed',reason:'content_differs',bytes:length};
      const passed = actual.equals(Buffer.from(criterion.expectedContent,'utf8'));
      return {...evidence,outcome:passed ? 'passed' : 'failed',reason:passed ? 'content_matches' : 'content_differs',
        bytes:length,actualHash:hash(actual)};
    } finally { await handle.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {...evidence,outcome:'failed',reason:'file_missing'};
    if (code === 'ELOOP') return {...evidence,outcome:'inconclusive',reason:'unsafe_resource'};
    return {...evidence,outcome:'inconclusive',reason:'read_unavailable',
      retryable:['EAGAIN','EBUSY','EINTR','EIO','EMFILE','ENFILE','ETIMEDOUT'].includes(code ?? '')};
  }
}
