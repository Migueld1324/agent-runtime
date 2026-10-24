import type { jsonSchema } from 'ai';
import type { ToolDescriptor } from '../v2/registry.ts';

export function schemaFor(tool: ToolDescriptor): Parameters<typeof jsonSchema>[0] {
  if (tool.adapter === 'builtin.text.transform') return {
    type: 'object', additionalProperties: false,
    properties: {
      input: {type:'string', minLength:1, maxLength:2048, description:'Text to transform'},
      operation: {type:'string', enum:tool.operations ?? ['uppercase','lowercase','titlecase']},
    }, required:['input','operation'],
  };
  if (tool.adapter === 'builtin.filesystem.write') return {
    type:'object', additionalProperties:false,
    properties: {fileName:{type:'string', description:'Safe basename ending in .md (no paths)'},content:{type:'string'}},
    required:['fileName','content'],
  };
  return {
    type:'object', additionalProperties:false,
    properties:{fileName:{type:'string', description:'Safe basename ending in .md (no paths)'}},
    required:['fileName'],
  };
}
