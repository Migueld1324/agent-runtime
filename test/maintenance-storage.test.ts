import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync, renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SqliteMaintenancePersistence, type StorageLocation} from '../src/maintenance/sqlite-persistence.ts';
import {type RequestIdentity, type MaintenanceResult} from '../src/maintenance/contracts.ts';

function fixture(t: {after(fn: () => void): void}) {
  const root = mkdtempSync(join(tmpdir(), 'maintenance-m2-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const location: StorageLocation = {journalDirectory: join(root, 'journal'), anchorDirectory: join(root, 'anchor'), dataDirectory: join(root, 'data')};
  const store = SqliteMaintenancePersistence.provision(location);
  const binding = store.binding();
  const identity: RequestIdentity = {protocol: 'maintenance/1', installationId: binding.installationId,
    generation: 0, requestId: 'request-1', operationId: 'operation-1', method: 'enter',
    principalId: 'admin', authorizationId: 'consent', nonce: 'nonce', contentDigest: 'sha256:' + 'a'.repeat(64)};
  const result: MaintenanceResult = {protocol: 'maintenance/1', operationId: 'operation-1', outcome: 'rejected',
    code: 'maintenance_exclusion_unavailable', evidenceRef: null, admission: 'unknown'};
  return {root, location, store, binding, identity, result};
}
test('M2 real SQLite: durable claim, exact deduplication, nonce and immutable completion', async t => {
  const f = fixture(t);
  assert.equal((await f.store.claim(f.identity)).kind, 'new');
  const reopened = new SqliteMaintenancePersistence(f.location);
  assert.equal((await reopened.claim(f.identity)).kind, 'existing');
  assert.equal((await reopened.claim({...f.identity, principalId: 'other', nonce: 'unused'})).kind, 'conflict');
  assert.equal((await reopened.claim({...f.identity, requestId: 'other'})).kind, 'replay');
  assert.equal((await reopened.claim({...f.identity, requestId: 'second', nonce: 'unused'})).kind, 'new');
  await reopened.complete(f.identity, f.result);
  await reopened.complete(f.identity, f.result);
  await assert.rejects(reopened.complete(f.identity, {...f.result, code: 'maintenance_busy'}));
  assert.deepEqual(JSON.parse(JSON.stringify(await reopened.read(f.binding.installationId, 'request-1'))), {identity: f.identity, result: f.result});
  assert.equal((await reopened.readOperation(f.binding.installationId, 'operation-1')).length, 2);
});
test('M2 generation persists; request keys and nonce consumption survive generations', async t => {
  const f = fixture(t);
  await f.store.claim(f.identity);
  assert.equal(f.store.advanceGeneration(0).generation, 1);
  const store = new SqliteMaintenancePersistence(f.location);
  assert.equal(store.binding().generation, 1);
  assert.equal((await store.claim({...f.identity, generation: 1})).kind, 'conflict');
  assert.equal((await store.claim({...f.identity, generation: 1, requestId: 'next'})).kind, 'replay');
  await assert.rejects(store.claim({...f.identity, requestId: 'old-generation', nonce: 'unused'}));
  assert.throws(() => store.advanceGeneration(0));
});
test('M2 partial journal restore and truncation fail closed against retained anchor', async t => {
  const f = fixture(t), journal = join(f.location.journalDirectory, 'journal.sqlite');
  const before = readFileSync(journal);
  await f.store.claim(f.identity);
  writeFileSync(journal, before);
  await assert.rejects(f.store.readOperation(f.binding.installationId, 'operation-1'));
  assert.throws(() => new SqliteMaintenancePersistence(f.location));
});
test('M2 valid-shaped history tampering cannot pass the anchored chain', async t => {
  const f = fixture(t);
  await f.store.claim(f.identity);
  const db = new DatabaseSync(join(f.location.journalDirectory, 'journal.sqlite'));
  db.exec("UPDATE events SET payload=replace(payload,'admin','other') WHERE sequence=2"); db.close();
  await assert.rejects(f.store.read(f.binding.installationId, 'request-1'));
});
test('M2 missing journal, missing anchor, empty and substituted databases are not new installations', async t => {
  for (const name of ['journal', 'anchor']) {
    const f = fixture(t), path = join(name === 'journal' ? f.location.journalDirectory : f.location.anchorDirectory, name + '.sqlite');
    renameSync(path, join(f.root,name+'.saved'));
    assert.throws(() => new SqliteMaintenancePersistence(f.location));
    writeFileSync(path, '', {mode: 0o600});
    assert.throws(() => new SqliteMaintenancePersistence(f.location));
  }
});
test('M2 identity observes actual resources; unexpected store, sidecar and root substitution reject', t => {
  for (const name of ['runtime.sqlite', 'runtime-v2.sqlite-wal', 'unexpected']) {
    const f = fixture(t);
    writeFileSync(join(f.location.dataDirectory, name), '');
    assert.throws(() => f.store.binding());
  }
  const f = fixture(t);
  renameSync(f.location.dataDirectory, f.location.dataDirectory + '-old');
  assert.throws(() => new SqliteMaintenancePersistence(f.location));
});
test('M2 ordinary permissions, sidecars and unknown schema reject without repair', t => {
  const f = fixture(t), journal = join(f.location.journalDirectory, 'journal.sqlite');
  chmodSync(journal, 0o644);
  assert.throws(() => f.store.binding());
  chmodSync(journal, 0o600);
  const sidecar = journal + '-journal';
  writeFileSync(sidecar, 'unrecovered', {mode: 0o600});
  assert.throws(() => f.store.binding());
  assert.equal(readFileSync(sidecar, 'utf8'), 'unrecovered');
  rmSync(sidecar);
  const db = new DatabaseSync(journal); db.exec('CREATE TABLE unknown(x)'); db.close();
  assert.throws(() => f.store.binding());
});
test('M2 audit rejects raw fields and preserves query bytes', async t => {
  const f = fixture(t);
  await f.store.recordRejection({protocol: 'maintenance/1', method: 'enter', code: 'maintenance_authorization_required'});
  await assert.rejects(f.store.recordRejection({protocol: 'maintenance/1', method: 'enter', code: 'maintenance_busy', secret: 'canary'} as never));
  const path = join(f.location.journalDirectory, 'journal.sqlite'), before = readFileSync(path);
  assert.deepEqual(await f.store.readOperation(f.binding.installationId, 'unknown'), []);
  assert.deepEqual(readFileSync(path), before);
  assert.equal(before.includes(Buffer.from('canary')), false);
});

test('M2 real process death: reads refuse rollback journal; explicit recovery preserves prior evidence', async t => {
  const {spawn} = await import('node:child_process');
  const f = fixture(t);
  await f.store.claim(f.identity);
  const child = spawn(process.execPath,['--disable-warning=ExperimentalWarning','--experimental-strip-types',
    new URL('./helpers/maintenance-storage-worker.ts',import.meta.url).pathname,'crash',JSON.stringify({location:f.location})],{stdio:['pipe','pipe','pipe']});
  t.after(() => child.kill('SIGKILL'));
  const ready = await Promise.race([
    once(child.stdout,'data').then(([data]) => String(data)),
    once(child,'exit').then(() => { throw Error('worker exited before barrier'); }),
  ]);
  assert.match(ready,/READY/);
  const exit = once(child,'exit'); child.kill('SIGKILL'); await exit;
  assert.throws(() => new SqliteMaintenancePersistence(f.location));
  const recovered = SqliteMaintenancePersistence.recoverStorage(f.location,join(f.root,'recovery-evidence'));
  assert.equal((await recovered.claim(f.identity)).kind,'existing');
  assert.equal((await recovered.read(f.binding.installationId,f.identity.requestId))?.result,null);
  assert.ok(readFileSync(join(f.root,'recovery-evidence','receipt.json')).includes(Buffer.from('journal.sqlite-journal')));
});

test('M2 competing processes consume a nonce at most once', async t => {
  const {spawn} = await import('node:child_process');
  const f = fixture(t);
  const run = (requestId: string) => new Promise<string>((resolve,reject) => {
    const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--experimental-strip-types',
      new URL('./helpers/maintenance-storage-worker.ts',import.meta.url).pathname,'claim',
      JSON.stringify({location:f.location,identity:{...f.identity,requestId}})]);
    let output=''; child.stdout.on('data',chunk=>{output+=chunk;}); child.on('error',reject);
    child.on('close',code=>code===0?resolve(output):reject(Error('worker failed')));
  });
  const outputs=(await Promise.all([run('one'),run('two')])).map(text=>JSON.parse(text));
  const accepted=outputs.filter(o=>o.kind==='new').length;
  assert.ok(accepted<=1,JSON.stringify(outputs));
  assert.ok(outputs.every(o=>o.kind==='new' || o.kind==='replay' || o.code==='maintenance_persistence_failed'),JSON.stringify(outputs));
  assert.equal((await f.store.readOperation(f.binding.installationId,f.identity.operationId)).length,accepted);
  // busy_timeout=0 deliberately allows both contenders to fail closed. Verify
  // the durable nonce state after contention, without retrying inside authority.
  assert.equal((await f.store.claim({...f.identity,requestId:'after-contention'})).kind,accepted===0?'new':'replay');
  assert.equal((await f.store.readOperation(f.binding.installationId,f.identity.operationId)).length,1);
});

