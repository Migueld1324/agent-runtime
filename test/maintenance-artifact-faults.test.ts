import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MaintenanceArtifacts} from '../src/maintenance/artifacts.ts';
import {bytesDigest} from '../src/maintenance/local-storage.ts';

// Inject only OS primitive failures; no fault callbacks in authority production APIs.
for (const code of ['EIO','ENOSPC']) for (const phase of ['write','file-sync','directory-sync']) {
  test(`M2 injected ${code} at artifact ${phase} never returns a durable reference`, t => {
    const root=fs.mkdtempSync(join(tmpdir(),'maintenance-artifact-fault-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const artifacts=new MaintenanceArtifacts(root), bytes=Buffer.from('synthetic backup');
    const retained=artifacts.save('backup',bytes,bytesDigest(bytes));
    const originalSync=fs.fsyncSync;
    const method=phase==='write'?'writeFileSync':'fsyncSync';
    t.mock.method(fs,method,(fd: number,...args: unknown[])=>{
      const directory=fs.fstatSync(fd).isDirectory();
      if (phase==='write' || directory===(phase==='directory-sync')) throw Object.assign(Error(code),{code});
      return originalSync(fd);
    });
    syncBuiltinESMExports();
    try {assert.throws(()=>artifacts.save('staging',bytes,bytesDigest(bytes)),{code});}
    finally {t.mock.restoreAll();syncBuiltinESMExports();}
    artifacts.verify(retained);
    assert.deepEqual(artifacts.read(retained),bytes);
  });
}
