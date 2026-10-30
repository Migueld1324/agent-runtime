import {chmodSync, lstatSync, mkdirSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {ERROR_CODES, wireSnapshot, parseBinding, parseEvidence, parsePlan, parseAuthorization, parseRequestIdentity, parseRequestRecord, parseResult, type MaintenancePlan, type MaintenanceAuthorization, type MaintenanceEvidence, type InstallationBinding, type RequestIdentity, type RequestRecord, type MaintenanceResult, type Claim} from './contracts.ts';
import {verifyDescriptorArtifact} from './descriptor-artifacts.ts';
import {MaintenanceArtifacts, type ArtifactReference} from './artifacts.ts';
import type {NewStoreId} from './provision-stores.ts';
import {provisionInventory, verifyInventory} from './inventory.ts';
import {canonical, planDigest} from './digest.ts';
import type {MaintenancePersistence, RejectionAudit} from './persistence.ts';
import {bytesDigest, physical, privateDirectory, protectedFile, storageFailure, syncDirectory, writeExclusive, readProtected} from './local-storage.ts';

export interface StorageLocation { journalDirectory: string; anchorDirectory: string; dataDirectory: string; maxJournalPages?: number; }
type Event = {sequence: number; previous: string; payload: string; hash: string};
export interface AdministrativeEvidenceRecord { plan: MaintenancePlan; authorization: MaintenanceAuthorization; evidence: MaintenanceEvidence; artifacts?: readonly ArtifactReference[]; }
type State = {evidence: Map<string, AdministrativeEvidenceRecord>; binding: InstallationBinding; records: Map<string, RequestRecord>; nonces: Set<string>; head: string; sequence: number};
const RECOVERY = Symbol('explicit-storage-recovery');
const ZERO = 'sha256:' + '0'.repeat(64);
const eventHash = (sequence: number, previous: string, payload: string) => bytesDigest(`maintenance-journal/1\n${sequence}\n${previous}\n${payload}`);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Concrete M1 port. Call only behind MaintenancePolicy. Local candidate profile,
 * no business writes, sessions, OS exclusion or admission actuator. */
export class SqliteMaintenancePersistence implements MaintenancePersistence {
  readonly #location: StorageLocation;
  readonly #journal: string;
  readonly #anchor: string;
  constructor(location: StorageLocation, recovery?: typeof RECOVERY) {
    if (location.maxJournalPages !== undefined && (!Number.isSafeInteger(location.maxJournalPages) || location.maxJournalPages < 2)) storageFailure();
    this.#location = {...location};
    this.#journal = join(location.journalDirectory, 'journal.sqlite');
    this.#anchor = join(location.anchorDirectory, 'anchor.sqlite');
    if (recovery !== RECOVERY) this.#transaction(false, () => undefined);
  }
  /** Only new, private directories; never adopts an existing installation. */
  static provision(location: StorageLocation, initialize: readonly NewStoreId[] = []): SqliteMaintenancePersistence {
    const paths = [location.dataDirectory,location.journalDirectory,location.anchorDirectory];
    if (paths.some((a,i)=>paths.some((b,j)=>i!==j && (a===b || a.startsWith(b+'/'))))) storageFailure();
    const binding = provisionInventory(location.dataDirectory, initialize);
    if (binding.generation !== 0 || location.journalDirectory === location.anchorDirectory) storageFailure();
    privateDirectory(dirname(location.journalDirectory));
    privateDirectory(dirname(location.anchorDirectory));
    mkdirSync(location.journalDirectory, {mode: 0o700});
    mkdirSync(location.anchorDirectory, {mode: 0o700});
    mkdirSync(location.anchorDirectory + '.artifacts', {mode: 0o700});
    syncDirectory(dirname(location.anchorDirectory));
    const journal = join(location.journalDirectory, 'journal.sqlite');
    const anchor = join(location.anchorDirectory, 'anchor.sqlite');
    writeExclusive(journal, ''); writeExclusive(anchor, '');
    const db = new DatabaseSync(journal);
    try {
      db.prepare('ATTACH DATABASE ? AS anchor').run(anchor);
      configure(db);
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE events (sequence INTEGER PRIMARY KEY, previous TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL);
        CREATE TABLE anchor.seal (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL,
          installation TEXT NOT NULL, journal_identity TEXT NOT NULL, anchor_identity TEXT NOT NULL,
          sequence INTEGER NOT NULL, hash TEXT NOT NULL);`);
      const payload = canonical({kind: 'provision', binding});
      const hash = eventHash(1, ZERO, payload);
      db.prepare('INSERT INTO events VALUES (1,?,?,?)').run(ZERO, payload, hash);
      db.prepare('INSERT INTO anchor.seal VALUES (1,1,?,?,?,1,?)').run(binding.installationId, physical(journal), physical(anchor), hash);
      db.exec('COMMIT');
    } finally { db.close(); }
    chmodSync(journal, 0o600); chmodSync(anchor, 0o600);
    syncDirectory(location.journalDirectory); syncDirectory(location.anchorDirectory);
    return new SqliteMaintenancePersistence(location);
  }
  /** Explicit native rollback recovery, authority-only. The caller must arrange
   * quiescence of administrative writers for a coherent forensic capture; M2
   * neither establishes nor proves that boundary. Copies are sequential byte
   * observations, not an atomic snapshot or a restorable backup guarantee.
   * The later SQLite lock/verification validates live state, not capture coherence.
   * No manual sidecar deletion, missing database creation or business repair. */
  static recoverStorage(location: StorageLocation, evidenceDirectory: string): SqliteMaintenancePersistence {
    privateDirectory(dirname(evidenceDirectory));
    for (const [directory, base] of [[location.journalDirectory, 'journal.sqlite'], [location.anchorDirectory, 'anchor.sqlite']]) {
      privateDirectory(directory); protectedFile(join(directory, base));
      for (const name of readdirSync(directory)) {
        if (name !== base && name !== base + '-journal' && !new RegExp('^' + base.replace('.', '\\.') + '-mj[0-9A-Fa-f]+$').test(name)) storageFailure();
        protectedFile(join(directory, name));
      }
    }
    mkdirSync(evidenceDirectory, {mode: 0o700});
    const receipt: {name: string; digest: string}[] = [];
    for (const [directory, prefix] of [[location.journalDirectory, 'journal'], [location.anchorDirectory, 'anchor']]) {
      for (const name of readdirSync(directory).sort()) {
        const bytes = readProtected(join(directory, name), 64 * 1024 * 1024);
        const artifact = prefix + '-' + name;
        writeExclusive(join(evidenceDirectory, artifact), bytes);
        receipt.push({name: artifact, digest: bytesDigest(bytes)});
      }
    }
    const encoded = canonical({version: 'maintenance-storage-recovery/1', artifacts: receipt});
    writeExclusive(join(evidenceDirectory, 'receipt.json'), encoded);
    // Digests attest captured bytes only, not simultaneous source state. SQLite's
    // locks/rollback decide recovery of live databases; the copies are not replayed.
    // Captured copies survive failure. Native rollback may already have changed
    // source files/sidecars before a later validation fails; no byte-preservation
    // guarantee for the originals once SQLite has been allowed to open them.
    let db: DatabaseSync | undefined;
    try {
      const main = pathToFileURL(join(location.journalDirectory, 'journal.sqlite')); main.searchParams.set('mode', 'rw');
      const anchor = pathToFileURL(join(location.anchorDirectory, 'anchor.sqlite')); anchor.searchParams.set('mode', 'rw');
      db = new DatabaseSync(main.href);
      db.prepare('ATTACH DATABASE ? AS anchor').run(anchor.href);
      configure(db);
      db.exec('BEGIN EXCLUSIVE');
      const recovering = new SqliteMaintenancePersistence(location, RECOVERY);
      const state = recovering.#verify(db);
      verifyInventory(location.dataDirectory, state.binding);
      recovering.#append(db, state, {kind: 'storage_recovery', receiptDigest: bytesDigest(encoded)});
      db.exec('COMMIT');
    } catch { return storageFailure(); }
    finally { if (db) { try { if (db.isTransaction) db.exec('ROLLBACK'); } finally { db.close(); } } }
    const store = new SqliteMaintenancePersistence(location);
    return store;
  }
  #checkFiles(): void {
    privateDirectory(this.#location.anchorDirectory + '.artifacts');
    for (const dir of [this.#location.journalDirectory, this.#location.anchorDirectory]) privateDirectory(dir);
    protectedFile(this.#journal); protectedFile(this.#anchor);
    for (const path of [this.#journal, this.#anchor]) {
      const bytes = readProtected(path, 64 * 1024 * 1024);
      if (bytes.length < 20 || bytes.subarray(0,16).toString() !== 'SQLite format 3\0' || bytes[18] !== 1 || bytes[19] !== 1) storageFailure();
    }
    // Read/probe must not silently perform rollback recovery, create SHM or drop WAL.
    for (const [dir, name] of [[this.#location.journalDirectory, 'journal.sqlite'], [this.#location.anchorDirectory, 'anchor.sqlite']]) {
      if (readdirSync(dir).some(n => n !== name)) storageFailure();
    }
    if (lstatSync(this.#journal).dev !== lstatSync(this.#anchor).dev) storageFailure();
  }
  #transaction<T>(write: boolean, action: (db: DatabaseSync, state: State) => T): T {
    let db: DatabaseSync | undefined;
    try {
      this.#checkFiles();
      db = new DatabaseSync(this.#journal, {readOnly: !write});
      const uri = pathToFileURL(this.#anchor); uri.searchParams.set('mode', write ? 'rw' : 'ro');
      db.prepare('ATTACH DATABASE ? AS anchor').run(uri.href);
      if (write) configure(db, this.#location.maxJournalPages); else db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=0');
      db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
      const state = this.#verify(db);
      verifyInventory(this.#location.dataDirectory, state.binding);
      const result = action(db, state);
      db.exec('COMMIT');
      return result;
    } catch { return storageFailure(); }
    finally { if (db) { try { if (db.isTransaction) db.exec('ROLLBACK'); } finally { db.close(); } } }
  }
  #verify(db: DatabaseSync): State {
    for (const schema of ['main', 'anchor']) {
      const check = db.prepare(`PRAGMA ${schema}.integrity_check`).all();
      if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') storageFailure();
      if (Object.values(db.prepare(`PRAGMA ${schema}.journal_mode`).get()!)[0] !== 'delete') storageFailure();
      const columns = db.prepare(`PRAGMA ${schema}.table_info(${schema === 'main' ? 'events' : 'seal'})`).all().map(row=>row.name);
      const expected = schema === 'main' ? ['sequence','previous','payload','hash'] : ['singleton','version','installation','journal_identity','anchor_identity','sequence','hash'];
      if (JSON.stringify(columns)!==JSON.stringify(expected)) storageFailure();
      const names = db.prepare(`SELECT name FROM ${schema}.sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name`).all();
      if (JSON.stringify(names.map(r => r.name)) !== JSON.stringify([schema === 'main' ? 'events' : 'seal'])) storageFailure();
    }
    const seals = db.prepare('SELECT * FROM anchor.seal').all();
    if (seals.length !== 1) storageFailure();
    const seal = seals[0];
    if (seal.singleton !== 1 || seal.version !== 1 || seal.journal_identity !== physical(this.#journal) || seal.anchor_identity !== physical(this.#anchor)) storageFailure();
    const events = db.prepare('SELECT * FROM events ORDER BY sequence').all() as unknown as Event[];
    let binding: InstallationBinding | undefined;
    const records = new Map<string, RequestRecord>(), nonces = new Set<string>(), evidence = new Map<string, AdministrativeEvidenceRecord>();
    let head = ZERO, sequence = 0;
    for (const event of events) {
      if (event.sequence !== ++sequence || event.previous !== head || event.hash !== eventHash(sequence, head, event.payload)) storageFailure();
      const p = JSON.parse(event.payload);
      if (canonical(p) !== event.payload) storageFailure();
      if (sequence === 1) {
        if (p.kind !== 'provision' || Object.keys(p).length !== 2) storageFailure();
        binding = parseBinding(p.binding);
        if (binding.generation !== 0 || binding.installationId !== seal.installation) storageFailure();
      } else {
        if (!binding) storageFailure();
        switch (p.kind) {
          case 'claim': {
            if (Object.keys(p).length !== 2) storageFailure();
            const identity = parseRequestIdentity(p.identity);
            if (identity.installationId !== binding.installationId || identity.generation !== binding.generation || records.has(identity.requestId) || nonces.has(identity.nonce)) storageFailure();
            records.set(identity.requestId, parseRequestRecord({identity, result: null})); nonces.add(identity.nonce); break;
          }
          case 'complete': {
            if (Object.keys(p).length !== 3) storageFailure();
            const identity = parseRequestIdentity(p.identity), result = parseResult(p.result);
            const old = records.get(identity.requestId);
            if (!old || !same(old.identity, identity) || old.result !== null || result.operationId !== identity.operationId) storageFailure();
            validateResultEvidence(identity, result, evidence);
            records.set(identity.requestId, parseRequestRecord({identity, result})); break;
          }
          case 'evidence': {
            if (Object.keys(p).length !== 2) storageFailure();
            const record = validateEvidence(p.record, {binding, records, nonces, evidence, sequence: sequence - 1, head});
            this.#verifyArtifacts(record);
            evidence.set(record.evidence.evidenceId, record); break;
          }
          case 'storage_recovery':
            if (Object.keys(p).length !== 2 || typeof p.receiptDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(p.receiptDigest)) storageFailure();
            break;
          case 'rejection': validateRejection(p.event); if (Object.keys(p).length !== 2) storageFailure(); break;
          case 'generation':
            if (Object.keys(p).length !== 2 || p.generation !== binding.generation + 1 || !Number.isSafeInteger(p.generation)) storageFailure();
            binding = parseBinding({...binding, generation: p.generation}); break;
          default: storageFailure();
        }
      }
      head = event.hash;
    }
    if (!binding || seal.sequence !== sequence || seal.hash !== head) storageFailure();
    return {binding, records, nonces, evidence, head, sequence};
  }
  #append(db: DatabaseSync, state: State, payload: unknown): void {
    const encoded = canonical(payload), sequence = state.sequence + 1;
    const hash = eventHash(sequence, state.head, encoded);
    db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(sequence, state.head, encoded, hash);
    db.prepare('UPDATE anchor.seal SET sequence=?,hash=? WHERE singleton=1').run(sequence, hash);
  }
  #verifyArtifacts(record: AdministrativeEvidenceRecord): void {
    const artifacts = new MaintenanceArtifacts(this.#location.anchorDirectory + '.artifacts');
    const ids = new Set<string>();
    for (const reference of record.artifacts ?? []) {
      const id = verifyDescriptorArtifact(record.plan,reference,artifacts.read(reference));
      if (id !== null) ids.add(id);
    }
    if (ids.size > 1) storageFailure();
  }
  artifacts(): MaintenanceArtifacts {
    this.#transaction(false, () => undefined);
    return new MaintenanceArtifacts(this.#location.anchorDirectory + '.artifacts');
  }
  recordEvidence(input: AdministrativeEvidenceRecord): void {
    this.#transaction(true, (db, s) => {
      const record = validateEvidence(input, s);
      this.#verifyArtifacts(record);
      this.#append(db, s, {kind: 'evidence', record});
    });
  }
  readEvidence(evidenceId: string): AdministrativeEvidenceRecord | null {
    return this.#transaction(false, (_db, s) => s.evidence.get(evidenceId) ?? null);
  }
  nextEvidenceSequence(): number { return this.#transaction(false, (_db, s) => s.sequence + 1); }
  binding(): InstallationBinding { return this.#transaction(false, (_db, s) => s.binding); }
  /** Storage generation only; never establishes successor authority or reopens admission. */
  advanceGeneration(expected: number): InstallationBinding {
    return this.#transaction(true, (db, s) => {
      if (s.binding.generation !== expected || !Number.isSafeInteger(expected + 1)) storageFailure();
      this.#append(db, s, {kind: 'generation', generation: expected + 1});
      return parseBinding({...s.binding, generation: expected + 1});
    });
  }
  async claim(input: RequestIdentity): Promise<Claim> {
    const identity = parseRequestIdentity(input);
    return this.#transaction(true, (db, s) => {
      if (identity.installationId !== s.binding.installationId) storageFailure();
      const old = s.records.get(identity.requestId);
      if (old) return same(old.identity, identity) ? {kind: 'existing', record: old} : {kind: 'conflict'};
      if (s.nonces.has(identity.nonce)) return {kind: 'replay'};
      if (identity.generation !== s.binding.generation) storageFailure();
      this.#append(db, s, {kind: 'claim', identity}); return {kind: 'new'};
    });
  }
  async complete(input: RequestIdentity, value: MaintenanceResult): Promise<void> {
    const identity = parseRequestIdentity(input), result = parseResult(value);
    this.#transaction(true, (db, s) => {
      const old = s.records.get(identity.requestId);
      if (!old || !same(identity, old.identity) || result.operationId !== identity.operationId) storageFailure();
      if (old.result !== null) { if (!same(old.result, result)) storageFailure(); return; }
      validateResultEvidence(identity, result, s.evidence);
      this.#append(db, s, {kind: 'complete', identity, result});
    });
  }
  async read(installationId: string, requestId: string): Promise<RequestRecord | null> {
    return this.#transaction(false, (_db, s) => {
      if (s.binding.installationId !== installationId) storageFailure();
      return s.records.get(requestId) ?? null;
    });
  }
  async readOperation(installationId: string, operationId: string): Promise<readonly RequestRecord[]> {
    return this.#transaction(false, (_db, s) => {
      if (s.binding.installationId !== installationId) storageFailure();
      return [...s.records.values()].filter(r => r.identity.operationId === operationId);
    });
  }
  async recordRejection(event: RejectionAudit): Promise<void> {
    event = wireSnapshot(event) as RejectionAudit;
    validateRejection(event);
    this.#transaction(true, (db, s) => this.#append(db, s, {kind: 'rejection', event}));
  }
}
function validateRejection(event: RejectionAudit): void {
  if (!event || canonical(Object.keys(event).sort()) !== canonical(['code', 'method', 'protocol']) || event.protocol !== 'maintenance/1' ||
      !['enter', 'apply', 'recover', 'leave'].includes(event.method) || !ERROR_CODES.includes(event.code)) storageFailure();
}
function configure(db: DatabaseSync, maxPages?: number): void {
  for (const schema of ['main', 'anchor']) {
    if (Object.values(db.prepare(`PRAGMA ${schema}.journal_mode`).get()!)[0] !== 'delete') storageFailure();
  }
  db.exec('PRAGMA busy_timeout=0; PRAGMA main.synchronous=EXTRA; PRAGMA anchor.synchronous=EXTRA; PRAGMA trusted_schema=OFF');
  if (maxPages !== undefined) {
    if (!Number.isSafeInteger(maxPages) || maxPages < 2) storageFailure();
    db.exec(`PRAGMA main.max_page_count=${maxPages}`);
  }
}

function validateEvidence(input: AdministrativeEvidenceRecord, state: State): AdministrativeEvidenceRecord {
  input = wireSnapshot(input) as AdministrativeEvidenceRecord;
  const keys = Object.keys(input).sort();
  if (canonical(keys) !== canonical(['authorization','evidence','plan']) && canonical(keys) !== canonical(['artifacts','authorization','evidence','plan'])) storageFailure();
  const plan = parsePlan(input.plan), authorization = parseAuthorization(input.authorization), evidence = parseEvidence(input.evidence);
  if (!same(plan.binding, state.binding) || evidence.sequence !== state.sequence + 1 ||
      evidence.installationId !== state.binding.installationId || evidence.generation !== state.binding.generation ||
      evidence.operationId !== plan.operationId || evidence.planDigest !== planDigest(plan) ||
      authorization.planId !== plan.planId || authorization.planDigest !== evidence.planDigest ||
      authorization.installationId !== evidence.installationId || authorization.generation !== evidence.generation ||
      evidence.authorizationId !== authorization.authorizationId || state.evidence.has(evidence.evidenceId) ||
      evidence.resources.some(id => !plan.resources.includes(id))) storageFailure();
  const request = [...state.records.values()].find(r => r.identity.operationId === evidence.operationId &&
    r.identity.authorizationId === authorization.authorizationId && r.identity.principalId === authorization.principalId &&
    r.identity.nonce === authorization.nonce && r.identity.generation === evidence.generation);
  if (!request) storageFailure();
  const artifacts = input.artifacts ?? [];
  if (!Array.isArray(artifacts) || artifacts.length > 2 || new Set(artifacts.map(a=>a.purpose)).size !== artifacts.length) storageFailure();
  for (const artifact of artifacts) {
    if (canonical(Object.keys(artifact).sort()) !== canonical(['bytes','digest','id','purpose','version']) || artifact.version!=='maintenance-artifact/1' ||
        !/^[a-f0-9-]{36}$/.test(artifact.id) || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes<0 ||
        !['backup','staging'].includes(artifact.purpose) || (artifact.purpose==='staging' && artifact.digest!==plan.contentDigest)) storageFailure();
  }
  if (plan.operation==='descriptor_replace' && ['applied','already_applied'].includes(evidence.durableResult?.outcome ?? '') && artifacts.length!==2) storageFailure();
  return {plan, authorization, evidence, artifacts};
}
function validateResultEvidence(identity: RequestIdentity, result: MaintenanceResult, evidence: State['evidence']): void {
  if (result.evidenceRef === null) return;
  const record = evidence.get(result.evidenceRef);
  if (!record || record.evidence.operationId !== identity.operationId || record.evidence.authorizationId !== identity.authorizationId ||
      record.evidence.generation !== identity.generation || !same(record.evidence.durableResult, result)) storageFailure();
}
