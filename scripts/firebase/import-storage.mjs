import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export function validateRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    throw new Error('Unsafe object path');
  }
  if (value.split('/').some(part => !part || part === '.' || part === '..' || /[\x00-\x1f]/u.test(part))) {
    throw new Error('Unsafe object path');
  }
  return value;
}

export function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !/^[a-z][a-z0-9-]*$/u.test(manifest.bucket || '') || !Array.isArray(manifest.files)) {
    throw new Error('Unsupported storage manifest');
  }
  const seen = new Set();
  const files = manifest.files.map(entry => {
    const objectPath = validateRelativePath(entry.path);
    if (seen.has(objectPath)) throw new Error('Duplicate manifest path');
    seen.add(objectPath);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256 || '')) {
      throw new Error('Invalid size or SHA-256 in manifest');
    }
    return { path: objectPath, size: entry.size, sha256: entry.sha256 };
  });
  return { bucket: manifest.bucket, complete: manifest.complete === true, files };
}

export async function auditLocalFiles(root, manifest) {
  const source = resolve(root, manifest.bucket);
  const canonicalRoot = await realpath(source);
  const checked = [];
  const summary = { bucket: manifest.bucket, manifestComplete: manifest.complete, total: manifest.files.length,
    verified: 0, missing: 0, mismatched: 0, verifiedBytes: 0, totalBytes: manifest.files.reduce((sum, file) => sum + file.size, 0) };
  for (const item of manifest.files) {
    const local = join(source, ...item.path.split('/'));
    let info;
    try { info = await lstat(local); } catch (error) {
      if (error.code === 'ENOENT') { summary.missing++; continue; }
      throw error;
    }
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Non-regular source file');
    const canonical = await realpath(local);
    const within = relative(canonicalRoot, canonical);
    if (!within || within === '..' || within.startsWith(`..${sep}`) || within.startsWith(sep)) {
      throw new Error('Source path escapes bucket directory');
    }
    if (info.size !== item.size) { summary.mismatched++; continue; }
    const sha = createHash('sha256');
    for await (const chunk of createReadStream(local)) sha.update(chunk);
    if (sha.digest('hex') !== item.sha256) { summary.mismatched++; continue; }
    summary.verified++; summary.verifiedBytes += item.size;
    checked.push({ ...item, local });
  }
  return { summary, checked };
}

function readArgs(argv) {
  const values = {};
  const flags = new Set(['--execute', '--allow-partial']);
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i];
    if (flags.has(option)) { values[option] = true; continue; }
    if (!['--source', '--manifest', '--project', '--destination'].includes(option) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${option}`);
    }
    values[option] = argv[++i];
  }
  if (!values['--source'] || !values['--manifest']) {
    throw new Error('Usage: node scripts/firebase/import-storage.mjs --source EXPORT_DIRECTORY --manifest bucket.manifest.json [--execute --project PROJECT --destination STORAGE_BUCKET] [--allow-partial]');
  }
  if (values['--execute'] && (!values['--project'] || !values['--destination'])) {
    throw new Error('Explicit project and destination bucket required for upload');
  }
  return values;
}

export async function uploadVerified(checked, options, gcsBucket) {
  const counters = { uploaded: 0, verifiedExisting: 0 };
  for (const file of checked) {
    const object = gcsBucket.file(`migration-staging/${options.bucket}/${file.path}`);
    const [exists] = await object.exists();
    if (exists) {
      const [metadata] = await object.getMetadata();
      if (metadata.metadata?.sourceSha256 !== file.sha256 || Number(metadata.size) !== file.size) {
        throw new Error('Existing staging object differs from verified source; refusing overwrite');
      }
      counters.verifiedExisting++;
      continue;
    }
    try {
      await pipeline(createReadStream(file.local), object.createWriteStream({
        resumable: true, validation: 'crc32c',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { metadata: { sourceSha256: file.sha256, sourceBucket: options.bucket, migrationState: 'staging' } },
      }));
      counters.uploaded++;
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
      const [metadata] = await object.getMetadata();
      if (metadata.metadata?.sourceSha256 !== file.sha256 || Number(metadata.size) !== file.size) throw error;
      counters.verifiedExisting++;
    }
  }
  return counters;
}

export async function main(argv) {
  const args = readArgs(argv);
  const manifest = validateManifest(JSON.parse(await readFile(args['--manifest'], 'utf8')));
  const { summary, checked } = await auditLocalFiles(args['--source'], manifest);
  const output = { ...summary, destinationIsPrivateStaging: true, writePerformed: false };
  if (args['--execute']) {
    if ((!manifest.complete || summary.missing || summary.mismatched) && !args['--allow-partial']) {
      throw new Error('Manifest or local files incomplete; staging only permitted with --allow-partial');
    }
    if (!checked.length) throw new Error('No verified files to stage');
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage({ projectId: args['--project'] });
    const results = await uploadVerified(checked, { bucket: manifest.bucket }, storage.bucket(args['--destination']));
    Object.assign(output, results, { writePerformed: results.uploaded > 0, partial: !manifest.complete || summary.missing > 0 || summary.mismatched > 0 });
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
