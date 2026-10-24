/** Cloud selection is explicit. `auto` defaults offline; API credentials are OPTIONAL. */
export type ModelName = 'mock' | 'chatgpt' | 'openai' | 'anthropic' | 'google';
export type ModelSelection = 'auto' | ModelName;
export type ModelEnvironment = Record<string, string | undefined>;
export interface ModelRoute { id: ModelName; reason: string; }

export function resolveModel(selection: string, env: ModelEnvironment): ModelRoute {
  const options=['auto','mock','chatgpt','openai','anthropic','google'];
  if (!options.includes(selection)) throw new Error(`Invalid model '${selection}' (${options.join('|')})`);
  if (selection==='mock') return {id:'mock',reason:'Explicit offline selection'};
  // SIWC consent is evaluated independently of API keys. Do not use a personal ChatGPT token as an API key.
  const config:Record<string,string[]>={
    chatgpt:['AGENT_CHATGPT_AUTH','CHATGPT_MODEL'],
    openai:['OPENAI_API_KEY','OPENAI_MODEL'],
    anthropic:['ANTHROPIC_API_KEY','ANTHROPIC_MODEL'],
    google:['GOOGLE_GENERATIVE_AI_API_KEY','GOOGLE_MODEL'],
  };
  const ready=(name:string):boolean => config[name].every(k=> k==='AGENT_CHATGPT_AUTH'? env[k]==='1':!!env[k]?.trim());
  if (selection!=='auto') {
    if (!ready(selection)) throw new Error(selection==='chatgpt'
      ? 'ChatGPT requires authorized account and selected model. Use npm run auth:v3 -- login ; npm run auth:v3 -- models ; npm run auth:v3 -- use MODEL_SLUG. No fallback.'
      : `${selection} requires ${config[selection].join(' and ')}. No fallback was performed.`);
    return {id: selection as ModelName,reason:selection==='chatgpt'?'Explicit ChatGPT plan auth (no API key)':'Explicit API selection'};
  }
  if (env.AGENT_ALLOW_CLOUD!=='1') return {id:'mock',reason:'Auto: cloud disabled; offline mock selected'};
  const priority=(env.AGENT_AUTO_PRIORITY||'chatgpt,openai,anthropic,google').split(',').map(s=>s.trim());
  for (const name of priority) if (Object.hasOwn(config,name) && ready(name))
    return {id:name as ModelName,reason:'Auto: authorized provider priority (not quality ranking)'};
  return {id:'mock',reason:'Auto: no authorized cloud provider; offline mock selected'};
}
