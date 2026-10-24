import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectSIWCStream, parseModelProposal} from '../src/v3/siwc-protocol.ts';
import type {ToolDescriptor} from '../src/v2/registry.ts';
const available: ToolDescriptor[] = [
  {id:'text.transform',version:'1.0.0',description:'Transform text',adapter:'builtin.text.transform',effects:['read'],operations:['uppercase','lowercase','titlecase']}
];
test('ChatGPT can propose a tool but cannot directly execute',()=>{
  assert.deepEqual(parseModelProposal('{"kind":"tool","toolId":"text.transform","args":{"input":"hola","operation":"uppercase"}}',available),
    {kind:'tool',toolId:'text.transform',args:{input:'hola',operation:'uppercase'}});
  assert.equal(parseModelProposal('```json\n{"kind":"final","text":"Listo"}\n```',available).kind,'final');
  assert.throws(()=>parseModelProposal('{"kind":"tool","toolId":"shell.exec","args":{}}',available),/invalid/);
  assert.throws(()=>parseModelProposal('{"kind":"tool","toolId":"text.transform","args":{"x":3}}',available),/invalid/);
  assert.throws(()=>parseModelProposal('not json',available),/malformed/);
});
function sse(parts:string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({start(c){ for(const p of parts)c.enqueue(new TextEncoder().encode(p)); c.close(); }});
}
test('SIWC streaming waits for completed event',async()=>{
  const text = '{"kind":"final","text":"Ready"}';
  const events = `data: ${JSON.stringify({type:'response.output_text.delta',delta:text})}\n\ndata: ${JSON.stringify({type:'response.completed'})}\n\n`;
  assert.equal(await collectSIWCStream(sse([events.slice(0,17),events.slice(17)])),text);
});
test('SIWC rejects interrupted streams and provider failure',async()=>{
  await assert.rejects(()=>collectSIWCStream(sse(['data: {"type":"response.output_text.delta","delta":"hello"}\n\n'])),/without response.completed/);
  await assert.rejects(()=>collectSIWCStream(sse(['data: {"type":"response.failed"}\n\n'])),/failed/);
});
