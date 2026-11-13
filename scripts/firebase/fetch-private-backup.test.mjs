import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { fetchPrivateBackup, parseArgs } from './fetch-private-backup.mjs';

const digest = value=>createHash('sha256').update(value).digest('hex');
const zip = Buffer.from([0x50,0x4b,0x03,0x04,1,2,3,4]);

test('fetches only into private ignored directory, validates SHA and does not overwrite', async () => {
  const dir=await mkdtemp(join(tmpdir(),'cormyr-private-fetch-'));
  const previous=process.cwd();
  try {
    process.chdir(dir);
    const drive={ files:{get:async()=>({data:Readable.from([zip])})}};
    const output='.firebase-migration/one.backup.zip';
    const r=await fetchPrivateBackup(drive,'fakeFileId123456',output,digest(zip));
    assert.equal(r.checksumVerified,true);
    assert.equal(r.zipSizeBytes,zip.length);
    assert.deepEqual(await readFile(output),zip);
    await assert.rejects(fetchPrivateBackup(drive,'fakeFileId123456',output,digest(zip)),/already exists/);
    await assert.rejects(fetchPrivateBackup(drive,'fakeFileId123456','outside.backup.zip',digest(zip)),/directly within/);
    await assert.rejects(fetchPrivateBackup(drive,'fakeFileId123456','.firebase-migration/bad.backup.zip',digest('wrong')),/checksum/);
  } finally {
    process.chdir(previous);
    await rm(dir,{recursive:true,force:true});
  }
});

test('CLI accepts exactly six flags and values with a SHA-256', () => {
  const good=['--drive-file-id','fileId987654321','--output',
    '.firebase-migration/backup-12nov.backup.zip','--expected-sha256',digest(zip)];
  assert.deepEqual(parseArgs(good),{
    driveFileId:'fileId987654321',output:good[3],hash:digest(zip),
  });
  assert.throws(()=>parseArgs(good.slice(0,5)),/Usage/);
  assert.throws(()=>parseArgs([...good.slice(0,4),'--unexpected',digest(zip)]),/Usage/);
});
