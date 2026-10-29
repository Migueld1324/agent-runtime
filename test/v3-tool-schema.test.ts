import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest, descriptorFingerprint, inputSchemaFor} from '../src/v2/registry.ts';
import {validateToolArguments} from '../src/v2/tools.ts';
import {validateToolArguments as legacy} from './fixtures/legacy-tools.ts';
import {requestHash} from '../src/v2/policy.ts';
import {compiled} from '../src/v2/input-contract.ts';
import {schemaFor, constraintsFor} from '../src/v3/tool-schema.ts';

const accepted = (validate:()=>void):boolean => {
  try {validate(); return true;} catch {return false;}
};

test('published v1 length limits preserve historical identity and effective UTF-16 validation',()=>{
  const tool=validateManifest({id:'text.transform',version:'1.0.0',description:'Transform',
    adapter:'builtin.text.transform',effects:['read'],operations:['uppercase']});
  const before=JSON.stringify(tool);
  const schema=schemaFor(tool);
  assert.deepEqual(schema,inputSchemaFor(tool));
  assert.equal(schema.properties.input.minLength,1);
  assert.equal(schema.properties.input.maxLength,2048);
  assert.deepEqual(schema.properties.operation.enum,['uppercase']);
  assert.match(constraintsFor(tool),/1 to 2048 UTF-16 code units/);
  const published=compiled('published-v1:'+descriptorFingerprint(tool),schema);
  for(const unit of ['a','é','😀','e\u0301','\ud800']) {
    for(const size of [0,1,1024,1025,2048,2049]) {
      const args={input:unit.repeat(size),operation:'uppercase'};
      assert.equal(published(args),size>0 && Array.from(args.input).length<=2048);
      assert.equal(accepted(()=>validateToolArguments(tool,args)),accepted(()=>legacy(tool,args)));
    }
  }
  // Historical JSON Schema counts characters; the adapter separately counts code units.
  const supplementary={input:'😀'.repeat(1025),operation:'uppercase'};
  assert.equal(published(supplementary),true);
  assert.throws(()=>validateToolArguments(tool,supplementary));
  assert.equal(JSON.stringify(tool),before);
  assert.equal(descriptorFingerprint(tool),'4c993fe6d195a6c74d978cd7921b82588aecc522352fc726037fc19c1105b17b');
  assert.equal(requestHash(tool,{input:'hola',operation:'uppercase'}),'0dd7f9423fa713c203d00a281bd7a3dbba6b9f6837e3e8fb1920325d34b23b93');
});

test('v2 descriptions follow descriptor lengths and published schemas match Gateway restrictions',()=>{
  for(const [min,max] of [[1,1024],[2,4],[3,3]]) {
    const tool=validateManifest({descriptorVersion:2,id:'text.restricted',version:'1.0.0',description:'Restricted transform',
      adapter:'builtin.text.transform',effects:['read'],inputSchema:{type:'object',additionalProperties:false,
        properties:{input:{type:'string',minLength:min,maxLength:max},operation:{type:'string',enum:['uppercase']}},
        required:['input','operation']}});
    const before=JSON.stringify(tool), hash=descriptorFingerprint(tool);
    const schema=schemaFor(tool);
    assert.deepEqual(schema,tool.inputSchema);
    assert.deepEqual(schema,inputSchemaFor(tool));
    const description=constraintsFor(tool);
    assert.ok(description.includes(`${min} to ${max} Unicode characters`),description);
    assert.match(description,/all restrictions in inputSchema/);
    assert.match(description,/also enforces a maximum of 2048 UTF-16 code units/);
    assert.doesNotMatch(description,/Input must contain 1 to 2048/);
    const published=compiled('published-v2:'+hash,schema);
    for(const unit of ['a','😀','e\u0301','\ud800']) {
      for(const size of [0,min-1,min,max,max+1]) {
        const args={input:unit.repeat(size),operation:'uppercase'};
        const expected=Array.from(args.input).length>=min && Array.from(args.input).length<=max;
        assert.equal(published(args),expected);
        assert.equal(accepted(()=>validateToolArguments(tool,args)),expected);
      }
    }
    for(const args of [{input:'a'.repeat(min),operation:'lowercase'},
      {input:'a'.repeat(min),operation:'uppercase',extra:'x'}]) {
      assert.equal(published(args),false);
      assert.throws(()=>validateToolArguments(tool,args));
    }
    assert.equal(JSON.stringify(tool),before);
    assert.equal(descriptorFingerprint(tool),hash);
  }
});
