import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('full ChatGPT adapter failures persist without effects or commercial fallback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'poc-auth-failures-'));
  const previousAuth=process.env.AGENT_AUTH_DIR;
  const previousModel=process.env.CHATGPT_MODEL;
  const originalFetch=globalThis.fetch;
  process.env.AGENT_AUTH_DIR=dir;
  process.env.CHATGPT_MODEL='test-model';
  try {
    // Import only after selecting an isolated credential directory.
    const {createGraphV3}=await import('../src/v3/graph.ts');
    const {accessToken}=await import('../src/v3/chatgpt-auth.ts');
    const credentials={client_id:'oaiapp_test',host_id:'test',subject:'test',id_token:'test',
      access_token:'synthetic-access',refresh_token:'synthetic-refresh',scopes:['chatgpt.tokens.use.direct'],
      expires_at:Date.now()+3600000,selected_model:'test-model'};
    const sse=(data:unknown)=>new Response(`data: ${JSON.stringify(data)}\n\n`,{headers:{'content-type':'text/event-stream'}});
    const cases=[
      {name:'missing',record:undefined,response:()=>new Response(null,{status:500}),pattern:/not connected/,requests:0},
      {name:'malformed',record:{...credentials,access_token:''},response:()=>new Response(null,{status:500}),pattern:/malformed/,requests:0},
      {name:'expired-refresh-denied',record:{...credentials,expires_at:0},response:()=>new Response(null,{status:401}),pattern:/token exchange failed/,requests:1},
      {name:'refresh-network',record:{...credentials,expires_at:0},response:()=>{throw new TypeError('synthetic network failure');},pattern:/network failure/,requests:1},
      {name:'refresh-invalid-expiry',record:{...credentials,expires_at:0},response:()=>Response.json({expires_in:0}),pattern:/expiry/,requests:1},
      {name:'refresh-consent-lost',record:{...credentials,expires_at:0},response:()=>Response.json({expires_in:3600,scope:'openid'}),pattern:/consent expired/,requests:1},
      ...[401,403,429,500].map(status=>({name:`http-${status}`,record:credentials,response:()=>new Response(null,{status}),pattern:/inference rejected/,requests:1})),
      {name:'network',record:credentials,response:()=>{throw new TypeError('synthetic network failure');},pattern:/network failure/,requests:1},
      {name:'timeout',record:credentials,response:()=>{throw new DOMException('synthetic timeout','TimeoutError');},pattern:/timeout/,requests:1},
      {name:'provider-failed',record:credentials,response:()=>sse({type:'response.failed'}),pattern:/inference failed/,requests:1},
      {name:'provider-incomplete',record:credentials,response:()=>sse({type:'response.incomplete'}),pattern:/inference failed/,requests:1},
      {name:'truncated',record:credentials,response:()=>sse({type:'response.output_text.delta',delta:'partial'}),pattern:/without response.completed/,requests:1},
    ];
    for(const c of cases) {
      const path=join(dir,'chatgpt.json');
      if(c.record) await writeFile(path,JSON.stringify(c.record),{mode:0o600});
      else await rm(path,{force:true});
      const urls:string[]=[];
      globalThis.fetch=async(input,init)=>{
        const url=String(input);
        urls.push(url);
        assert.ok(init?.signal instanceof AbortSignal,'adapter attaches a deadline');
        assert.equal(url,c.name.startsWith('refresh') || c.name.startsWith('expired')
          ? 'https://auth.openai.com/api/accounts/oauth/token' : 'https://api.openai.com/v1/responses');
        if(url.endsWith('/responses')) {
          const body=JSON.parse(String(init?.body));
          assert.equal(body.model,'test-model');
          assert.equal(body.store,false);
          assert.equal(body.stream,true);
          assert.equal(body.tools,undefined);
        }
        return c.response();
      };
      const graph=await createGraphV3({checkpointPath:join(dir,'runs.sqlite')});
      const config={configurable:{thread_id:c.name}};
      await assert.rejects(()=>graph.invoke({runId:c.name,objective:'synthetic failure test',modelId:'chatgpt',
        selectionReason:'test',scopeId:'poc-workspace',observations:[],toolCount:0,status:'queued',result:''},config),c.pattern);
      const snap=await (await createGraphV3({checkpointPath:join(dir,'runs.sqlite')})).getState(config);
      assert.equal(snap.values.status,'queued');
      assert.equal(snap.values.toolCount,0);
      assert.deepEqual(snap.values.observations,[]);
      assert.deepEqual(snap.next,['model']);
      assert.ok(snap.tasks[0].error);
      assert.equal(urls.length,c.requests,`${c.name}: no fallback or extra requests`);
      if(c.record) assert.deepEqual(JSON.parse(await readFile(path,'utf8')),c.record,'failed refresh preserves credentials');
    }
    // An expired token can refresh successfully; rotated credentials must be saved.
    await writeFile(join(dir,'chatgpt.json'),JSON.stringify({...credentials,expires_at:0}));
    let refreshCalls=0;
    globalThis.fetch=async(input)=>{
      refreshCalls++;
      assert.equal(String(input),'https://auth.openai.com/api/accounts/oauth/token');
      return Response.json({expires_in:3600,access_token:'rotated-access',refresh_token:'rotated-refresh'});
    };
    assert.equal(await accessToken(),'rotated-access');
    assert.equal(await accessToken(),'rotated-access');
    assert.equal(refreshCalls,1);
    assert.equal(JSON.parse(await readFile(join(dir,'chatgpt.json'),'utf8')).refresh_token,'rotated-refresh');
  } finally {
    globalThis.fetch=originalFetch;
    if(previousAuth===undefined) delete process.env.AGENT_AUTH_DIR; else process.env.AGENT_AUTH_DIR=previousAuth;
    if(previousModel===undefined) delete process.env.CHATGPT_MODEL; else process.env.CHATGPT_MODEL=previousModel;
    await rm(dir,{recursive:true,force:true});
  }
});
