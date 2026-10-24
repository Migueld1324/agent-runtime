import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from '../paths.ts';
import { isSafeFileName } from '../policy.ts';
import { writeOnce } from '../tool.ts';
import type { ToolDescriptor } from './registry.ts';

export type ToolArguments = { fileName?: string; content?: string; input?: string; operation?: string };
export function validateToolArguments(tool: ToolDescriptor, args: ToolArguments): void {
  if (tool.adapter === 'builtin.text.transform') {
    if (typeof args.input !== 'string' || args.input.length < 1 || args.input.length > 2_048 ||
        typeof args.operation !== 'string' || !tool.operations?.includes(args.operation as 'uppercase')) {
      throw new Error('Invalid text.transform input / operation');
    }
  } else {
    if (typeof args.fileName !== 'string' || !isSafeFileName(args.fileName)) throw new Error('Invalid workspace filename');
    if (tool.id === 'filesystem.write' && (typeof args.content !== 'string' || !args.content.trim() ||
        Buffer.byteLength(args.content, 'utf8') > 16_384)) throw new Error('Invalid write content');
  }
}
export async function executeTool(tool: ToolDescriptor, args: ToolArguments): Promise<string> {
  // Gateway validates before and during execution. In production, filesystem access
  // also needs OS-level isolation to prevent races and compromised processes.
  validateToolArguments(tool, args);
  if (tool.adapter === 'builtin.text.transform') {
    const input = args.input!;
    if (args.operation === 'uppercase') return input.toUpperCase();
    if (args.operation === 'lowercase') return input.toLowerCase();
    if (args.operation === 'titlecase') return input.toLowerCase().replace(/\b\p{L}/gu, (x) => x.toUpperCase());
    throw new Error('Unsupported transform operation');
  }
  if (tool.adapter === 'builtin.filesystem.write') {
    return `filesystem.write: ${await writeOnce(args.fileName!, args.content!)} (${args.fileName})`;
  }
  if (tool.adapter === 'builtin.filesystem.read') {
    const dir = await lstat(WORKSPACE_DIR);
    if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Unsafe workspace root');
    const path = join(WORKSPACE_DIR, args.fileName!);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384) throw new Error('Unsafe read target');
    return (await readFile(path, 'utf8')).slice(0, 16_384);
  }
  throw new Error('No trusted executor for tool');
}
