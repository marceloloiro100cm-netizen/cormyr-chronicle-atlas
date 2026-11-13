import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function backupManifest(directory) {
  const root = await realpath(directory);
  const entries = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Backup cannot contain symbolic links');
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const hash = createHash('sha256'); let bytes = 0;
        for await (const chunk of createReadStream(path)) { bytes += chunk.length; hash.update(chunk); }
        entries.push({ path: relative(root,path).split(sep).join('/'), bytes, sha256: hash.digest('hex') });
      } else throw new Error('Unsupported backup entry');
    }
  }
  await visit(root);
  if (!entries.length) throw new Error('Empty backup');
  return { formatVersion: 1, algorithm: 'sha256', completenessVerified: false, files: entries,
    totalBytes: entries.reduce((sum,file) => sum + file.bytes, 0),
    warning: 'Local integrity only. Compare with live database, Auth and Storage inventory before migration. Generate outside the backup directory.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/firebase-backup-manifest.mjs PRIVATE_BACKUP_DIRECTORY');
  console.log(JSON.stringify(await backupManifest(process.argv[2]), null, 2));
}
