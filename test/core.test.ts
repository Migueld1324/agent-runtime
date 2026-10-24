import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateWrite, isSafeFileName, contentHash, validateApproval } from '../src/policy.ts';
import { writeOnce } from '../src/tool.ts';
import { WORKSPACE_DIR } from '../src/paths.ts';

test('policy rejects paths and dangerous basenames', () => {
  for (const file of ['../secret.md', '.env.md', '/tmp/pwn.md', 'a/b.md', 'foo.txt', '..md']) {
    assert.equal(isSafeFileName(file), false, file);
    assert.equal(evaluateWrite(file, 'ok').decision, 'deny');
  }
  assert.equal(evaluateWrite('readme.md', 'ok').decision, 'require_approval');
});

test('approval binds exact run, file and contents', () => {
  const request = { runId: 'r1', fileName: 'doc.md', content: 'hello' };
  const ok = { decision: 'approve' as const, runId: 'r1', fileName: 'doc.md', contentHash: contentHash('hello') };
  assert.equal(validateApproval(ok, request), true);
  assert.equal(validateApproval({ ...ok, decision: 'deny' }, request), false);
  assert.throws(() => validateApproval({ ...ok, contentHash: contentHash('hacked') }, request));
  assert.throws(() => validateApproval({ ...ok, runId: 'r2' }, request));
});

test('writeOnce creates file idempotently and refuses clobber', async () => {
  const fileName = `test-${Date.now()}-${Math.random().toString(16).slice(2)}.md`;
  const path = join(WORKSPACE_DIR, fileName);
  try {
    assert.equal(await writeOnce(fileName, 'same'), 'created');
    assert.equal(await writeOnce(fileName, 'same'), 'already_exists');
    assert.equal(await readFile(path, 'utf8'), 'same');
    await assert.rejects(() => writeOnce(fileName, 'changed'), /refusing to overwrite/);
  } finally { await rm(path, { force: true }); }
});

test('writeOnce refuses symlink targets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-poc-'));
  const fileName = `symlink-${Date.now()}.md`;
  const target = join(WORKSPACE_DIR, fileName);
  try {
    await writeFile(join(dir, 'secret'), 'PRIVATE');
    await symlink(join(dir, 'secret'), target);
    await assert.rejects(() => writeOnce(fileName, 'hijack'), /not a regular file/);
    assert.equal(await readFile(join(dir, 'secret'), 'utf8'), 'PRIVATE');
  } finally {
    await rm(target, { force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
