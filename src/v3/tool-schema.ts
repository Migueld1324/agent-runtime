import { inputSchemaFor, type ToolDescriptor } from '../v2/registry.ts';
export const schemaFor = inputSchemaFor;
export function constraintsFor(tool:ToolDescriptor):string {
  return tool.adapter==='builtin.text.transform' ? 'Input must contain 1 to 2048 UTF-16 code units; only declared operations are allowed.' : 'Safe Markdown basename in workspace only; regular files, no symlinks. Writes require nonblank content of at most 16384 UTF-8 bytes, without overwrite.';
}
