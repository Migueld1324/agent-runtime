import type { ToolDescriptor } from '../v2/registry.ts';
import type { ToolArguments } from '../v2/tools.ts';
export type Observation = { toolId: string; args: ToolArguments; result: string };
export type ModelAction =
  | { kind: 'tool'; toolId: string; args: ToolArguments }
  | { kind: 'final'; text: string };

/** Deterministic fixture, NOT intelligent language understanding or an LLM. */
export function mockDecision(objective: string, history: Observation[], tools: ToolDescriptor[]): ModelAction {
  const available = (id: string) => tools.some((t) => t.id === id);
  const hasTransformation = /(may[uú]scula|uppercase|capitaliz|min[uú]scula|lowercase|titlecase)/i.test(objective);
  const writeWanted = /\b(guarda|guardar|escribe|crear?|save|write)\b/i.test(objective);
  const operation: 'uppercase' | 'lowercase' | 'titlecase' =
    /(min[uú]scula|lowercase)/i.test(objective) ? 'lowercase'
    : /(titlecase|capitaliz)/i.test(objective) ? 'titlecase' : 'uppercase';
  const filename = objective.match(/\b([A-Za-z0-9][A-Za-z0-9_-]*\.md)\b/i)?.[1];
  const quoted = objective.match(/["“]([^"”]{1,200})["”]/)?.[1] || objective.match(/'([^']{1,200})'/)?.[1];
  const transformHistory = history.find((h) => h.toolId === 'text.transform');
  const writeHistory = history.find((h) => h.toolId === 'filesystem.write');
  if (writeHistory) return {kind: 'final', text: `Archivo guardado: ${writeHistory.result}`};
  if (hasTransformation && !transformHistory) {
    if (!quoted) return {kind:'final', text:'El modo mock necesita el texto entre comillas.'};
    if (!available('text.transform')) return {kind:'final', text:'text.transform no está registrada.'};
    return {kind:'tool', toolId:'text.transform', args: {input: quoted, operation}};
  }
  if (writeWanted) {
    if (!filename) return {kind:'final', text:'Falta un nombre de archivo .md explícito.'};
    if (!available('filesystem.write')) return {kind:'final', text:'filesystem.write no está disponible.'};
    const content = transformHistory?.result || quoted;
    if (!content) return {kind:'final', text:'No hay texto para guardar.'};
    return {kind:'tool', toolId:'filesystem.write', args: {fileName:filename, content}};
  }
  if (transformHistory) return {kind:'final', text:`Resultado: ${transformHistory.result}`};
  return {kind:'final', text:'El modo mock sólo simula transformación de texto y escritura de archivos .md.'};
}
