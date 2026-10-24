/** ChatGPT plan usage via official Sign in with ChatGPT (OSS / eligible private clients).
 * No API key and no scraping or reuse of someone else's OAuth client.
 * This PoC intentionally supports ONE validated ChatGPT identity per local host.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const OAUTH_BASE = 'https://auth.openai.com';
const TOKEN_ENDPOINT = `${OAUTH_BASE}/api/accounts/oauth/token`;
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const AUTH_ROOT = process.env.AGENT_AUTH_DIR || (platform() === 'win32'
  ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'agent-runtime-poc')
  : platform() === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'agent-runtime-poc')
  : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'agent-runtime-poc'));
const CREDENTIALS_PATH = join(AUTH_ROOT, 'chatgpt.json');
const HOST_PATH = join(AUTH_ROOT, 'host.json');

export interface ChatGPTCredentials {
  client_id: string; host_id: string; subject: string; email?: string;
  id_token: string; access_token: string; refresh_token: string;
  scopes: string[]; expires_at: number; selected_model?: string;
}
function rand(): string { return randomBytes(32).toString('base64url'); }
async function readJSON<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}
async function atomicJSON(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true, mode: 0o700});
  await chmod(dirname(path), 0o700);
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2), {mode: 0o600, flag: 'wx'});
    await rename(tmp, path);
    await chmod(path, 0o600);
  } finally { await rm(tmp, {force: true}); }
}
async function hostID(): Promise<string> {
  const previous = await readJSON<{host_id: string}>(HOST_PATH);
  if (previous?.host_id?.startsWith('urn:uuid:')) return previous.host_id;
  const host_id = `urn:uuid:${randomUUID()}`;
  await atomicJSON(HOST_PATH, {host_id});
  return host_id;
}
export async function savedChatGPT(): Promise<ChatGPTCredentials | undefined> {
  const record = await readJSON<ChatGPTCredentials>(CREDENTIALS_PATH);
  if (!record) return;
  if (!record.subject || !record.client_id?.startsWith('oaiapp_') ||
      !record.refresh_token || !record.access_token || !record.scopes?.includes('chatgpt.tokens.use.direct'))
    throw new Error('ChatGPT credentials are malformed or lack plan-use consent. Run auth:v3 login.');
  return record;
}
export async function chatGPTReady(): Promise<{ready: boolean; model?: string}> {
  const creds = await savedChatGPT();
  return {ready: !!creds, model: creds?.selected_model};
}
function openBrowser(url: string): void {
  const os = platform();
  const cmd = os === 'win32' ? 'cmd' : os === 'darwin' ? 'open' : 'xdg-open';
  const args = os === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(cmd, args, {stdio: 'ignore', detached: true});
  child.on('error', () => console.error('Could not open the browser. Run this command on a desktop with a browser.'));
  child.unref();
}
async function tokenRequest(params: URLSearchParams): Promise<Record<string,unknown>> {
  const res = await fetch(TOKEN_ENDPOINT, {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:params, signal: AbortSignal.timeout(30000)});
  if (!res.ok) throw new Error(`ChatGPT OAuth token exchange failed (${res.status}). Reauthenticate; credentials were not logged.`);
  return await res.json() as Record<string,unknown>;
}
async function validateIDToken(raw: string, clientID: string, nonce?: string): Promise<{subject:string;email?:string}> {
  const discoveryResponse = await fetch(`${OAUTH_BASE}/.well-known/openid-configuration`, {signal: AbortSignal.timeout(15000)});
  if (!discoveryResponse.ok) throw new Error('Could not retrieve OpenAI OIDC discovery.');
  const discovery = await discoveryResponse.json() as {issuer?:string;jwks_uri?:string};
  if (discovery.issuer !== OAUTH_BASE || !discovery.jwks_uri || new URL(discovery.jwks_uri).origin !== OAUTH_BASE)
    throw new Error('Unexpected OIDC discovery metadata.');
  const options = nonce ? {issuer: OAUTH_BASE, audience: clientID, requiredClaims:['sub','nonce']} : {issuer:OAUTH_BASE, audience:clientID, requiredClaims:['sub']};
  const {payload} = await jwtVerify(raw, createRemoteJWKSet(new URL(discovery.jwks_uri)), options);
  if (nonce && payload.nonce !== nonce) throw new Error('OIDC nonce mismatch.');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('OIDC subject missing.');
  return {subject:payload.sub,email:typeof payload.email === 'string' ? payload.email : undefined};
}
function stringField(t: Record<string,unknown>, key:string): string {
  if (typeof t[key] !== 'string' || !t[key]) throw new Error(`OAuth response missing ${key}`);
  return t[key] as string;
}
export async function loginChatGPT(): Promise<void> {
  const previous = await savedChatGPT();
  const host_id = await hostID();
  const nonce = rand(), state = rand(), verifier = rand();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let callbackID: string | undefined;
  const server = createServer();
  await new Promise<void>((resolve,reject) => {server.once('error',reject); server.listen(0,'127.0.0.1',resolve);});
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local auth callback port');
  const redirect = `http://127.0.0.1:${address.port}/auth/callback`;
  const requestClientID = previous?.client_id || 'dynamic_agent_client';
  const params = new URLSearchParams({client_id:requestClientID,ext_agent_host_id:host_id,response_type:'code',
    redirect_uri:redirect,scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:challenge});
  if (previous) {params.set('id_token_hint',previous.id_token); if (previous.email) params.set('login_hint',previous.email);}
  else params.set('agent_name_hint','Agent Runtime PoC');
  const url = `${OAUTH_BASE}/api/accounts/authorize?${params.toString()}`;
  console.log('Sign in with ChatGPT: opening browser. Approve plan usage if offered.');
  const callback = new Promise<string>((resolve,reject) => {
    server.on('request',(req,res) => {
      const target = new URL(req.url || '/',redirect);
      if (req.method !== 'GET' || target.pathname !== '/auth/callback') {res.writeHead(404).end();return;}
      if (target.searchParams.get('state') !== state) {res.writeHead(400).end('Invalid state'); reject(new Error('OAuth state mismatch')); return;}
      const failure = target.searchParams.get('error');
      if (failure) {res.writeHead(400).end('Authorization declined');reject(new Error(`OAuth was not authorized (${failure})`));return;}
      const code = target.searchParams.get('code');
      if (!code) {res.writeHead(400).end('Code missing');reject(new Error('Authorization code missing'));return;}
      callbackID = target.searchParams.get('client_id') || undefined;
      res.writeHead(200,{'content-type':'text/plain; charset=utf-8'}).end('Authorization received. Return to the terminal.');
      resolve(code);
    });
  });
  const timer = setTimeout(() => server.close(), 120_000);
  try {
    openBrowser(url);
    const code = await Promise.race([callback,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Sign-in timed out')),120_000))]);
    const clientID = previous ? previous.client_id : callbackID;
    if (!clientID?.startsWith('oaiapp_') || (previous && callbackID && callbackID !== previous.client_id))
      throw new Error('Authorization did not return the expected issued client ID.');
    const token = await tokenRequest(new URLSearchParams({grant_type:'authorization_code',client_id:clientID,code,code_verifier:verifier,redirect_uri:redirect,resource:RESOURCE}));
    const identity = await validateIDToken(stringField(token,'id_token'),clientID,nonce);
    if (previous && previous.subject !== identity.subject) throw new Error('Different ChatGPT identity. Existing local credentials remain unchanged.');
    const scopes = stringField(token,'scope').split(/\s+/);
    if (!scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan usage permission was not granted. No credentials saved.');
    const expires = Number(token.expires_in);
    if (!Number.isFinite(expires) || expires <= 0) throw new Error('OAuth expiry invalid.');
    await atomicJSON(CREDENTIALS_PATH,{client_id:clientID,host_id,subject:identity.subject,email:identity.email,
      id_token:stringField(token,'id_token'),access_token:stringField(token,'access_token'),
      refresh_token:stringField(token,'refresh_token'),scopes,expires_at:Date.now()+expires*1000,
      selected_model: previous?.selected_model} satisfies ChatGPTCredentials);
    console.log(`ChatGPT authorization saved locally${identity.email ? ` for ${identity.email}` : ''}. No API key required.`);
  } finally { clearTimeout(timer); server.close(); }
}
let refreshInFlight: Promise<ChatGPTCredentials> | undefined;
export async function accessToken(): Promise<string> {
  const current = await savedChatGPT();
  if (!current) throw new Error('ChatGPT account not connected. Run npm run auth:v3 -- login');
  if (current.expires_at > Date.now() + 120_000) return current.access_token;
  refreshInFlight ||= (async () => {
    const fresh = await savedChatGPT();
    if (!fresh) throw new Error('ChatGPT credentials missing.');
    if (fresh.expires_at > Date.now()+120_000) return fresh;
    const token = await tokenRequest(new URLSearchParams({grant_type:'refresh_token',client_id:fresh.client_id,
      refresh_token:fresh.refresh_token,resource:RESOURCE}));
    const expires = Number(token.expires_in);
    if (!Number.isFinite(expires) || expires <= 0) throw new Error('Invalid refresh response expiry');
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : fresh.scopes;
    if (!scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan usage consent expired. Reauthenticate.');
    const updated: ChatGPTCredentials = {...fresh,access_token:stringField(token,'access_token'),
      refresh_token:stringField(token,'refresh_token'), scopes,expires_at:Date.now()+expires*1000};
    await atomicJSON(CREDENTIALS_PATH,updated);
    return updated;
  })().finally(()=>{refreshInFlight=undefined;});
  return (await refreshInFlight).access_token;
}
export async function modelCatalog(): Promise<{slug:string;display_name:string}[]> {
  const response = await fetch(`${RESOURCE}/models`, {headers:{authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`ChatGPT models unavailable (${response.status}). No API fallback.`);
  const body = await response.json() as {models?:{slug?:string;display_name?:string;visibility?:string}[]};
  return (body.models??[]).filter(m=>m.visibility==='list' && !!m.slug).map(m=>({slug:m.slug!,display_name:m.display_name||m.slug!}));
}
export async function useChatGPTModel(model:string): Promise<void> {
  if (!/^[\w.:-]{1,100}$/.test(model)) throw new Error('Invalid model name');
  const current = await savedChatGPT();
  if (!current) throw new Error('Log in to ChatGPT first.');
  const allowed = await modelCatalog();
  if (!allowed.some(x=>x.slug===model)) throw new Error('Model is not in the account model catalog.');
  // The catalog request may have refreshed a rotating OAuth token. Never overwrite it with a stale copy.
  const latest=await savedChatGPT();
  if (!latest || latest.subject!==current.subject) throw new Error('ChatGPT identity changed during model selection.');
  await atomicJSON(CREDENTIALS_PATH,{...latest,selected_model:model});
}
export async function signOutChatGPT(): Promise<void> {
  const record = await savedChatGPT();
  if (!record) return;
  // Prefer revocation, but always stop local use. Do not print OAuth credentials.
  let remoteRevoked = false;
  try {
    const meta = await fetch(`${OAUTH_BASE}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(10000)});
    const config = await meta.json() as {revocation_endpoint?:string};
    if (meta.ok && config.revocation_endpoint && new URL(config.revocation_endpoint).origin===OAUTH_BASE) {
      const res = await fetch(config.revocation_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({token:record.refresh_token,token_type_hint:'refresh_token',client_id:record.client_id}),signal:AbortSignal.timeout(10000)});
      remoteRevoked = res.ok;
    }
  } catch { /* warn below */ }
  await rm(CREDENTIALS_PATH,{force:true});
  console.log(remoteRevoked?'Local credentials removed; session revoked.':'Local credentials removed; remote revocation could not be confirmed. Disconnect in ChatGPT Settings if needed.');
}
