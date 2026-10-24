import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { DATA_DIR } from '../paths.ts';
import type { ToolDescriptor } from './registry.ts';
import { descriptorFingerprint } from './registry.ts';
import { validateToolArguments, type ToolArguments } from './tools.ts';

export type AccessDecision = 'allow' | 'require_approval' | 'deny';
export type ApprovalAnswer = {
  decision: 'approve' | 'deny';
  runId: string;
  toolId: string;
  requestHash: string;
  remember: 'once' | 'workspace';
};
export function requestHash(tool: ToolDescriptor, args: ToolArguments): string {
  // The request binds the complete tool descriptor plus exact structured input.
  return createHash('sha256').update(JSON.stringify({ descriptor: descriptorFingerprint(tool), args })).digest('hex');
}
export function validateAnswer(answer: unknown, expected: { runId: string; tool: ToolDescriptor; args: ToolArguments }): ApprovalAnswer {
  if (!answer || typeof answer !== 'object') throw new Error('Invalid approval response');
  const parsed = answer as Partial<ApprovalAnswer>;
  if (parsed.runId !== expected.runId || parsed.toolId !== expected.tool.id ||
      parsed.requestHash !== requestHash(expected.tool, expected.args)) throw new Error('Approval does not match run/tool/arguments');
  if (parsed.decision !== 'approve' && parsed.decision !== 'deny') throw new Error('Invalid approval decision');
  if (parsed.remember !== 'once' && parsed.remember !== 'workspace') throw new Error('Invalid approval duration');
  if (parsed.remember === 'workspace' && expected.tool.adapter !== 'builtin.text.transform') {
    throw new Error('Persistent approval is restricted to text.transform in this PoC');
  }
  return parsed as ApprovalAnswer;
}
export class GrantStore {
  private db: DatabaseSync;
  constructor(fileName = join(DATA_DIR, 'tool-grants-v2.sqlite')) {
    mkdirSync(DATA_DIR, { recursive: true });
    this.db = new DatabaseSync(fileName);
    this.db.exec(`CREATE TABLE IF NOT EXISTS grants (
       capability TEXT NOT NULL, descriptor_hash TEXT NOT NULL, scope TEXT NOT NULL,
       created_at TEXT NOT NULL, PRIMARY KEY(capability, descriptor_hash, scope)
    )`);
  }
  hasGrant(tool: ToolDescriptor, scope: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM grants WHERE capability=? AND descriptor_hash=? AND scope=?')
      .get(tool.id, descriptorFingerprint(tool), scope);
  }
  addGrant(tool: ToolDescriptor, scope: string): void {
    if (tool.adapter !== 'builtin.text.transform') throw new Error('Only text.transform supports persisted grants in the PoC');
    this.db.prepare('INSERT OR IGNORE INTO grants VALUES (?, ?, ?, ?)')
      .run(tool.id, descriptorFingerprint(tool), scope, new Date().toISOString());
  }
  revokeGrant(tool: ToolDescriptor, scope: string): void {
    this.db.prepare('DELETE FROM grants WHERE capability=? AND descriptor_hash=? AND scope=?')
      .run(tool.id, descriptorFingerprint(tool), scope);
  }
  list(): {capability: string; scope: string; descriptor_hash: string}[] {
    return this.db.prepare('SELECT capability,scope,descriptor_hash FROM grants ORDER BY capability').all() as
      {capability: string; scope: string; descriptor_hash: string}[];
  }
  close(): void { this.db.close(); }
}
export function evaluate(tool: ToolDescriptor, args: ToolArguments, scope: string, grants: GrantStore): AccessDecision {
  try { validateToolArguments(tool, args); } catch { return 'deny'; }
  if (scope !== 'poc-workspace') return 'deny';
  if (tool.id === 'filesystem.read') return 'allow';
  if (tool.adapter === 'builtin.text.transform' && grants.hasGrant(tool, scope)) return 'allow';
  return 'require_approval';
}
