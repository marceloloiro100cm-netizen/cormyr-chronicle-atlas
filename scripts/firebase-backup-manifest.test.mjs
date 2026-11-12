import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupManifest } from './firebase-backup-manifest.mjs';

test('hashes exact binary bytes and detects changed contents; rejects links and empty backups', async () => {
  const dir = await mkdtemp(join(tmpdir(),'firebase-backup-'));
  try {
    await assert.rejects(backupManifest(dir), /Empty/);
    await writeFile(join(dir,'image.bin'), Buffer.from([0,255,128]));
    const before = await backupManifest(dir);
    assert.equal(before.totalBytes,3);
    assert.equal(before.completenessVerified,false);
    await writeFile(join(dir,'image.bin'), Buffer.from([0,255,129]));
    assert.notEqual((await backupManifest(dir)).files[0].sha256,before.files[0].sha256);
    await symlink(join(dir,'image.bin'),join(dir,'link'));
    await assert.rejects(backupManifest(dir), /symbolic/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