test('M2 confirmed results require exact anchored administrative evidence', async t => {
  const {plan,authorization}=await import('./helpers/maintenance-plan.ts');
  const {planDigest}=await import('../src/maintenance/digest.ts');
  const f=fixture(t), p=plan();
  p.binding=f.binding; p.resources=['tool-registry'];
  const a=authorization(p); a.authorizationId=f.identity.authorizationId; a.principalId=f.identity.principalId; a.nonce=f.identity.nonce;
  await f.store.claim(f.identity);
  const result: MaintenanceResult={...f.result,outcome:'not_applied',code:null,evidenceRef:'evidence-1',admission:'closed'};
  await assert.rejects(f.store.complete(f.identity,result));
  const e={protocol:'maintenance/1' as const,evidenceId:'evidence-1',sequence:f.store.nextEvidenceSequence(),
    installationId:f.binding.installationId,generation:0,operationId:f.identity.operationId,planDigest:planDigest(p),
    authorizationId:a.authorizationId,sessionRef:null,resources:p.resources,observations:[],preconditions:[],postconditions:[],
    decision:'deny' as const,durableResult:result};
  f.store.recordEvidence({plan:p,authorization:a,evidence:e});
  await f.store.complete(f.identity,result);
  assert.equal(new SqliteMaintenancePersistence(f.location).readEvidence('evidence-1')?.evidence.durableResult?.outcome,'not_applied');
  assert.throws(()=>f.store.recordEvidence({plan:p,authorization:a,evidence:e}));
});

