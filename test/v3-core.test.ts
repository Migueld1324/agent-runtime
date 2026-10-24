import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModel } from '../src/v3/router.ts';
import { mockDecision } from '../src/v3/mock.ts';
import type { ToolDescriptor } from '../src/v2/registry.ts';
const tools:ToolDescriptor[] = [
  {id:'filesystem.write',version:'1.0.0',description:'Write',adapter:'builtin.filesystem.write',effects:['write']},
  {id:'text.transform',version:'1.0.0',description:'Transform',adapter:'builtin.text.transform',effects:['read'],operations:['uppercase','lowercase','titlecase']},
];
const objective='Convierte "hola agente" a mayúsculas y guarda el resultado en nota-prueba.md';
test('router is offline by default even with credentials',() => {
  assert.equal(resolveModel('auto',{OPENAI_API_KEY:'test',OPENAI_MODEL:'test'}).id,'mock');
  assert.equal(resolveModel('mock',{}).id,'mock');
});
test('explicit cloud model requires key and name; no silent fallback',() => {
  assert.throws(() => resolveModel('openai',{}),/requires/);
  assert.equal(resolveModel('openai',{OPENAI_API_KEY:'test',OPENAI_MODEL:'custom'}).id,'openai');
});
test('auto only uses cloud when explicitly opted in',() => {
  assert.equal(resolveModel('auto',{AGENT_ALLOW_CLOUD:'1',GOOGLE_GENERATIVE_AI_API_KEY:'key',GOOGLE_MODEL:'example'}).id,'google');
  assert.equal(resolveModel('auto',{AGENT_ALLOW_CLOUD:'1'}).id,'mock');
});
test('mock proposes transform, then write, then final; does not execute',() => {
  const a=mockDecision(objective,[],tools);
  assert.deepEqual(a,{kind:'tool',toolId:'text.transform',args:{input:'hola agente',operation:'uppercase'}});
  const b=mockDecision(objective,[{toolId:'text.transform',args:a.kind === 'tool' ? a.args : {},result:'HOLA AGENTE'}],tools);
  assert.deepEqual(b,{kind:'tool',toolId:'filesystem.write',args:{fileName:'nota-prueba.md',content:'HOLA AGENTE'}});
  const c=mockDecision(objective,[{toolId:'text.transform',args:{},result:'HOLA AGENTE'},
    {toolId:'filesystem.write',args:{},result:'filesystem.write: created (nota-prueba.md)'}],tools);
  assert.equal(c.kind,'final');
});
test('mock requires exact filename for a write operation',() => {
  const a=mockDecision('Guarda "hola" en una nota',[],tools);
  assert.match(a.kind === 'final' ? a.text : '',/nombre de archivo/);
});

test('ChatGPT subscription route works without commercial API key', () => {
  const env = {AGENT_CHATGPT_AUTH:'1', CHATGPT_MODEL:'gpt-account-model'};
  assert.equal(resolveModel('chatgpt',env).id,'chatgpt');
  assert.equal(resolveModel('auto',env).id,'mock');
  assert.equal(resolveModel('auto',{...env,AGENT_ALLOW_CLOUD:'1'}).id,'chatgpt');
  assert.throws(()=>resolveModel('chatgpt',{CHATGPT_MODEL:'x'}),/authorized account/);
  assert.throws(()=>resolveModel('chatgpt',{AGENT_CHATGPT_AUTH:'1'}),/selected model/);
  assert.equal(resolveModel('auto',{...env,AGENT_ALLOW_CLOUD:'1',AGENT_AUTO_PRIORITY:'mock,anthropic'}).id,'mock');
});
