import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {inspectCheckpoints} from '../src/maintenance/inspectors.ts';
import {MaintenanceArtifacts, prepareInspectionSnapshot} from '../src/maintenance/artifacts.ts';
import {bytesDigest} from '../src/maintenance/local-storage.ts';

function fixture(t: {after(fn: () => void): void}, version: 'v1'|'v2'|'v3' = 'v1') {
  const root = mkdtempSync(join(tmpdir(), 'maintenance-inspect-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const path = join(root, 'checkpoint.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE checkpoints(thread_id TEXT NOT NULL,checkpoint_ns TEXT NOT NULL DEFAULT '',checkpoint_id TEXT NOT NULL,parent_checkpoint_id TEXT,type TEXT,checkpoint BLOB,metadata BLOB,PRIMARY KEY(thread_id,checkpoint_ns,checkpoint_id));
    CREATE TABLE writes(thread_id TEXT NOT NULL,checkpoint_ns TEXT NOT NULL DEFAULT '',checkpoint_id TEXT NOT NULL,task_id TEXT NOT NULL,task_path TEXT NOT NULL DEFAULT '',idx INTEGER NOT NULL,channel TEXT NOT NULL,type TEXT,value BLOB,PRIMARY KEY(thread_id,checkpoint_ns,checkpoint_id,task_id,idx));`);
  const values: Record<string, any> = version === 'v1' ? {runId:'run', approved:false,result:'Denied by user'} :
    {runId:'run',status:'denied',authorized:false,result:'Denied by user',observations:[]};
  const node = version === 'v1' ? 'approval' : 'authorization';
  const cp: Record<string, any> = {v:4,id:'cp-1',ts:'2026-10-30T00:00:00Z',channel_values:values,
    channel_versions:{['branch:to:'+node]:3},versions_seen:{[node]:{['branch:to:'+node]:2}}};
  const save = () => db.prepare('INSERT OR REPLACE INTO checkpoints VALUES (?,?,?,?,?,?,?)').run('run','','cp-1',null,'json',Buffer.from(JSON.stringify(cp)),Buffer.from(JSON.stringify({source:'loop',step:3,parents:{}})));
  save();
  t.after(() => db.close());
  return {root,path,db,cp,save};
}
test('M2 inspectors distinguish terminal historical runs from pending scheduling and writes', t => {
  for (const version of ['v1','v2','v3'] as const) {
    const f = fixture(t, version);
    assert.equal(inspectCheckpoints(f.path, version).runs[0].terminal, true);
    const channel = 'branch:to:'+(version === 'v1' ? 'approval' : 'authorization');
    f.cp.channel_values[channel] = null; f.save();
    assert.equal(inspectCheckpoints(f.path, version).runs[0].terminal, false);
    delete f.cp.channel_values[channel]; f.save();
    f.db.prepare('INSERT INTO writes VALUES (?,?,?,?,?,?,?,?,?)').run('run','','cp-1','task','',0,'__error__','json',Buffer.from('"failure"'));
    assert.equal(inspectCheckpoints(f.path, version).runs[0].terminal, false);
  }
});
test('M2 inspectors reject unknown versions, orphan writes, missing stores and false terminal v1', t => {
  const f = fixture(t);
  assert.throws(() => inspectCheckpoints(join(f.root,'missing.sqlite'),'v1'));
  assert.equal(readdirSync(f.root).includes('missing.sqlite'), false);
  f.cp.channel_values.result='Approved'; f.save();
  assert.equal(inspectCheckpoints(f.path,'v1').runs[0].terminal,false);
  f.cp.v=99; f.save(); assert.throws(() => inspectCheckpoints(f.path,'v1'));
  f.cp.v=4; f.save();
  f.db.prepare('INSERT INTO writes VALUES (?,?,?,?,?,?,?,?,?)').run('orphan','','missing','task','',0,'__error__','json',Buffer.from('"failure"'));
  assert.throws(() => inspectCheckpoints(f.path,'v1'));
});
test('M2 v3 status cannot hide uncertainty, unsupported state or missing ledger', t => {
  const f = fixture(t,'v3');
  f.cp.channel_values.invocationStatus='uncertain'; f.save();
  assert.equal(inspectCheckpoints(f.path,'v3').runs[0].terminal,false);
  f.cp.channel_values.invocationStatus=''; f.cp.channel_values.stateVersion=2; f.save();
  assert.throws(() => inspectCheckpoints(f.path,'v3'));
  f.cp.channel_values.stateVersion=100; f.save();
  assert.throws(() => inspectCheckpoints(f.path,'v3'));
});
test('M2 WAL input is rejected without touching source; recovery operates on private copies', t => {
  const f = fixture(t);
  f.db.exec('PRAGMA journal_mode=WAL');
  f.save();
  const before = new Map(readdirSync(f.root).map(name => [name, readFileSync(join(f.root,name))]));
  assert.throws(() => inspectCheckpoints(f.path,'v1'));
  const prepared = prepareInspectionSnapshot(f.path,join(f.root,'snapshot'));
  assert.equal(prepared.boundary,'unavailable');
  assert.equal(inspectCheckpoints(prepared.database,'v1').runs[0].terminal,true);
  for (const [name,bytes] of before) assert.deepEqual(readFileSync(join(f.root,name)),bytes);
  assert.equal(readdirSync(join(f.root,'snapshot','evidence')).length,before.size);
});
test('M2 durable backup/staging verify exact bytes and reject tampering; no publication', t => {
  const root=mkdtempSync(join(tmpdir(),'maintenance-artifacts-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const artifacts=new MaintenanceArtifacts(root), content=Buffer.from('synthetic manifest');
  const backup=artifacts.save('backup',content,bytesDigest(content));
  const stage=artifacts.save('staging',content,bytesDigest(content));
  artifacts.verify(backup); artifacts.verify(stage);
  assert.throws(() => artifacts.save('backup',content,bytesDigest('other')));
  writeFileSync(join(root,backup.id),'corrupt');
  assert.throws(() => artifacts.verify(backup));
  assert.equal(readFileSync(join(root,stage.id),'utf8'),'synthetic manifest');
});

test('M2 checkpoint history rejects cycles and disconnected terminal tips', t => {
  for (const parent of ['cp-1', null]) {
    const f=fixture(t);
    if (parent) f.db.prepare('UPDATE checkpoints SET parent_checkpoint_id=?').run(parent);
    else {
      const other={...f.cp,id:'cp-2'};
      f.db.prepare('INSERT INTO checkpoints SELECT thread_id,checkpoint_ns,?,NULL,type,?,metadata FROM checkpoints')
        .run('cp-2',Buffer.from(JSON.stringify(other)));
    }
    assert.throws(()=>inspectCheckpoints(f.path,'v1'));
  }
});

test('M2 unknown scheduler nodes and unversioned tasks cannot prove terminality', t => {
  for (const mutation of [
    (cp: Record<string, any>)=>{cp.channel_versions['branch:to:unknown']=1;},
    (cp: Record<string, any>)=>{cp.channel_values['branch:to:write']=null;},
    (cp: Record<string, any>)=>{cp.versions_seen.approval='invalid';},
  ]) {
    const f=fixture(t);mutation(f.cp);f.save();
    assert.throws(()=>inspectCheckpoints(f.path,'v1'));
  }
});

async function ledgerFixture(t: {after(fn: () => void): void}) {
  const {createNewStore}=await import('../src/maintenance/provision-stores.ts');
  const f=fixture(t,'v3');
  createNewStore(f.root,'runtime-operations.sqlite');
  const path=join(f.root,'runtime-operations.sqlite'), ledger=new DatabaseSync(path);
  t.after(()=>ledger.close());
  const hash='a'.repeat(64);
  Object.assign(f.cp.channel_values,{stateVersion:2,operationsStoreId:ledger.prepare('SELECT id FROM metadata').get()!.id,
    criterionHash:hash,modelId:'mock',scopeId:'scope',recoveryCount:0});f.save();
  ledger.prepare('INSERT INTO runs VALUES (?,?,?)').run('run',hash,'mock');
  const binding={runId:'run',ordinal:1,toolId:'text.transform',descriptorHash:hash,requestHash:hash,scopeId:'scope',criterionHash:hash};
  ledger.prepare('INSERT INTO invocations VALUES (?,?,?,?,?,?,?)').run('run:1','run',1,JSON.stringify(binding),'failed',null,'not_requested');
  return {...f,ledger,operationsPath:path};
}

test('M2 v3 rejects unknown grant states and mismatched recovery history', async t => {
  const f=await ledgerFixture(t);
  const inspect=()=>inspectCheckpoints(f.path,'v3',f.operationsPath);
  assert.equal(inspect().runs[0].terminal,true);
  f.ledger.exec("UPDATE invocations SET grant_status='unknown'");
  assert.throws(inspect);
  f.ledger.exec("UPDATE invocations SET grant_status='not_requested'");
  f.cp.channel_values.recoveryCount=1;f.save();
  assert.equal(inspect().runs[0].terminal,false);
});

test('M2 paused, recoverable and ambiguous runs block regardless of empty next', t => {
  for (const version of ['v2','v3'] as const) for (const status of ['paused','recovering','tool_proposed','unknown']) {
    const f=fixture(t,version);
    Object.assign(f.cp.channel_values,{status,next:[]});f.save();
    assert.equal(inspectCheckpoints(f.path,version).runs[0].terminal,false);
  }
  const f=fixture(t,'v3');
  Object.assign(f.cp.channel_values,{status:'failed',runtimeError:{retryable:true},next:[]});f.save();
  assert.equal(inspectCheckpoints(f.path,'v3').runs[0].terminal,false);
});

test('M2 ledger uncertainty, orphan records and broken bindings cannot be hidden by terminal status', async t => {
  const f=await ledgerFixture(t);
  const inspect=()=>inspectCheckpoints(f.path,'v3',f.operationsPath);
  for (const status of ['prepared','authorized','executing','uncertain']) {
    f.ledger.prepare('UPDATE invocations SET status=?').run(status);
    assert.equal(inspect().runs[0].terminal,false);
  }
  f.ledger.exec("UPDATE invocations SET status='failed'");
  for (const grant of ['pending','failed']) {
    f.ledger.prepare('UPDATE invocations SET grant_status=?').run(grant);
    assert.equal(inspect().runs[0].terminal,false);
  }
  f.ledger.exec("UPDATE invocations SET grant_status='not_requested'");
  f.ledger.exec("UPDATE runs SET model_id='foreign'");assert.throws(inspect);
  f.ledger.exec("UPDATE runs SET model_id='mock'");
  f.ledger.exec("UPDATE invocations SET run_id='orphan'");assert.throws(inspect);
});

test('M2 registry and historical grant inspection preserve exact keys without initializing paths', async t => {
  const {inspectRegistry}=await import('../src/maintenance/registry-inspector.ts');
  const {inspectGrants}=await import('../src/maintenance/inspectors.ts');
  const {createNewStore}=await import('../src/maintenance/provision-stores.ts');
  const f=fixture(t), registry=join(f.root,'registry');
  assert.throws(()=>inspectRegistry(registry));
  assert.equal(readdirSync(f.root).includes('registry'),false);
  mkdirSync(registry,{mode:0o700});
  const manifest={id:'text.transform',version:'1.0.0',description:'Synthetic fixture',adapter:'builtin.text.transform',effects:['read'],operations:['uppercase']};
  writeFileSync(join(registry,'text.transform.json'),JSON.stringify(manifest));
  assert.equal(inspectRegistry(registry).length,1);
  writeFileSync(join(registry,'unknown.txt'),'unknown');assert.throws(()=>inspectRegistry(registry));
  createNewStore(f.root,'tool-grants-v2.sqlite');
  const path=join(f.root,'tool-grants-v2.sqlite'), db=new DatabaseSync(path);
  try {db.prepare('INSERT INTO grants VALUES (?,?,?,?)').run('text.transform','a'.repeat(64),'historical-scope','2026-10-30');} finally {db.close();}
  const bytes=readFileSync(path);
  assert.deepEqual(inspectGrants(path),[{capability:'text.transform',descriptorHash:'a'.repeat(64),scope:'historical-scope'}]);
  assert.deepEqual(readFileSync(path),bytes);
});

test('M2 control schema is checked without creating or repairing a lock file', async t => {
  const {inspectControl}=await import('../src/maintenance/inspectors.ts');
  const f=fixture(t), path=join(f.root,'control.sqlite');
  assert.throws(()=>inspectControl(path));
  assert.equal(readdirSync(f.root).includes('control.sqlite'),false);
  writeFileSync(path,'');inspectControl(path);assert.equal(readFileSync(path).length,0);
  const db=new DatabaseSync(path);
  try {db.exec('CREATE TABLE foreign_data(x)');} finally {db.close();}
  const before=readFileSync(path);
  assert.throws(()=>inspectControl(path));assert.deepEqual(readFileSync(path),before);
});