test('M2 complete new inventory: absence is backed by provisioning, never observed as zero runs', async t => {
  const {inspectProvisionedInstallation}=await import('../src/maintenance/installation-inspector.ts');
  const f=fixture(t);
  const report=inspectProvisionedInstallation(f.location.dataDirectory,f.store.binding(),join(f.root,'inspection'));
  assert.equal(report.allRunsTerminal,true); assert.equal(report.boundary,'unavailable');
  assert.deepEqual(report.runs,[]);
  assert.equal(f.binding.inventory.filter(r=>r.kind==='store').every(r=>r.presence==='expected_absent'),true);
});

test('M2 anchor rollback, content-identical file substitution and write failure reject', async t => {
  const f=fixture(t), anchor=join(f.location.anchorDirectory,'anchor.sqlite');
  const before=readFileSync(anchor);
  await f.store.claim(f.identity);
  writeFileSync(anchor,before);
  assert.throws(()=>new SqliteMaintenancePersistence(f.location));
  const other=fixture(t), journal=join(other.location.journalDirectory,'journal.sqlite');
  const bytes=readFileSync(journal);
  renameSync(journal,join(other.root,'original.sqlite'));
  writeFileSync(journal,bytes,{mode:0o600});
  assert.throws(()=>new SqliteMaintenancePersistence(other.location));
  const third=fixture(t), readonly=join(third.location.journalDirectory,'journal.sqlite');
  chmodSync(readonly,0o400);
  try { await assert.rejects(third.store.claim(third.identity)); } finally {chmodSync(readonly,0o600);}
  assert.equal(await third.store.read(third.binding.installationId,third.identity.requestId),null);
});

