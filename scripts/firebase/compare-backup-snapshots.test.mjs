import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareSnapshots, compareBackupDirectories } from './compare-backup-snapshots.mjs';

const t = (columns, rows) => ({ columns, rows });
const before = new Map([
  ['auth.users', t(['id','email'], [
    { id: 'secret-1', email: 'one@example.invalid' },
    { id: 'secret-2', email: 'two@example.invalid' },
  ])],
  ['public.campaign_mail', t(['id','body'], [
    { id: 'mail-secret', body: 'private message' },
  ])],
  ['public.access_membership', t(['user_id','house_id'], [
    { user_id: 'secret-1', house_id: 'h1' },
  ])],
]);
const after = new Map([
  ['auth.users', t(['id','email'], [
    { id: 'secret-1', email: 'UPDATED@example.invalid' },
    { id: 'secret-3', email: 'three@example.invalid' },
  ])],
  ['public.campaign_mail', t(['id','body'], [
    { id: 'mail-secret', body: 'private message' },
    { id: 'another-mail', body: 'another sensitive letter' },
  ])],
  ['public.access_membership', t(['user_id','house_id'], [
    { user_id: 'secret-1', house_id: 'h2' },
  ])],
]);

test('aggregates row changes by domain without leaking IDs or source data', () => {
  const report = compareSnapshots(before, after);
  const auth = report.domains.find(x=>x.domain==='authentication');
  assert.deepEqual([auth.added, auth.removed, auth.modified], [1,1,1]);
  const mail = report.domains.find(x=>x.domain==='correspondence');
  assert.equal(mail.added, 1);
  const text = JSON.stringify(report);
  for (const confidential of ['secret-1','UPDATED@example.invalid','private message','h2']) {
    assert.ok(!text.includes(confidential));
  }
  assert.equal(report.newerSnapshotVerifiedFromLiveSource, false);
  assert.equal(report.readyForImport, false);
  assert.equal(report.firebaseWrites, 0);
});

test('unchanged snapshots never claim live-source reconciliation or import readiness', () => {
  const report = compareSnapshots(before, before);
  assert.equal(report.changesDetected, false);
  assert.equal(report.readyForImport, false);
  assert.equal(report.sourceWriteFreezeVerified, false);
});

test('schema changes are flagged rather than miscounted as row updates', () => {
  const a = new Map([['public.houses',t(['id','name'],[{id:'1',name:'Alpha'}])]]);
  const b = new Map([['public.houses',t(['id','name','tier'],[{id:'1',name:'Alpha',tier:'major'}])]]);
  const report = compareSnapshots(a,b);
  assert.equal(report.schemaChangedTables,1);
  assert.equal(report.domains[0].modified,0);
  assert.equal(report.changesDetected,true);
});

async function createNormalized(parent, label, rows) {
  const dir = join(parent,label);
  await mkdir(dir);
  const data = {
    sourceTable:'auth.users',
    columns:['id','email'],
    rows,
  };
  const bytes=Buffer.from(JSON.stringify(data));
  await writeFile(join(dir,'000.json'),bytes);
  const manifest={
    formatVersion:1,valueEncoding:'postgres-copy-text-or-null',
    tables:[{
      table:'auth.users',file:'000.json',rows:rows.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),
    }],
  };
  await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));
  return dir;
}

test('verified private snapshots are read-only and reject corrupted hashes', async()=>{
  const parent=await mkdtemp(join(tmpdir(),'cormyr-delta-'));
  try{
    const older=await createNormalized(parent,'older', [{id:'one',email:'old@example.invalid'}]);
    const newer=await createNormalized(parent,'newer', [{id:'one',email:'new@example.invalid'}]);
    const report=await compareBackupDirectories(older,newer);
    assert.equal(report.domains[0].modified,1);
    assert.equal(report.readyForImport,false);
    await writeFile(join(newer,'000.json'), '{}');
    await assert.rejects(compareBackupDirectories(older,newer),/SHA-256 mismatch/);
  }finally{
    await rm(parent,{recursive:true,force:true});
  }
});

test('same directory is not a valid comparison',async()=>{
  await assert.rejects(compareBackupDirectories('/tmp/same','/tmp/same'),
    /two different/);
});

test('duplicate keyed row IDs are rejected',()=>{
  const records=[{id:'same',email:'a@example.invalid'},{id:'same',email:'b@example.invalid'}];
  assert.throws(()=>compareSnapshots(new Map([['auth.users', t(['id','email'], records)]]),
    new Map([['auth.users', t(['id','email'], records)]])), /Duplicate private row IDs/);
});
