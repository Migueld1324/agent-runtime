/** Dedicated P19 runner: run only in a disposable privileged Linux environment.
 * Not part of test:core. Exit 77 means BLOCKED, never PASS or a skipped guarantee. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteMaintenancePersistence} from '../src/maintenance/sqlite-persistence.ts';

if (process.platform !== 'linux' || process.getuid?.() !== 0) {
  console.error('BLOCKED P19: requires disposable Linux runner with uid 0 and uid/gid 65534 available');
  process.exit(77);
}
const root=mkdtempSync(join(tmpdir(),'maintenance-p19-'));
try {
  const location={journalDirectory:join(root,'journal'),anchorDirectory:join(root,'anchor'),dataDirectory:join(root,'data')};
  SqliteMaintenancePersistence.provision(location);
  // NVM executables may live below a private home that uid 65534 cannot traverse.
  // Copy only the executable into this root-owned fixture, never relax the home.
  const childNode=join(root,'node');
  copyFileSync(process.execPath,childNode);
  chmodSync(childNode,0o755);
  // The parent is traversable so denial actually exercises the administrative
  // directories, not merely mkdtemp's outer boundary.
  chmodSync(root,0o755);
  const child=spawnSync(childNode,['--input-type=module','-e',`
    import {readFileSync,openSync,closeSync} from 'node:fs';
    if(process.getuid()!==65534) process.exit(2);
    for(const path of process.argv.slice(1)) {
      for(const action of [()=>readFileSync(path),()=>{const fd=openSync(path,'r+');closeSync(fd);}]) {
        try {action();process.exit(3);} catch(error) {if(error.code!=='EACCES')process.exit(4);}
      }
    }
  `,join(location.journalDirectory,'journal.sqlite'),join(location.anchorDirectory,'anchor.sqlite')],
  {uid:65534,gid:65534,encoding:'utf8',timeout:10000});
  assert.equal(child.error,undefined);
  assert.equal(child.status,0);
  console.log('PASS P19: distinct uid denied read/write on journal and anchor; no business resources used');
} finally {rmSync(root,{recursive:true,force:true});}
