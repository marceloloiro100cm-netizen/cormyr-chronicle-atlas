// Import verified Google Drive files into PRIVATE staging GCS. Default is dry run.
// npm install --no-save googleapis @google-cloud/storage
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { validateManifest, validateRelativePath, uploadVerified } from './import-storage.mjs';

const folderMime = 'application/vnd.google-apps.folder';

export function planDrive(manifest, found) {
  const matches = [], missing = [], different = [];
  for (const item of manifest.files) {
    const file = found.get(item.path);
    if (!file) missing.push(item.path);
    else if (file.size !== item.size || file.native) different.push(item.path);
    else matches.push({ ...item, driveId: file.id });
  }
  return { matches, missing, different, extra: found.size - (matches.length + different.length) };
}

export async function listDriveTree(drive, rootFolderId) {
  const folders = [{ id: rootFolderId, path: '' }], seen = new Set(), found = new Map();
  while (folders.length) {
    const folder = folders.shift();
    if (seen.has(folder.id) || seen.size > 10000) throw new Error('Invalid Drive folder tree');
    seen.add(folder.id);
    let pageToken;
    do {
      const result = await drive.files.list({
        q: `'${folder.id}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size)', pageSize: 1000, pageToken,
        supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const file of result.data.files ?? []) {
        const path = validateRelativePath(folder.path + file.name);
        if (!file.id) throw new Error('Drive object without ID');
        if (file.mimeType === folderMime) folders.push({ id: file.id, path: `${path}/` });
        else {
          if (found.has(path)) throw new Error('Duplicate Drive file path');
          found.set(path, { id: file.id, size: file.size == null ? null : Number(file.size),
            native: String(file.mimeType ?? '').startsWith('application/vnd.google-apps.') });
        }
      }
      pageToken = result.data.nextPageToken;
    } while (pageToken);
  }
  return { found, folderCount: seen.size };
}

export async function getVerifiedDriveFile(drive, item, folder) {
  const response = await drive.files.get({ fileId: item.driveId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' });
  const sha = createHash('sha256');
  let bytes = 0;
  const verifier = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length; sha.update(chunk); callback(null, chunk);
  } });
  const local = join(folder, 'item');
  await pipeline(response.data, verifier, createWriteStream(local, { flags: 'wx', mode: 0o600 }));
  if (bytes !== item.size || sha.digest('hex') !== item.sha256) {
    throw new Error('Drive content does not match SHA-256 manifest');
  }
  return local;
}

export async function stageFromDrive(drive, bucket, manifest, matches, limit) {
  const result = { uploaded: 0, existing: 0, downloadedAndHashed: 0, processed: 0 };
  for (const item of matches.slice(0, limit ?? matches.length)) {
    const object = bucket.file(`migration-staging/${manifest.bucket}/${item.path}`);
    const [exists] = await object.exists();
    if (exists) {
      const [meta] = await object.getMetadata();
      if (Number(meta.size) !== item.size || meta.metadata?.sourceSha256 !== item.sha256) {
        throw new Error('Existing staging object conflicts with manifest');
      }
      result.existing++; result.processed++; continue;
    }
    const folder = await mkdtemp(join(tmpdir(), 'cormyr-drive-'));
    try {
      const local = await getVerifiedDriveFile(drive, item, folder);
      result.downloadedAndHashed++;
      const uploaded = await uploadVerified([{ ...item, local }], { bucket: manifest.bucket }, bucket);
      result.uploaded += uploaded.uploaded; result.existing += uploaded.verifiedExisting;
      result.processed++;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
  return result;
}

function argsOf(values) {
  const args = {};
  for (let i = 0; i < values.length; i++) {
    const key = values[i];
    if (key === '--execute' || key === '--allow-partial') { args[key] = true; continue; }
    if (!['--manifest', '--drive-folder', '--project', '--destination', '--limit'].includes(key) || !values[i+1]) {
      throw new Error('Invalid argument: ' + key);
    }
    args[key] = values[++i];
  }
  if (!args['--manifest'] || !/^[A-Za-z0-9_-]{10,}$/.test(args['--drive-folder'] ?? '')) {
    throw new Error('Required --manifest and --drive-folder (ID)');
  }
  if (args['--execute'] && (!args['--project'] || !args['--destination'])) {
    throw new Error('Required --project and --destination for uploads');
  }
  if (args['--limit'] && (!/^[1-9][0-9]*$/.test(args['--limit']) || !Number.isSafeInteger(Number(args['--limit'])))) {
    throw new Error('Invalid --limit');
  }
  return args;
}

export async function main(values) {
  const args = argsOf(values);
  const manifest = validateManifest(JSON.parse(await readFile(args['--manifest'], 'utf8')));
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({ scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/cloud-platform',
  ] });
  const drive = google.drive({ version: 'v3', auth });
  const tree = await listDriveTree(drive, args['--drive-folder']);
  const plan = planDrive(manifest, tree.found);
  const report = { manifestComplete: manifest.complete, manifestItems: manifest.files.length,
    driveFiles: tree.found.size, driveFolders: tree.folderCount,
    metadataMatching: plan.matches.length, missing: plan.missing.length,
    mismatched: plan.different.length, extra: plan.extra, writePerformed: false };
  if (args['--execute']) {
    if ((!manifest.complete || plan.missing.length || plan.different.length) && !args['--allow-partial']) {
      throw new Error('Incomplete manifest or source. --allow-partial permits only private staging');
    }
    if (!plan.matches.length) throw new Error('No Drive source files match the manifest');
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage({ projectId: args['--project'] });
    const updated = await stageFromDrive(drive, storage.bucket(args['--destination']), manifest,
      plan.matches, args['--limit'] ? Number(args['--limit']) : undefined);
    Object.assign(report, updated, { writePerformed: updated.uploaded > 0,
      partial: !manifest.complete || plan.missing.length > 0 || plan.different.length > 0 ||
        updated.processed < manifest.files.length });
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
