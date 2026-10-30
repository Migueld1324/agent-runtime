/** Read-only format interpreters, never runtime constructors or graph execution.
 * Their reports are observations; a verified inventory and M3 boundary are separate. */
import {lstatSync, readdirSync, openSync, readSync, closeSync, constants} from 'node:fs';
import {dirname, basename, join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fail} from './contracts.ts';
import {criterionHash} from '../v3/objective.ts';
import {physical, bytesDigest} from './local-storage.ts';

export interface RunInspection { runId: string; version: 'v1' | 'v2' | 'v3'; terminal: boolean; historical: boolean; }
export interface CheckpointInspection { runs: RunInspection[]; integrity: 'ok'; schema: string; recoveryPerformed: false; }
function invalid(): never { return fail('maintenance_inventory_invalid'); }
type ObjectData = Record<string, any>;
function object(v: unknown): ObjectData {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid();
  return v as ObjectData;
}
function json(v: unknown): ObjectData {
  if (!(v instanceof Uint8Array) && typeof v !== 'string') invalid();
  const bytes = typeof v === 'string' ? Buffer.from(v) : Buffer.from(v);
  if (bytes.length > 4 * 1024 * 1024) invalid();
  return object(JSON.parse(bytes.toString('utf8')));
}
function openReadOnly(path: string): DatabaseSync {
  physical(path);
  if (!lstatSync(path).isFile()) invalid();
  // Pending rollback/WAL requires a separately evidenced storage recovery/snapshot.
  if (readdirSync(dirname(path)).some(n => n.startsWith(basename(path) + '-') &&
      ['-wal', '-shm', '-journal'].some(suffix => n === basename(path) + suffix))) invalid();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const header = Buffer.alloc(20);
  try { if (readSync(fd, header, 0, 20, 0) !== 20 || header[18] !== 1 || header[19] !== 1) invalid(); } finally { closeSync(fd); }
  const db = new DatabaseSync(path, {readOnly: true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; BEGIN');
    const checks = db.prepare('PRAGMA integrity_check').all();
    if (checks.length !== 1 || Object.values(checks[0])[0] !== 'ok') invalid();
    return db;
  } catch { db.close(); return invalid(); }
}
function tables(db: DatabaseSync, expected: string[]): void {
  const names = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view','trigger') ORDER BY name").all().map(r => r.name);
  if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) invalid();
}
function columns(db: DatabaseSync, table: string, expected: string[]): void {
  const actual = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) invalid();
}
function close(db: DatabaseSync | undefined): void { if (db) { try { db.exec('ROLLBACK'); } finally { db.close(); } } }
const NODES = {
  v1: ['draft','approval','write'],
  v2: ['authorization','execute'],
  v3: ['intake','model','authorization','execute','check_objective','model_recovery','verification_recovery'],
};
function pending(cp: ObjectData, versionName: 'v1' | 'v2' | 'v3'): boolean {
  const versions = object(cp.channel_versions), seen = object(cp.versions_seen);
  for (const observations of Object.values(seen)) object(observations);
  for (const channel of Object.keys(cp.channel_values)) {
    if ((channel.startsWith('branch:') || channel === '__start__') && !Object.hasOwn(versions, channel)) invalid();
  }
  let pending = false;
  for (const [channel, version] of Object.entries(versions)) {
    if (typeof version !== 'string' && (!Number.isSafeInteger(version) || (version as number) < 0)) invalid();
    if (channel === '__start__') { if (Object.hasOwn(cp.channel_values, channel)) pending = true; continue; }
    if (channel.startsWith('branch:to:')) {
      const node = channel.slice('branch:to:'.length), prior = seen[node]?.[channel];
      if (!NODES[versionName].includes(node)) invalid();
      if (prior !== undefined && (typeof prior !== typeof version || (typeof prior !== 'string' && !Number.isSafeInteger(prior)))) invalid();
      if (Object.hasOwn(cp.channel_values, channel) && (prior === undefined || typeof prior !== typeof version || prior < version)) pending = true;
    } else if (channel.startsWith('branch:') || channel.startsWith('start:') || channel === '__pregel_tasks') {
      // Older channel scheduling is not inferred from an empty output field.
      invalid();
    }
  }
  if (cp.channel_values.__pregel_tasks !== undefined && (!Array.isArray(cp.channel_values.__pregel_tasks) || cp.channel_values.__pregel_tasks.length)) pending = true;
  return pending;
}
/** Known SqliteSaver schema with checkpoint format 4. Unknown encodings/schedulers
 * reject; never interprets next=[] or status alone as terminal proof. */
