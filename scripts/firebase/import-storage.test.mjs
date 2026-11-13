import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateManifest, validateRelativePath, auditLocalFiles, uploadVerified } from './import-storage.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

test('rejects unsafe traversal, duplicate paths and malformed hashes', () => {
  for (const path of ['../secret', '/etc/passwd', 'a/../b', 'a//b', 'a\\b', 'a/./b']) {
    assert.throws(() => validateRelativePath(path));
  }
  const entry = { path: 'house/logo.png', size: 3, sha256: digest('abc') };
  assert.throws(() => validateManifest({ version: 1, bucket: 'campaign-images', files: [entry, entry] }), /Duplicate/);
  assert.throws(() => validateManifest({ version: 1, bucket: 'campaign-images', files: [{ ...entry, sha256: 'no' }] }), /SHA/);
});

test('audits exact bytes, missing files and mismatched contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cormyr-storage-test-'));
  try {
    await mkdir(join(dir, 'campaign-images', 'house'), { recursive: true });
    await writeFile(join(dir, 'campaign-images', 'house', 'ok'), 'abc');
    await writeFile(join(dir, 'campaign-images', 'house', 'bad'), 'abd');
    const entries = [
      { path: 'house/ok', size: 3, sha256: digest('abc') },
      { path: 'house/bad', size: 3, sha256: digest('abc') },
      { path: 'house/missing', size: 3, sha256: digest('abc') },
    ];
    const manifest = validateManifest({ version: 1, bucket: 'campaign-images', complete: false, files: entries });
    const { summary, checked } = await auditLocalFiles(dir, manifest);
    assert.equal(summary.verified, 1);
    assert.equal(summary.missing, 1);
    assert.equal(summary.mismatched, 1);
    assert.equal(summary.verifiedBytes, 3);
    assert.deepEqual(checked.map(x => x.path), ['house/ok']);
    await symlink(join(dir, 'campaign-images', 'house', 'ok'), join(dir, 'campaign-images', 'house', 'link'));
    await assert.rejects(auditLocalFiles(dir, validateManifest({ version: 1, bucket: 'campaign-images', files: [{ path: 'house/link', size: 3, sha256: digest('abc') }] })), /Non-regular/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('uploads only into private staging prefix, never replaces existing different objects', async () => {
  const path = 'house/logo.png';
  let destination = '';
  const bucket = { file(name) { destination = name; return { exists: async () => [true], getMetadata: async () => [{ size: '3', metadata: { sourceSha256: digest('abc') } }] }; } };
  const result = await uploadVerified([{ path, local: '/not-read', size: 3, sha256: digest('abc') }], { bucket: 'campaign-images' }, bucket);
  assert.equal(destination, `migration-staging/campaign-images/${path}`);
  assert.deepEqual(result, { uploaded: 0, verifiedExisting: 1 });
  await assert.rejects(uploadVerified([{ path, size: 3, sha256: digest('xyz') }], { bucket: 'campaign-images' }, bucket), /refusing overwrite/);
});
