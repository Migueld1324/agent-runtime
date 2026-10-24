import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from '../src/paths.ts';
import { findTool, registerTool } from '../src/v2/registry.ts';

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/v2/cli.ts', ...args], {
    encoding: 'utf8', cwd: process.cwd(), timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`FAILED: ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const fileName = `v2-${stamp}.md`;
const target = join(WORKSPACE_DIR, fileName);
try {
  try { await findTool('text.transform'); }
  catch { await registerTool('examples/text-transform.tool.json'); }
  const tool = await findTool('text.transform');
  cli('grants', 'revoke', tool.id);
  const pending = cli('start', `v2-pending-${stamp}`, '--tool', tool.id, '--input', 'hola agente', '--operation', 'uppercase');
  assert.match(pending, /WAITING_APPROVAL/);
  const pendingStatus = cli('status', `v2-pending-${stamp}`);
  assert.match(pendingStatus, /WAITING_APPROVAL/);
  const approved = cli('approve', `v2-pending-${stamp}`, '--remember', 'workspace');
  assert.match(approved, /COMPLETED/);
  assert.match(approved, /HOLA AGENTE/);
  const again = cli('start', `v2-granted-${stamp}`, '--tool', tool.id, '--input', 'otra prueba', '--operation', 'uppercase');
  assert.match(again, /COMPLETED/);
  assert.doesNotMatch(again, /WAITING_APPROVAL/);
  cli('grants', 'revoke', tool.id);
  const afterRevoke = cli('start', `v2-revoked-${stamp}`, '--tool', tool.id, '--input', 'otra', '--operation', 'lowercase');
  assert.match(afterRevoke, /WAITING_APPROVAL/);
  const write = cli('start', `v2-write-${stamp}`, '--tool', 'filesystem.write', '--file', fileName, '--content', '# PoC 0.2');
  assert.match(write, /WAITING_APPROVAL/);
  await assert.rejects(() => readFile(target, 'utf8'), { code: 'ENOENT' });
  const denied = cli('deny', `v2-write-${stamp}`);
  assert.match(denied, /DENIED/);
  await assert.rejects(() => readFile(target, 'utf8'), { code: 'ENOENT' });
  const write2 = cli('start', `v2-write-ok-${stamp}`, '--tool', 'filesystem.write', '--file', fileName, '--content', '# PoC 0.2');
  assert.match(write2, /WAITING_APPROVAL/);
  const writeResult = cli('approve', `v2-write-ok-${stamp}`);
  assert.match(writeResult, /COMPLETED/);
  const read = cli('start', `v2-read-${stamp}`, '--tool', 'filesystem.read', '--file', fileName);
  assert.match(read, /COMPLETED/);
  assert.match(read, /# PoC 0.2/);
  console.log('PASS: tool registered dynamically; approval persisted across processes; grant reused/revoked; read/write policies enforced.');
} finally {
  await rm(target, { force: true });
}