test('M2 provisioned real stores have protected identities and inspectors never recreate lost data', async t => {
  const {NEW_STORE_IDS}=await import('../src/maintenance/provision-stores.ts');
  const {inspectProvisionedInstallation}=await import('../src/maintenance/installation-inspector.ts');
  const root=mkdtempSync(join(tmpdir(),'maintenance-new-stores-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const location={journalDirectory:join(root,'journal'),anchorDirectory:join(root,'anchor'),dataDirectory:join(root,'data')};
  const store=SqliteMaintenancePersistence.provision(location,NEW_STORE_IDS);
  const binding=store.binding();
  assert.equal(binding.inventory.filter(r=>r.kind==='store').every(r=>r.presence==='present'),true);
  const report=inspectProvisionedInstallation(location.dataDirectory,binding,join(root,'inspection'));
  assert.equal(report.allRunsTerminal,true);
  assert.equal(report.snapshots.length,5);
  rmSync(join(location.dataDirectory,'runtime-v2.sqlite'));
  assert.throws(()=>store.binding());
  assert.throws(()=>inspectProvisionedInstallation(location.dataDirectory,binding,join(root,'missing-store-inspection')));
});

test('M2 port composes with M1 without enabling maintenance or weakening current authorization', async t => {
  const {PortableMaintenanceBackend}=await import('../src/maintenance/backend.ts');
  const {authorityFixture,plan,authorization}=await import('./helpers/maintenance.ts');
  const f=fixture(t), p=plan();p.binding=f.binding;p.resources=['tool-registry'];
  const auth=authorityFixture(p), a=authorization(p);
  const backend=new PortableMaintenanceBackend(auth.policy,f.store);
  const request={requestId:'backend-request',plan:p,authorization:a};
  const result=await backend.enter(auth.peer,request);
  assert.equal(result.code,'maintenance_exclusion_unavailable');
  assert.equal(result.admission,'unknown');
  assert.deepEqual(await backend.enter(auth.peer,request),result);
  auth.state.consent=null;
  assert.equal((await backend.enter(auth.peer,request)).code,'maintenance_authorization_stale');
  const historical=await backend.inspect(auth.peer,f.binding,p.operationId);
  assert.equal(historical.length,1);assert.equal(historical[0].code,'maintenance_exclusion_unavailable');
});

test('M2 anchored artifact references are reverified on every history read', async t => {
  const {plan,authorization}=await import('./helpers/maintenance-plan.ts');
  const {planDigest}=await import('../src/maintenance/digest.ts');
  const {bytesDigest}=await import('../src/maintenance/local-storage.ts');
  const f=fixture(t), p=plan();p.binding=f.binding;p.resources=['tool-registry'];
  const {descriptorFingerprint,validateManifest}=await import('../src/v2/registry.ts');
  const content=Buffer.from(JSON.stringify({id:'text.transform',version:'1.0.0',description:'Synthetic fixture',adapter:'builtin.text.transform',effects:['read'],operations:['uppercase']}));
  p.contentDigest=bytesDigest(content);p.targetFingerprint='sha256:'+descriptorFingerprint(validateManifest(JSON.parse(content.toString())));
  const a=authorization(p);a.authorizationId=f.identity.authorizationId;a.principalId=f.identity.principalId;a.nonce=f.identity.nonce;
  await f.store.claim(f.identity);
  const artifact=f.store.artifacts().save('staging',content,p.contentDigest);
  const evidence={protocol:'maintenance/1' as const,evidenceId:'with-staging',sequence:f.store.nextEvidenceSequence(),installationId:f.binding.installationId,generation:0,
    operationId:f.identity.operationId,planDigest:planDigest(p),authorizationId:a.authorizationId,sessionRef:null,resources:p.resources,
    observations:[],preconditions:[],postconditions:[],decision:'deny' as const,durableResult:null};
  f.store.recordEvidence({plan:p,authorization:a,evidence,artifacts:[artifact]});
  assert.equal(f.store.readEvidence('with-staging')?.artifacts?.length,1);
  writeFileSync(join(f.location.anchorDirectory+'.artifacts',artifact.id),'changed');
  await assert.rejects(f.store.readOperation(f.binding.installationId,f.identity.operationId));
});

test('M2 real SQLITE_FULL rolls claim and nonce back together and preserves anchor', async t => {
  const f=fixture(t), path=join(f.location.journalDirectory,'journal.sqlite');
  const db=new DatabaseSync(path,{readOnly:true});
  const pages=Number(db.prepare('PRAGMA page_count').get()!.page_count);db.close();
  const limited=new SqliteMaintenancePersistence({...f.location,maxJournalPages:pages});
  const large={...f.identity,nonce:'x'.repeat(4096)};
  await assert.rejects(limited.claim(large));
  assert.equal(await f.store.read(f.binding.installationId,f.identity.requestId),null);
  assert.equal((await f.store.claim(large)).kind,'new');
});