export function inspectCheckpoints(path: string, version: 'v1' | 'v2' | 'v3', operationsPath?: string): CheckpointInspection {
  let db: DatabaseSync | undefined, ledger: DatabaseSync | undefined;
  try {
    const identity = physical(path);
    db = openReadOnly(path); tables(db, ['checkpoints', 'writes']);
    columns(db, 'checkpoints', ['thread_id','checkpoint_ns','checkpoint_id','parent_checkpoint_id','type','checkpoint','metadata']);
    const writeColumns = db.prepare('PRAGMA table_info(writes)').all().map(r => r.name);
    if (!['thread_id,checkpoint_ns,checkpoint_id,task_id,idx,channel,type,value',
      'thread_id,checkpoint_ns,checkpoint_id,task_id,task_path,idx,channel,type,value',
      'thread_id,checkpoint_ns,checkpoint_id,task_id,idx,channel,type,value,task_path'].includes(writeColumns.join(','))) invalid();
    const orphan = db.prepare(`SELECT 1 FROM writes w LEFT JOIN checkpoints c ON w.thread_id=c.thread_id AND w.checkpoint_ns=c.checkpoint_ns AND w.checkpoint_id=c.checkpoint_id WHERE c.checkpoint_id IS NULL LIMIT 1`).get();
    if (orphan) invalid();
    const rows = db.prepare('SELECT * FROM checkpoints ORDER BY thread_id,checkpoint_id').all();
    const latest = new Map<string, {cp: ObjectData; metadata: ObjectData; id: string}>();
    for (const row of rows) {
      if (typeof row.thread_id !== 'string' || row.checkpoint_ns !== '' || row.type !== 'json') invalid();
      const cp = json(row.checkpoint), metadata = json(row.metadata);
      if (cp.v !== 4 || cp.id !== row.checkpoint_id || typeof cp.ts !== 'string' || !Number.isInteger(metadata.step) || !['input','loop','update'].includes(metadata.source)) invalid();
      object(cp.channel_values); object(cp.channel_versions); object(cp.versions_seen);
      // The known saver emits monotonically ordered checkpoint IDs in a single
      // history. A fork, cycle or disconnected tip cannot select a terminal run.
      const previous = latest.get(row.thread_id);
      if (row.parent_checkpoint_id !== (previous?.id ?? null)) invalid();
      pending(cp, version);
      latest.set(row.thread_id, {cp, metadata, id: String(row.checkpoint_id)});
    }
    if (version === 'v3' && operationsPath) {
      ledger = openReadOnly(operationsPath); operationsSchema(ledger);
      const meta = ledger.prepare('SELECT * FROM metadata').all();
      if (meta.length !== 1 || meta[0].version !== 1 || typeof meta[0].id !== 'string') invalid();
      for (const row of ledger.prepare('SELECT run_id FROM runs').all()) if (!latest.has(String(row.run_id))) invalid();
      for (const table of ['invocations','recoveries']) {
        if (ledger.prepare(`SELECT 1 FROM ${table} x LEFT JOIN runs r ON x.run_id=r.run_id WHERE r.run_id IS NULL LIMIT 1`).get()) invalid();
      }
    }
    const runs: RunInspection[] = [];
    for (const [runId, {cp, metadata, id}] of latest) {
      const v = cp.channel_values;
      if (v.runId !== runId) invalid();
      const hasWrites = !!db.prepare('SELECT 1 FROM writes WHERE thread_id=? AND checkpoint_ns=? AND checkpoint_id=? LIMIT 1').get(runId, '', id);
      let terminal = !pending(cp, version) && !hasWrites && metadata.source === 'loop';
      let historical = version !== 'v3' || v.stateVersion === undefined;
      if (version === 'v1') {
        terminal &&= (v.approved === false && typeof v.result === 'string' &&
          (v.result === 'Denied by user' || v.result.startsWith('Policy denied: ')) && !!cp.versions_seen.approval) ||
          (v.approved === true && typeof v.result === 'string' && /^filesystem\.write: (created|already_exists) \(.+\)$/.test(v.result) && !!cp.versions_seen.write);
      } else if (version === 'v2') {
        terminal &&= (v.status === 'completed' && typeof v.result === 'string' && !!cp.versions_seen.execute) ||
          (v.status === 'denied' && v.authorized === false && !!cp.versions_seen.authorization);
      } else {
        if (v.stateVersion !== undefined && v.stateVersion !== 1 && v.stateVersion !== 2) invalid();
        terminal &&= typeof v.result==='string' && ['completed','denied','failed','budget_exhausted'].includes(v.status) &&
          !['executing','uncertain'].includes(v.invocationStatus) && !v.authorized && v.runtimeError?.retryable !== true;
        if (v.status === 'completed') {
          terminal &&= !v.pendingToolId && !v.runtimeError;
          if (!historical && criterionHash(v as Parameters<typeof criterionHash>[0]) !== v.criterionHash) invalid();
          if (!historical) terminal &&= v.verification?.outcome === 'passed' && v.verification.criterionHash === v.criterionHash &&
            v.verification.criterionId === v.criterion?.id && v.verification.criterionVersion === v.criterion?.version &&
            v.verification.reason==='content_matches' && v.verification.retryable===false && typeof v.verification.checkedAt==='string' &&
            typeof v.criterion.expectedContent==='string' && v.verification.actualHash===bytesDigest(v.criterion.expectedContent).slice(7) &&
            v.verification.bytes===Buffer.byteLength(v.criterion.expectedContent,'utf8') && /^[a-f0-9]{64}$/.test(v.verification.descriptorHash ?? '');
        }
        if (v.status==='failed') terminal &&= (v.runtimeError?.retryable===false) || v.verification?.outcome==='failed' ||
          (v.verification?.outcome==='inconclusive' && v.verification.retryable===false && v.recoveryCount===2);
        if (v.status==='budget_exhausted') terminal &&= Number.isSafeInteger(v.toolCount) && v.toolCount>=5;
        if (v.stateVersion === 2) {
          if (!ledger) invalid();
          const meta = ledger.prepare('SELECT id FROM metadata').get()!;
          const run = ledger.prepare('SELECT * FROM runs WHERE run_id=?').get(runId);
          if (!run || v.operationsStoreId !== meta.id || run.criterion_hash !== v.criterionHash || run.model_id !== v.modelId) invalid();
          const invocations = ledger.prepare('SELECT * FROM invocations WHERE run_id=? ORDER BY ordinal').all(runId);
          const observations = v.observations;
          if (!Array.isArray(observations)) invalid();
          const ids = new Set<string>();
          for (const invocation of invocations) {
            const binding = object(JSON.parse(String(invocation.binding)));
            if (invocation.id !== `${runId}:${invocation.ordinal}` || binding.runId !== runId || binding.ordinal !== invocation.ordinal ||
                binding.criterionHash !== v.criterionHash || binding.scopeId !== v.scopeId || ids.has(String(invocation.id))) invalid();
            ids.add(String(invocation.id));
            if (!['prepared','authorized','executing','succeeded','failed','uncertain'].includes(String(invocation.status))) invalid();
            if (!['not_requested','pending','succeeded','failed'].includes(String(invocation.grant_status))) invalid();
            if (['prepared','authorized','executing','uncertain'].includes(String(invocation.status)) || ['pending','failed'].includes(String(invocation.grant_status))) terminal = false;
            const matching = observations.filter((o: ObjectData) => o.invocationId === invocation.id);
            if (invocation.status === 'succeeded' && (typeof invocation.result !== 'string' || matching.length !== 1 || matching[0].result !== invocation.result || matching[0].toolId !== binding.toolId)) invalid();
            if (invocation.status !== 'succeeded' && matching.length) invalid();
          }
          if (observations.some((o: ObjectData) => !ids.has(o.invocationId))) invalid();
          const recoveries = ledger.prepare('SELECT * FROM recoveries WHERE run_id=? ORDER BY count').all(runId);
          if (recoveries.length > 2 || v.recoveryCount !== recoveries.length || recoveries.some((r, i) =>
            r.count !== i + 1 || r.dispatched !== 1 || !['legacy','model','verification','tool'].includes(String(r.target)) ||
            (r.target === 'legacy' ? r.checkpoint_id !== 'legacy' :
              !rows.some(cp => cp.thread_id === runId && cp.checkpoint_id === r.checkpoint_id)))) terminal = false;
        }
      }
      runs.push({runId, version, terminal, historical});
    }
    if (physical(path) !== identity) invalid();
    return {runs, integrity: 'ok', schema: `checkpoint-${version}/1`, recoveryPerformed: false};
  } catch { return invalid(); } finally { close(ledger); close(db); }
}

