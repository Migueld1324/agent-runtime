import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../paths.ts';

export type ToolId = string;
export type ToolDescriptor = {
  id: ToolId;
  version: string;
  description: string;
  adapter: 'builtin.filesystem.read' | 'builtin.filesystem.write' | 'builtin.text.transform';
  effects: ('read' | 'write')[];
  operations?: ('uppercase' | 'lowercase' | 'titlecase')[];
};
const REGISTRY_DIR = join(DATA_DIR, 'tool-registry');
const builtinTools: ToolDescriptor[] = [
  { id: 'filesystem.read', version: '1.0.0', description: 'Read a safe Markdown filename within the PoC workspace', adapter: 'builtin.filesystem.read', effects: ['read'] },
  { id: 'filesystem.write', version: '1.0.0', description: 'Create a safe Markdown filename within the PoC workspace', adapter: 'builtin.filesystem.write', effects: ['write'] },
];
const ID_PATTERN = /^[a-z]+(?:\.[a-z]+)*$/;
export function validateManifest(input: unknown): ToolDescriptor {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid manifest');
  const obj = input as Record<string, unknown>;
  if (!ID_PATTERN.test(String(obj.id ?? '')) || typeof obj.description !== 'string' || obj.description.length > 300 ||
      !/^\d+\.\d+\.\d+$/.test(String(obj.version ?? ''))) throw new Error('Invalid tool metadata');
  // A manifest cannot supply JS, shell commands, a path, or a URL as an executor.
  // This demonstration only registers a tool for a pre-reviewed built-in adapter.
  if (['filesystem.read', 'filesystem.write'].includes(String(obj.id)) || obj.adapter !== 'builtin.text.transform') {
    throw new Error('Reserved capability ID or unknown/untrusted adapter');
  }
  if (JSON.stringify(obj.effects) !== JSON.stringify(['read'])) throw new Error('Invalid effects');
  const operations = obj.operations;
  if (!Array.isArray(operations) || operations.length === 0 ||
      operations.some((op) => !['uppercase', 'lowercase', 'titlecase'].includes(op)) ||
      new Set(operations).size !== operations.length) throw new Error('Invalid transform operations');
  const acceptedKeys = new Set(['id', 'version', 'description', 'adapter', 'effects', 'operations']);
  if (Object.keys(obj).some((key) => !acceptedKeys.has(key))) throw new Error('Unexpected manifest property');
  return {
    id: String(obj.id), adapter: 'builtin.text.transform', version: String(obj.version),
    description: obj.description, effects: ['read'], operations: operations as ToolDescriptor['operations'],
  };
}
export function descriptorFingerprint(tool: ToolDescriptor): string {
  return createHash('sha256').update(JSON.stringify(tool)).digest('hex');
}
export async function listTools(): Promise<ToolDescriptor[]> {
  const tools = [...builtinTools];
  await mkdir(REGISTRY_DIR, { recursive: true });
  for (const name of await readdir(REGISTRY_DIR)) {
    if (!name.endsWith('.json')) continue;
    const file = join(REGISTRY_DIR, name);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe registered manifest: ${name}`);
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    tools.push(validateManifest(parsed));
  }
  return tools;
}
export async function findTool(id: string): Promise<ToolDescriptor> {
  const matches = (await listTools()).filter((tool) => tool.id === id);
  if (matches.length !== 1) throw new Error(`Tool not registered or ambiguous: ${id}`);
  return matches[0];
}
export async function registerTool(manifestPath: string): Promise<ToolDescriptor> {
  const stat = await lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_192) throw new Error('Unsafe tool manifest');
  const descriptor = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown);
  await mkdir(REGISTRY_DIR, { recursive: true });
  const target = join(REGISTRY_DIR, `${descriptor.id}.json`);
  // Refuse silent upgrades; v0.2 has no trust migration flow.
  await copyFile(manifestPath, target, constants.COPYFILE_EXCL);
  return descriptor;
}
