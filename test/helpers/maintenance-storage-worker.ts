import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {SqliteMaintenancePersistence} from '../../src/maintenance/sqlite-persistence.ts';
import {normalizeError} from '../../src/maintenance/contracts.ts';
const [mode, encoded] = process.argv.slice(2);
const input = JSON.parse(encoded);
if (mode === 'claim') {
  try { const store = new SqliteMaintenancePersistence(input.location); process.stdout.write(JSON.stringify(await store.claim(input.identity))); }
  catch (error) { process.stdout.write(JSON.stringify({code: normalizeError(error)})); }
} else if (mode === 'crash') {
  const db = new DatabaseSync(join(input.location.journalDirectory,'journal.sqlite'));
  db.prepare('ATTACH DATABASE ? AS anchor').run(join(input.location.anchorDirectory,'anchor.sqlite'));
  db.exec('PRAGMA cache_size=1; PRAGMA synchronous=EXTRA; PRAGMA anchor.synchronous=EXTRA; BEGIN IMMEDIATE');
  db.exec("UPDATE events SET payload=zeroblob(2000000) WHERE sequence=1; UPDATE anchor.seal SET hash='uncommitted'");
  process.stdout.write('READY\n');
  process.stdin.resume();
}
