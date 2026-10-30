/** New-store schemas only. Never called by inspection/open/recovery. */
import {randomUUID} from 'node:crypto';
import {chmodSync, closeSync, fsyncSync, openSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {storageFailure, writeExclusive, syncDirectory} from './local-storage.ts';

export const NEW_STORE_IDS = ['runtime.sqlite','runtime-v2.sqlite','runtime-v3.sqlite','runtime-operations.sqlite','tool-grants-v2.sqlite','runtime-control.sqlite'] as const;
export type NewStoreId = typeof NEW_STORE_IDS[number];
export function createNewStore(root: string, id: NewStoreId): void {
  if (!NEW_STORE_IDS.includes(id)) storageFailure();
  const path=join(root,id);
  writeExclusive(path,'');
  if (id==='runtime-control.sqlite') return; // ADR-086 lock has no data schema.
  const db=new DatabaseSync(path);
  try {
    db.exec('PRAGMA synchronous=EXTRA; BEGIN IMMEDIATE');
    if (['runtime.sqlite','runtime-v2.sqlite','runtime-v3.sqlite'].includes(id)) {
      db.exec(`CREATE TABLE checkpoints(thread_id TEXT NOT NULL,checkpoint_ns TEXT NOT NULL DEFAULT '',checkpoint_id TEXT NOT NULL,parent_checkpoint_id TEXT,type TEXT,checkpoint BLOB,metadata BLOB,PRIMARY KEY(thread_id,checkpoint_ns,checkpoint_id));
        CREATE TABLE writes(thread_id TEXT NOT NULL,checkpoint_ns TEXT NOT NULL DEFAULT '',checkpoint_id TEXT NOT NULL,task_id TEXT NOT NULL,task_path TEXT NOT NULL DEFAULT '',idx INTEGER NOT NULL,channel TEXT NOT NULL,type TEXT,value BLOB,PRIMARY KEY(thread_id,checkpoint_ns,checkpoint_id,task_id,idx));`);
    } else if (id==='tool-grants-v2.sqlite') {
      db.exec('CREATE TABLE grants(capability TEXT NOT NULL,descriptor_hash TEXT NOT NULL,scope TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(capability,descriptor_hash,scope))');
    } else {
      db.exec(`CREATE TABLE metadata(id TEXT NOT NULL,version INTEGER NOT NULL);
        CREATE TABLE runs(run_id TEXT PRIMARY KEY,criterion_hash TEXT NOT NULL,model_id TEXT NOT NULL);
        CREATE TABLE invocations(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,ordinal INTEGER NOT NULL,binding TEXT NOT NULL,status TEXT NOT NULL,result TEXT,grant_status TEXT NOT NULL DEFAULT 'not_requested',UNIQUE(run_id,ordinal));
        CREATE TABLE recoveries(run_id TEXT NOT NULL,request_id TEXT NOT NULL,target TEXT NOT NULL,count INTEGER NOT NULL,checkpoint_id TEXT NOT NULL,dispatched INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(run_id,request_id),UNIQUE(run_id,count));`);
      db.prepare('INSERT INTO metadata VALUES (?,1)').run(randomUUID());
    }
    db.exec('COMMIT');
  } finally { db.close(); }
  chmodSync(path,0o600);
  const fd=openSync(path,'r'); try {fsyncSync(fd);} finally {closeSync(fd);}
  syncDirectory(root);
}
