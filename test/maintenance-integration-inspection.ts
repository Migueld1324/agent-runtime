/** Inspect only the stores produced by integrations in a disposable checkout. */
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareInspectionSnapshot} from '../src/maintenance/artifacts.ts';
import {inspectCheckpoints} from '../src/maintenance/inspectors.ts';
const root=mkdtempSync(join(tmpdir(),'maintenance-integration-inspection-'));
const ops=prepareInspectionSnapshot(join(process.cwd(),'data/runtime-operations.sqlite'),join(root,'operations'));
for (const [version,name] of [['v1','runtime.sqlite'],['v2','runtime-v2.sqlite'],['v3','runtime-v3.sqlite']] as const) {
  const snapshot=prepareInspectionSnapshot(join(process.cwd(),'data',name),join(root,version));
  const report=inspectCheckpoints(snapshot.database,version,version==='v3'?ops.database:undefined);
  assert.ok(report.runs.length>0);
  if (version==='v1' || version==='v3') assert.equal(report.runs.every(run=>run.terminal),true);
  else assert.equal(report.runs.some(run=>!run.terminal),true);
  console.log(JSON.stringify(report));
}
