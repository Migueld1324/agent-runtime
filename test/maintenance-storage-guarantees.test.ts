/** Focused review: deterministic syscall barriers characterize the M2 boundary.
 * All mutations use synthetic files under the authority uid, never real data. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SqliteMaintenancePersistence} from '../src/maintenance/sqlite-persistence.ts';
import {bytesDigest, privateDirectory, readProtected, readRegular} from '../src/maintenance/local-storage.ts';

function fixture(t: {after(fn: () => void): void}) {
  const root=fs.mkdtempSync(join(tmpdir(),'maintenance-review-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}

test('M2 recovery copies can span commits: digests attest bytes, not a joint snapshot', async t => {
  const root=fixture(t);
  const location={journalDirectory:join(root,'journal'),anchorDirectory:join(root,'anchor'),dataDirectory:join(root,'data')};
  const store=SqliteMaintenancePersistence.provision(location), binding=store.binding();
  const identity={protocol:'maintenance/1' as const,installationId:binding.installationId,generation:0,
    requestId:'concurrent',operationId:'operation',method:'enter' as const,principalId:'admin',
    authorizationId:'consent',nonce:'nonce',contentDigest:'sha256:'+'a'.repeat(64)};
  const journal=join(location.journalDirectory,'journal.sqlite');
  const inode=fs.statSync(journal).ino, read=fs.readFileSync;
  let committed=false;
  t.mock.method(fs,'readFileSync',(...args: Parameters<typeof fs.readFileSync>)=>{
    const bytes=read(...args);
    if (!committed && typeof args[0]==='number' && fs.fstatSync(args[0]).ino===inode) {
      committed=true;
      // A real second process commits after the journal bytes were read and
      // before anchor bytes are read. No production fault hook or timing race.
      const child=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning','--experimental-strip-types',
        new URL('./helpers/maintenance-storage-worker.ts',import.meta.url).pathname,'claim',JSON.stringify({location,identity})],
      {encoding:'utf8',timeout:10000});
      assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);
      assert.equal(JSON.parse(child.stdout).kind,'new');
    }
    return bytes;
  });
  syncBuiltinESMExports();
  const evidence=join(root,'evidence');
  let recovered: SqliteMaintenancePersistence;
  try {recovered=SqliteMaintenancePersistence.recoverStorage(location,evidence);}
  finally {t.mock.restoreAll();syncBuiltinESMExports();}
  assert.equal(committed,true);
  const journalCopy=new DatabaseSync(join(evidence,'journal-journal.sqlite'),{readOnly:true});
  const anchorCopy=new DatabaseSync(join(evidence,'anchor-anchor.sqlite'),{readOnly:true});
  try {
    assert.equal(journalCopy.prepare('SELECT MAX(sequence) AS n FROM events').get()!.n,1);
    assert.equal(anchorCopy.prepare('SELECT sequence FROM seal').get()!.sequence,2);
  } finally {journalCopy.close();anchorCopy.close();}
  const receipt=JSON.parse(fs.readFileSync(join(evidence,'receipt.json'),'utf8'));
  for (const artifact of receipt.artifacts) assert.equal(bytesDigest(fs.readFileSync(join(evidence,artifact.name))),artifact.digest);
  assert.equal((await recovered.claim(identity)).kind,'existing');
});

for (const target of ['file','parent'] as const) {
  test(`M2 readRegular detects ${target} replacement between identity check and open`, t => {
    const root=fixture(t), directory=join(root,'private');fs.mkdirSync(directory,{mode:0o700});
    const path=join(directory,'value');fs.writeFileSync(path,'original',{mode:0o600});
    const open=fs.openSync;
    let replaced=false;
    t.mock.method(fs,'openSync',(...args: Parameters<typeof fs.openSync>)=>{
      if (!replaced && args[0]===path) {
        replaced=true;
        if (target==='file') fs.renameSync(path,join(directory,'old'));
        else {fs.renameSync(directory,join(root,'old'));fs.mkdirSync(directory,{mode:0o700});}
        fs.writeFileSync(path,'replacement',{mode:0o600});
      }
      return open(...args);
    });
    syncBuiltinESMExports();
    try {assert.throws(()=>readRegular(path),{code:'maintenance_persistence_failed'});}
    finally {t.mock.restoreAll();syncBuiltinESMExports();}
    assert.equal(replaced,true);
  });
}

test('M2 protected path checks are observations, not fencing against the authority uid', t => {
  const root=fixture(t), path=join(root,'value');fs.writeFileSync(path,'original',{mode:0o600});
  const stat=fs.lstatSync;
  let replaced=false;
  t.mock.method(fs,'lstatSync',(...args: Parameters<typeof fs.lstatSync>)=>{
    const observed=stat(...args);
    // After protectedFile's mode/owner observation but before readRegular's
    // independent identity observation, an authority-uid writer replaces it.
    if (!replaced && args[0]===path && args[1]===undefined) {
      replaced=true;fs.renameSync(path,join(root,'old'));
      fs.writeFileSync(path,'replacement',{mode:0o644});fs.chmodSync(path,0o644);
    }
    return observed;
  });
  syncBuiltinESMExports();
  try {assert.equal(readProtected(path).toString(),'replacement');}
  finally {t.mock.restoreAll();syncBuiltinESMExports();}
  assert.equal(replaced,true);
  assert.throws(()=>readProtected(path),{code:'maintenance_persistence_failed'});
});

test('M2 rejects ordinary-user-writable ancestors and static file aliases', t => {
  const root=fixture(t), parent=join(root,'parent'), directory=join(parent,'private');
  fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(directory,{mode:0o700});
  fs.chmodSync(parent,0o777);
  assert.throws(()=>privateDirectory(directory),{code:'maintenance_persistence_failed'});
  fs.chmodSync(parent,0o700);
  const path=join(directory,'value');fs.writeFileSync(path,'synthetic',{mode:0o600});
  const symlink=join(directory,'symlink');fs.symlinkSync(path,symlink);
  assert.throws(()=>readProtected(symlink),{code:'maintenance_persistence_failed'});
  fs.linkSync(path,join(directory,'hardlink'));
  assert.throws(()=>readProtected(path),{code:'maintenance_persistence_failed'});
});
