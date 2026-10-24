import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateManifest, descriptorFingerprint, type ToolDescriptor } from '../src/v2/registry.ts';
import { GrantStore, evaluate, requestHash, validateAnswer } from '../src/v2/policy.ts';
import { validateToolArguments } from '../src/v2/tools.ts';

const manifest = {
  id: 'text.demo', version: '1.0.0', description: 'Trusted demo transformer',
  adapter: 'builtin.text.transform', effects: ['read'], operations: ['uppercase', 'lowercase'],
};
const scope = 'poc-workspace';
const tool: ToolDescriptor = validateManifest(manifest);
const args = { input: 'hola', operation: 'uppercase' };

test('accepts trusted manifest; rejects arbitrary execution and reserved IDs', () => {
  assert.equal(tool.id, 'text.demo');
  assert.throws(() => validateManifest({ ...manifest, adapter: '/bin/sh' }), /untrusted/);
  assert.throws(() => validateManifest({ ...manifest, id: 'filesystem.read' }), /Reserved/);
  assert.throws(() => validateManifest({ ...manifest, shell: 'rm -rf /' }), /Unexpected/);
});

test('descriptor fingerprint changes when declared operations change', () => {
  assert.notEqual(descriptorFingerprint(tool), descriptorFingerprint(validateManifest({ ...manifest, operations: ['uppercase'] })));
});

test('approval is bound to exact run, descriptor and input', () => {
  const approval = { decision: 'approve', runId: 'run-1', toolId: tool.id,
    requestHash: requestHash(tool, args), remember: 'workspace' };
  assert.equal(validateAnswer(approval, { runId: 'run-1', tool, args }).remember, 'workspace');
  assert.throws(() => validateAnswer(approval, { runId: 'run-2', tool, args }), /does not match/);
  assert.throws(() => validateAnswer(approval, { runId: 'run-1', tool, args: { ...args, input: 'changed' } }), /does not match/);
});

test('new capability initially requires approval; grants persist in SQLite; revoke works', () => {
  const store = new GrantStore(':memory:');
  try {
    assert.equal(evaluate(tool, args, scope, store), 'require_approval');
    store.addGrant(tool, scope);
    assert.equal(evaluate(tool, args, scope, store), 'allow');
    const changed = validateManifest({ ...manifest, version: '1.0.1' });
    assert.equal(evaluate(changed, args, scope, store), 'require_approval');
    assert.equal(evaluate(tool, args, 'other-scope', store), 'deny');
    store.revokeGrant(tool, scope);
    assert.equal(evaluate(tool, args, scope, store), 'require_approval');
  } finally { store.close(); }
});

test('invalid args cannot be approved or run', () => {
  const store = new GrantStore(':memory:');
  try {
    const unsafe = { input: 'hello', operation: 'delete-files' };
    assert.throws(() => validateToolArguments(tool, unsafe));
    assert.equal(evaluate(tool, unsafe, scope, store), 'deny');
  } finally { store.close(); }
});
