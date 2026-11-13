/**
 * Download a private PostgreSQL backup ZIP from Google Drive to an ignored
 * .firebase-migration directory. No database writes, cloud uploads, or
 * credential output. Requires npm install --prefix scripts/firebase --no-save googleapis.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { link, lstat, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { resolve, relative, sep, basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { pathToFileURL } from 'node:url';

const ID = /^[A-Za-z0-9_-]{10,}$/;
const SHA = /^[0-9a-f]{64}$/;
const ZIP_LIMIT = 500 * 1024 * 1024;

export async function fetchPrivateBackup(drive, driveId, outputPath, expectedSha = undefined) {
  if (!ID.test(driveId)) throw new Error('Invalid Drive file identifier');
  if (expectedSha && !SHA.test(expectedSha)) throw new Error('Invalid SHA-256');
  if (!outputPath.endsWith('.backup.zip')) throw new Error('Output must be a .backup.zip file');
  const privateRoot = resolve('.firebase-migration');
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const realRoot = await realpath(privateRoot);
  const output = resolve(outputPath);
  const inside = relative(realRoot, output);
  if (!inside || inside === '..' || inside.startsWith('..' + sep) ||
      inside.startsWith(sep) || inside.includes(sep)) {
    throw new Error('Output must be directly within .firebase-migration');
  }
  const directory = resolve(output,'..');
  const realDirectory = await realpath(directory);
  if (realDirectory !== realRoot) throw new Error('Output parent is not private migration directory');
  try { await lstat(output); throw new Error('Output already exists; refusing overwrite'); }
  catch(error) { if (error.code !== 'ENOENT') throw error; }
  const work = await mkdtemp(join(realRoot, '.download-'));
  const temp = join(work,'backup.part');
  const hash = createHash('sha256');
  let length = 0;
  try {
    const r = await drive.files.get({ fileId: driveId, alt: 'media', supportsAllDrives: true }, {responseType:'stream'});
    const inspect = new Transform({ transform(chunk, encoding, callback) {
      length += chunk.length;
      if (length > ZIP_LIMIT) callback(new Error('Backup exceeds safe byte limit'));
      else { hash.update(chunk); callback(null,chunk); }
    }});
    await pipeline(r.data,inspect,createWriteStream(temp,{ flags:'wx',mode:0o600 }));
    const signature = hash.digest('hex');
    if (expectedSha && signature !== expectedSha) throw new Error('Backup ZIP checksum mismatch');
    await link(temp,output); // Fails if another file appeared; never overwrites.
    return { savedInPrivateDirectory: true, zipSizeBytes: length,
      checksumVerified: Boolean(expectedSha), sourceDriveReadOnly: true,
      databaseWritten: false };
  } finally {
    await rm(work,{recursive:true,force:true});
  }
}

export async function main(argv) {
  if (argv.length !== 6 || argv[0]!=='--drive-file-id' || argv[2]!=='--output' ) {
    throw new Error('Usage: node scripts/firebase/fetch-private-backup.mjs --drive-file-id ID --output .firebase-migration/FILE.backup.zip [--expected-sha256 HEX]');
  }
  const [,,output,flag,hash] = argv;
  if (flag !== '--expected-sha256' || !SHA.test(hash)) throw new Error('Expected SHA-256 required');
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']});
  const drive = google.drive({version:'v3',auth});
  const result=await fetchPrivateBackup(drive,argv[1],output,hash);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Private backup download blocked. Check Drive access and backup checksum.');
    process.exitCode=1;
  });
}
