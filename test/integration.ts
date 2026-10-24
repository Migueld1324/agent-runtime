import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from '../src/paths.ts';

const runId = `smoke-${Date.now()}`;
const fileName = `note-${runId}.md`;
const target = join(WORKSPACE_DIR, fileName);
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    encoding: 'utf8', cwd: process.cwd(), env: process.env, timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`Command failed: ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const first = cli('start', runId, '--model', 'mock');
  assert.match(first, /approval/i);
  const status = cli('status', runId); // a different process, persisted checkpoint
  assert.match(status, /Requested write/);
  await assert.rejects(() => readFile(target, 'utf8'), { code: 'ENOENT' });
  const final = cli('approve', runId);  // a third process resumes the graph
  assert.match(final, /created/);
  assert.match(await readFile(target, 'utf8'), /deterministic offline mock model/);
  console.log('PASS: checkpoint persisted; new process resumed; file created only after approval.');
} finally {
  await rm(target, { force: true });
}
