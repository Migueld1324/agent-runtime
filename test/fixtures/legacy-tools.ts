// Frozen pure validator from 7d87338; do not delegate to the new contract.
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WORKSPACE_DIR } from '../../src/paths.ts';
import { isSafeFileName } from '../../src/policy.ts';
import { writeOnce } from '../../src/tool.ts';
import type { ToolDescriptor } from '../../src/v2/registry.ts';

export type ToolArguments = { fileName?: string; content?: string; input?: string; operation?: string };
export function validateToolArguments(tool: ToolDescriptor, args: ToolArguments): void {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments');
  const allowed = tool.adapter === 'builtin.text.transform' ? ['input', 'operation']
    : tool.adapter === 'builtin.filesystem.write' ? ['fileName', 'content'] : ['fileName'];
  if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unexpected tool argument');
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
