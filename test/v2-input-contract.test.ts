import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,descriptorFingerprint,inputSchemaFor,findTool} from '../src/v2/registry.ts';
import {validateToolArguments} from '../src/v2/tools.ts';
import {validateToolArguments as legacy} from './fixtures/legacy-tools.ts';
import {requestHash,GrantStore} from '../src/v2/policy.ts';
import {schemaFor} from '../src/v3/tool-schema.ts';
import {canonical,compiled} from '../src/v2/input-contract.ts';
const old={id:'text.transform',version:'1.0.0',description:'Transform',adapter:'builtin.text.transform',effects:['read'],operations:['uppercase']};
export const manifest=()=>({descriptorVersion:2,id:'text.contract',version:'1.0.0',description:'Transform',adapter:'builtin.text.transform',effects:['read'],inputSchema:{type:'object',additionalProperties:false,properties:{input:{type:'string',minLength:1,maxLength:1024},operation:{type:'string',enum:['uppercase']}},required:['input','operation']}});
const accepts=(fn:()=>void)=>{try{fn();return true;}catch{return false;}};
test('frozen legacy hashes, unchanged grants, distinct request identity',()=>{
 const v1=validateManifest(old),v2=validateManifest({...manifest(),id:old.id}),args={input:'hola',operation:'uppercase'};
 assert.equal(descriptorFingerprint(v1),'4c993fe6d195a6c74d978cd7921b82588aecc522352fc726037fc19c1105b17b');
 assert.equal(requestHash(v1,args),'0dd7f9423fa713c203d00a281bd7a3dbba6b9f6837e3e8fb1920325d34b23b93');
 const grants=new GrantStore(':memory:');try{grants.addGrant(v1,'poc-workspace');assert.ok(grants.hasGrant(v1,'poc-workspace'));assert.ok(!grants.hasGrant(v2,'poc-workspace'));}finally{grants.close();}
 const reorderedKeys={...manifest(),id:old.id};reorderedKeys.inputSchema.properties=Object.fromEntries(Object.entries(reorderedKeys.inputSchema.properties).reverse()) as typeof reorderedKeys.inputSchema.properties;
 const reversed=Object.fromEntries(Object.entries(reorderedKeys).reverse());
 assert.equal(descriptorFingerprint(v2),descriptorFingerprint(validateManifest(reversed)));
 assert.notEqual(requestHash(v2,args),requestHash(v2,{operation:'uppercase',input:'hola'}));
 const reordered=manifest();reordered.inputSchema.required.reverse();assert.notEqual(descriptorFingerprint(v2),descriptorFingerprint(validateManifest(reordered)));
 assert.equal(canonical({'\uE000':1,'😀':2,a:3}),'{"a":3,"😀":2,"":1}');
 assert.notEqual(requestHash(v2,{input:'é',operation:'uppercase'}),requestHash(v2,{input:'é',operation:'uppercase'}));
});
test('Unicode differential and schema implication against frozen validator',()=>{
 const v1=validateManifest(old),v2=validateManifest(manifest());
 assert.deepEqual(schemaFor(v2),v2.inputSchema);
 const schema=compiled('test-implication',inputSchemaFor(v2));
 for(const unit of ['a','é','😀','é','\ud800','\udc00','a😀',' ']) for(const size of [0,1,511,512,1023,1024,1025,2048,2049]) {
  const args={input:unit.repeat(size),operation:'uppercase'};
  assert.equal(accepts(()=>validateToolArguments(v1,args)),accepts(()=>legacy(v1,args)));
  if(schema(args)) assert.ok(accepts(()=>legacy(v1,args)));
  assert.equal(accepts(()=>validateToolArguments(v2,args)),schema(args));
 }
 for(let max=1;max<=1024;max+=31){const m=manifest();m.inputSchema.properties.input.maxLength=max;const t=validateManifest(m);for(const input of ['😀'.repeat(max),'a'.repeat(max+1)]){const a={input,operation:'uppercase'};if(accepts(()=>validateToolArguments(t,a)))legacy(v1,a);}}
});
test('profile rejects unsupported schemas and invalid arguments without mutation',()=>{
 for(const key of ['$ref','$id','$schema','default','format','pattern','anyOf','unknown']){const m=manifest();Object.assign(m.inputSchema,{[key]:'x'});assert.throws(()=>validateManifest(m));}
 for(const mutate of [(m:any)=>m.descriptorVersion=3,(m:any)=>m.operations=['uppercase'],(m:any)=>m.inputSchema.properties.input.maxLength=1025,(m:any)=>m.inputSchema.properties.operation.enum=['shell'],(m:any)=>m.inputSchema.required=['input','input'],(m:any)=>m.inputSchema.properties.input.type='object',(m:any)=>m.inputSchema.properties.input.enum=[''],(m:any)=>m.inputSchema.properties.input.default='x']){const m=manifest();mutate(m);assert.throws(()=>validateManifest(m));}
 const t=validateManifest(manifest());assert.ok(Object.isFrozen(t.inputSchema!.properties.input));
 for(const args of [{input:'x',operation:'lowercase'},{input:3,operation:'uppercase'},{input:'x',operation:'uppercase',extra:'x'},Object.create({input:'x',operation:'uppercase'})]){const before=JSON.stringify(args);assert.throws(()=>validateToolArguments(t,args as any));assert.equal(JSON.stringify(args),before);}
 let called=false;const args={get input(){called=true;return 'x';},operation:'uppercase'};assert.throws(()=>validateToolArguments(t,args));assert.equal(called,false);
});
test('filesystem keeps UTF-8 boundaries and safe filenames',async()=>{
 const tool=await findTool('filesystem.write');
 for(const size of [16383,16384,16385]){const content='😀'.repeat(4095)+'a'.repeat(size-16380);assert.equal(accepts(()=>validateToolArguments(tool,{fileName:'contract.md',content})),size<=16384);}
 for(const args of [{fileName:'../secret.md',content:'x'},{fileName:'contract.md',content:'   '}])assert.throws(()=>validateToolArguments(tool,args));
});
