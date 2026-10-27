import { ModelFailure } from './failures.ts';
import type { ToolDescriptor } from '../v2/registry.ts';
import type { ModelAction } from './mock.ts';

export function parseModelProposal(raw: string, tools: ToolDescriptor[]): ModelAction {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let value: unknown;
  try { value = JSON.parse(cleaned); } catch { throw new ModelFailure('INVALID_ARGUMENT',false,'ChatGPT returned malformed proposal JSON. Nothing executed.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModelFailure('INVALID_ARGUMENT',false,'Proposal is not an object.');
  const p = value as Record<string,unknown>;
  if (p.kind === 'final' && Object.keys(p).every(k=>['kind','text'].includes(k)) && typeof p.text === 'string' && p.text.trim()) return {kind:'final',text:p.text.trim()};
  if (p.kind === 'tool' && typeof p.toolId === 'string' && tools.some(t=>t.id===p.toolId)
    && Object.keys(p).every(k=>['kind','toolId','args'].includes(k))
    && p.args && typeof p.args === 'object' && !Array.isArray(p.args)
    && Object.values(p.args).every(v=>typeof v==='string'))
    return {kind:'tool',toolId:p.toolId,args:p.args as Record<string,string>};
  throw new ModelFailure('INVALID_ARGUMENT',false,'Unknown or invalid tool proposal. Nothing executed.');
}

/** Collect the SSE terminal event and reject truncated / failed streams. */
export async function collectSIWCStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '', responseText = '', completed = false, total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000) throw new Error('ChatGPT response exceeded safety size limit.');
      buffer += decoder.decode(value,{stream:true});
      let separator: number;
      while ((separator = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0,separator);
        const match = buffer.slice(separator).match(/^\r?\n\r?\n/)!;
        buffer = buffer.slice(separator+match[0].length);
        const data = block.split(/\r?\n/).filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');
        if (!data || data==='[DONE]') continue;
        let event: Record<string,unknown>;
        try {event=JSON.parse(data) as Record<string,unknown>;} catch {throw new Error('Malformed ChatGPT SSE event.');}
        if (event.type === 'response.output_text.delta' && typeof event.delta==='string') responseText+=event.delta;
        if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error')
          throw new ModelFailure('UNAVAILABLE',false,`ChatGPT inference failed (${String(event.type)}). No fallback.`);
        if (event.type === 'response.completed') {
          completed = true;
          // Response contains a complete output array. Prefer it when deltas were not emitted.
          if (!responseText && event.response && typeof event.response === 'object') {
            const output = (event.response as {output?:Array<{content?:Array<{type?:string;text?:string}>}>}).output ?? [];
            responseText=output.flatMap(o=>o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text||'').join('');
          }
        }
      }
    }
  } finally {reader.releaseLock();}
  if (!completed) throw new ModelFailure('UNAVAILABLE',true,'ChatGPT stream ended without response.completed; nothing executed.');
  if (!responseText.trim()) throw new Error('ChatGPT stream had no text proposal. Nothing executed.');
  return responseText;
}

