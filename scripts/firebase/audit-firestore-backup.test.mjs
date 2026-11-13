import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditTable, auditNormalizedBackup, domainOf } from './audit-firestore-backup.mjs';

test('identifies collisions, missing IDs and large serialized rows', () => {
  const rows = [
    { id: 'known', text: 'safe' },
    { id: 'known', text: 'duplicated' },
    { id: null, text: 'missing' },
    { id: 'large', text: 'A'.repeat(925 * 1024) },
  ];
  const report = auditTable('public.campaign_letters', ['id','text'], rows);
  assert.equal(report.rows, 4);
  assert.equal(report.duplicateId, 1);
  assert.equal(report.missingId, 1);
  assert.equal(report.estimatedLargeDocuments, 1);
  assert.equal(domainOf('auth.users'), 'authentication');
  assert.equal(domainOf('public.campaign_newspapers'), 'newspaper');
  assert.equal(domainOf('public.campaign_letters'), 'correspondence');
  assert.throws(() => auditTable('public/escape', ['id'], [{ id: 's' }]), /Unsupported/);
});

test('rejects typed values and inconsistent row columns from COPY export', () => {
  assert.throws(() => auditTable('public.campaign_houses', ['id','name'], [{ id: 'abc',name: 1 }]), /text\/null/);
  assert.throws(() => auditTable('public.campaign_houses', ['id','name'], [{ id: 'abc' }]), /columns mismatch/);
});

test('audits normalized files without outputting private data, and checks SHA-256', async () => {
  const dir = await mkdtemp(join(tmpdir(),'cormyr-firestore-'));
  try {
    const content = Buffer.from(JSON.stringify({
      sourceTable:'public.campaign_letters',columns:['id','secret_message'],
      rows:[{id:'private-uid',secret_message:'PRIVATE-LETTER-CONTENT'}],
    }));
    await writeFile(join(dir,'000.json'), content);
    const manifest = {formatVersion:1,valueEncoding:'postgres-copy-text-or-null',tables:[
      {table:'public.campaign_letters',file:'000.json',rows:1,
       sha256:createHash('sha256').update(content).digest('hex')},
    ]};
    await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));
    const report=await auditNormalizedBackup(dir);
    assert.equal(report.totals.rows,1);
    assert.equal(report.totals.tablesWithSensitiveFields,1);
    assert.equal(report.readyForImport,false);
    assert.equal(report.noFirebaseWrites,true);
    assert.ok(!JSON.stringify(report).includes('PRIVATE-LETTER-CONTENT'));
    assert.ok(!JSON.stringify(report).includes('private-uid'));
    await writeFile(join(dir,'000.json'),Buffer.from('{}'));
    await assert.rejects(auditNormalizedBackup(dir),/SHA-256/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('rejects symlink tables even when source content is otherwise valid', async () => {
  const dir=await mkdtemp(join(tmpdir(),'cormyr-firestore-symlink-'));
  try {
    const raw=Buffer.from(JSON.stringify({sourceTable:'auth.users',columns:['id'],rows:[]}));
    await writeFile(join(dir,'source.json'),raw);
    await symlink(join(dir,'source.json'),join(dir,'000.json'));
    await writeFile(join(dir,'manifest.json'),JSON.stringify({formatVersion:1,
      valueEncoding:'postgres-copy-text-or-null',
      tables:[{table:'auth.users',file:'000.json',rows:0,sha256:createHash('sha256').update(raw).digest('hex')}]}));
    await assert.rejects(auditNormalizedBackup(dir),/Unsupported private table file/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