export function inspectGrants(path: string): readonly {capability: string; descriptorHash: string; scope: string}[] {
  let db: DatabaseSync | undefined;
  try {
    db = openReadOnly(path); tables(db, ['grants']);
    columns(db,'grants',['capability','descriptor_hash','scope','created_at']);
    return db.prepare('SELECT * FROM grants ORDER BY capability,descriptor_hash,scope').all().map(row => {
      if (typeof row.capability !== 'string' || !/^[a-z]+(?:\.[a-z]+)*$/.test(row.capability) ||
          typeof row.descriptor_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.descriptor_hash) ||
          typeof row.scope !== 'string' || !row.scope.length || typeof row.created_at !== 'string') invalid();
      return {capability:row.capability,descriptorHash:row.descriptor_hash,scope:row.scope};
    });
  } catch { return invalid(); } finally { close(db); }
}

function operationsSchema(db: DatabaseSync): void {
  tables(db,['metadata','runs','invocations','recoveries']);
  columns(db,'metadata',['id','version']);
  columns(db,'runs',['run_id','criterion_hash','model_id']);
  columns(db,'invocations',['id','run_id','ordinal','binding','status','result','grant_status']);
  columns(db,'recoveries',['run_id','request_id','target','count','checkpoint_id','dispatched']);
}
export function inspectOperationsInventory(path: string, expectedRuns: readonly string[]): void {
  let db: DatabaseSync | undefined;
  try {
    db=openReadOnly(path); operationsSchema(db);
    const metadata=db.prepare('SELECT * FROM metadata').all();
    if (metadata.length!==1 || metadata[0].version!==1 || typeof metadata[0].id!=='string') invalid();
    const runs=db.prepare('SELECT run_id FROM runs').all().map(row=>String(row.run_id));
    if (runs.some(id=>!expectedRuns.includes(id))) invalid();
    for (const table of ['invocations','recoveries']) if (db.prepare(`SELECT 1 FROM ${table} x LEFT JOIN runs r ON x.run_id=r.run_id WHERE r.run_id IS NULL LIMIT 1`).get()) invalid();
  } catch { return invalid(); } finally { close(db); }
}

/** ADR-086 control is either the explicitly provisioned empty lock file or an
 * empty SQLite database. It must never contain operational/application tables. */
export function inspectControl(path: string): void {
  let db: DatabaseSync | undefined;
  try {
    physical(path);
    if (!lstatSync(path).isFile()) invalid();
    if (readdirSync(dirname(path)).some(name => name.startsWith(basename(path) + '-'))) invalid();
    if (lstatSync(path).size === 0) return;
    db = openReadOnly(path);
    if (db.prepare("SELECT 1 FROM sqlite_schema LIMIT 1").get()) invalid();
  } catch { return invalid(); } finally { close(db); }
}
