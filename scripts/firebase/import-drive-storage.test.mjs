import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { validateManifest } from './import-storage.mjs';
import { listDriveTree, planDrive, getVerifiedDriveFile, stageFromDrive } from './import-drive-storage.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

test('paginates Drive folders and preserves original relative paths', async () => {
  const calls = [];
  const drive = { files: { list: async args => {
    calls.push(args);
    if (args.q.includes("'root'")) return { data: { files: [{ id: 'child', name: 'public-house', mimeType: 'application/vnd.google-apps.folder' }], nextPageToken: 'next' } };
    if (args.q.includes("'child'")) return { data: { files: [{ id: 'asset', name: 'logo.png', size: '3', mimeType: 'image/png' }] } };
    throw new Error('unexpected folder');
  } } };
  drive.files.list = async args => {
    calls.push(args);
    if (args.q.includes("'root'") && !args.pageToken) return { data: { files: [{ id: 'child', name: 'public-house', mimeType: 'application/vnd.google-apps.folder' }], nextPageToken: 'next' } };
    if (args.q.includes("'root'")) return { data: { files: [] } };
    if (args.q.includes("'child'")) return { data: { files: [{ id: 'asset', name: 'logo.png', size: '3', mimeType: 'image/png' }] } };
    throw new Error('unexpected');
  };
  const { found, folderCount } = await listDriveTree(drive, 'root');
  assert.equal(folderCount, 2);
  assert.deepEqual(found.get('public-house/logo.png'), { id: 'asset', size: 3, native: false });
  assert.equal(calls.length, 3);
});

test('identifies missing, divergent and extra source objects without trusting Drive metadata as hash', () => {
  const manifest = validateManifest({ version: 1, bucket: 'campaign-images', complete: false, files: [
    { path: 'house/ok', size: 3, sha256: sha('abc') },
    { path: 'house/missing', size: 3, sha256: sha('abc') },
    { path: 'house/wrong', size: 5, sha256: sha('abcde') },
  ] });
  const files = new Map([
    ['house/ok', { id: 'one', size: 3, native: false }],
    ['house/wrong', { id: 'two', size: 4, native: false }],
    ['house/extra', { id: 'three', size: 2, native: false }],
  ]);
  const plan = planDrive(manifest, files);
  assert.equal(plan.matches.length, 1);
  assert.deepEqual(plan.missing, ['house/missing']);
  assert.deepEqual(plan.different, ['house/wrong']);
  assert.equal(plan.extra, 1);
});

test('checks streamed SHA-256 before uploading and rejects mismatches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cormyr-drive-test-'));
  try {
    const good = { driveId: 'file1', size: 3, sha256: sha('abc') };
    const drive = { files: { get: async () => ({ data: Readable.from([Buffer.from('abc')]) }) } };
    const location = await getVerifiedDriveFile(drive, good, dir);
    assert.equal(typeof location, 'string');
    const other = await mkdtemp(join(tmpdir(), 'cormyr-drive-test-'));
    try { await assert.rejects(getVerifiedDriveFile(drive, { ...good, sha256: sha('abd') }, other), /SHA-256/); }
    finally { await rm(other, { recursive: true, force: true }); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('skips already verified staging objects without downloading private Drive files', async () => {
  const good = { path: 'h/photo', size: 3, sha256: sha('abc'), driveId: 'file1' };
  const drive = { files: { get: async () => { throw new Error('must not download'); } } };
  const bucket = { file: name => {
    assert.equal(name, 'migration-staging/campaign-images/h/photo');
    return { exists: async () => [true], getMetadata: async () => [{ size: '3', metadata: { sourceSha256: sha('abc') } }] };
  } };
  const results = await stageFromDrive(drive, bucket, { bucket: 'campaign-images' }, [good], 1);
  assert.deepEqual(results, { uploaded: 0, existing: 1, downloadedAndHashed: 0, processed: 1 });
});
