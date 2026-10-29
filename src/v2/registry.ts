import { createHash } from 'node:crypto';
import { mkdir, readdir, lstat, open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import {canonical, compiled, dataObject, freeze, validateSchema, type InputSchema} from './input-contract.ts';
import { join } from 'node:path';
import { DATA_DIR } from '../paths.ts';

export type ToolId = string;
type DescriptorBase = {
  id: ToolId;
  version: string;
  description: string;
  adapter: 'builtin.filesystem.read' | 'builtin.filesystem.write' | 'builtin.text.transform';
  effects: ('read' | 'write')[];
};
export type ToolDescriptor = DescriptorBase & (
  {descriptorVersion?:never; inputSchema?:never; operations?:('uppercase'|'lowercase'|'titlecase')[]} |
  {descriptorVersion:2; inputSchema:InputSchema; operations?:never}
);
const REGISTRY_DIR = join(DATA_DIR, 'tool-registry');
const builtinTools: ToolDescriptor[] = [
  { id: 'filesystem.read', version: '1.0.0', description: 'Read a safe Markdown filename within the PoC workspace', adapter: 'builtin.filesystem.read', effects: ['read'] },
  { id: 'filesystem.write', version: '1.0.0', description: 'Create a safe Markdown filename within the PoC workspace', adapter: 'builtin.filesystem.write', effects: ['write'] },
];
const ID_PATTERN = /^[a-z]+(?:\.[a-z]+)*$/;
export function validateManifest(input: unknown): ToolDescriptor {
  if (!dataObject(input)) throw new Error('Invalid manifest');
  if (Buffer.byteLength(JSON.stringify(input),'utf8') > 8192) throw new Error('Unsafe tool manifest');
  const obj = input as Record<string, unknown>;
  if (!ID_PATTERN.test(String(obj.id ?? '')) || typeof obj.description !== 'string' || obj.description.length > 300 ||
      !/^\d+\.\d+\.\d+$/.test(String(obj.version ?? ''))) throw new Error('Invalid tool metadata');
  // A manifest cannot supply JS, shell commands, a path, or a URL as an executor.
  // This demonstration only registers a tool for a pre-reviewed built-in adapter.
  if (['filesystem.read', 'filesystem.write'].includes(String(obj.id)) || obj.adapter !== 'builtin.text.transform') {
    throw new Error('Reserved capability ID or unknown/untrusted adapter');
  }
  if (JSON.stringify(obj.effects) !== JSON.stringify(['read'])) throw new Error('Invalid effects');
  if (Object.hasOwn(obj,'descriptorVersion')) {
    if(typeof obj.id!=='string' || typeof obj.version!=='string' || obj.descriptorVersion!==2 || Object.keys(obj).some(k=>!['descriptorVersion','id','version','description','adapter','effects','inputSchema'].includes(k))) throw new Error('Invalid descriptor version or property');
    const schema=validateSchema(obj.inputSchema);
    const input=schema.properties.input, operation=schema.properties.operation;
    if(Object.keys(schema.properties).sort().join(',')!=='input,operation' || !input || !operation ||
      input.minLength===undefined || input.minLength<1 || input.maxLength===undefined || input.maxLength>1024 ||
      !operation.enum || operation.enum.some(op=>!['uppercase','lowercase','titlecase'].includes(op))) throw new Error('Schema incompatible with transform adapter');
    const descriptor=freeze(JSON.parse(JSON.stringify({...obj,inputSchema:schema}))) as ToolDescriptor;
    compiled('2:'+descriptorFingerprint(descriptor),schema);
    return descriptor;
  }
  const operations = obj.operations;
  if (!Array.isArray(operations) || operations.length === 0 ||
      operations.some((op) => !['uppercase', 'lowercase', 'titlecase'].includes(op)) ||
      new Set(operations).size !== operations.length) throw new Error('Invalid transform operations');
  const acceptedKeys = new Set(['id', 'version', 'description', 'adapter', 'effects', 'operations']);
  if (Object.keys(obj).some((key) => !acceptedKeys.has(key))) throw new Error('Unexpected manifest property');
  return freeze({
    id: String(obj.id), adapter: 'builtin.text.transform', version: String(obj.version),
    description: obj.description, effects: ['read'], operations: [...operations] as ToolDescriptor['operations'],
  });
}
export function descriptorFingerprint(tool: ToolDescriptor): string {
  return createHash('sha256').update(tool.descriptorVersion===2 ? 'tool-descriptor:v2\n'+canonical(tool) : JSON.stringify(tool)).digest('hex');
}
export async function listTools(): Promise<ToolDescriptor[]> {
  const tools = builtinTools.map(tool=>freeze({...tool,effects:[...tool.effects]}));
  await mkdir(REGISTRY_DIR, { recursive: true });
  for (const name of await readdir(REGISTRY_DIR)) {
    if (!name.endsWith('.json')) continue;
    const file = join(REGISTRY_DIR, name);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new Error(`Unsafe registered manifest: ${name}`);
    const parsed = parseManifest(await readManifest(file)) as unknown;
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
  const descriptor = validateManifest(parseManifest(await readManifest(manifestPath)) as unknown);
  await mkdir(REGISTRY_DIR, { recursive: true });
  const target = join(REGISTRY_DIR, `${descriptor.id}.json`);
  // Refuse silent upgrades; v0.2 has no trust migration flow.
  await writeFile(target, JSON.stringify(descriptor), {flag:'wx'});
  return descriptor;
}

/** Structural codec kept outside the legacy fingerprint representation. */
export function inputSchemaFor(tool:ToolDescriptor):InputSchema {
  if(tool.descriptorVersion!==undefined) {
    return validateManifest(tool).inputSchema!;
  }
  if(tool.adapter==='builtin.text.transform') {
    validateManifest(tool);
    return {type:'object',additionalProperties:false,properties:{input:{type:'string',minLength:1,maxLength:2048},operation:{type:'string',enum:tool.operations}},required:['input','operation']};
  }
  const builtin=builtinTools.find(t=>t.id===tool.id);
  if(!builtin || JSON.stringify(tool)!==JSON.stringify(builtin)) throw new Error('Invalid builtin descriptor');
  return tool.adapter==='builtin.filesystem.write'
    ? {type:'object',additionalProperties:false,properties:{fileName:{type:'string'},content:{type:'string'}},required:['fileName','content']}
    : {type:'object',additionalProperties:false,properties:{fileName:{type:'string'}},required:['fileName']};
}

async function readManifest(path:string):Promise<string> {
  const file=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if(!(await file.stat()).isFile()) throw new Error('Unsafe tool manifest');
    const buffer=Buffer.alloc(8193);
    let size=0;
    while(size<buffer.length) { const read=await file.read(buffer,size,buffer.length-size,null); if(!read.bytesRead) break; size+=read.bytesRead; }
    if(size>8192) throw new Error('Unsafe tool manifest');
    return buffer.subarray(0,size).toString('utf8');
  } finally {await file.close();}
}

function parseManifest(text:string):unknown {
  try {return JSON.parse(text) as unknown;} catch {throw new Error('Malformed tool manifest JSON');}
}
