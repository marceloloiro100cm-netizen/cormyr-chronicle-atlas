/**
 * Private, read-only delta audit between two normalized PostgreSQL backups.
 * No DB network access; never prints UIDs, emails, hashes, letters, content or raw rows.
 * A difference-free comparison DOES NOT prove that the newer snapshot came from
 * the currently active source; an independently verified final export is required.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditTable, domainOf } from './audit-firestore-backup.mjs';

const SOURCE_TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const SAFE_FILE = /^[0-9]{3,}\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_TABLE_SIZE = 256 * 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');

export async function loadValidatedSnapshot(directory) {
  const root = await realpath(resolve(directory));
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid private backup directory');
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 ||
      manifest.valueEncoding !== 'postgres-copy-text-or-null' ||
      !Array.isArray(manifest.tables)) throw new Error('Invalid normalized backup manifest');
  const tables = new Map();
  const usedFiles = new Set();
  for (const entry of manifest.tables) {
    if (!entry || !SOURCE_TABLE.test(entry.table) || !SAFE_FILE.test(entry.file) ||
        !SHA256.test(entry.sha256) || !Number.isSafeInteger(entry.rows) || entry.rows < 0 ||
        tables.has(entry.table) || usedFiles.has(entry.file)) {
      throw new Error('Invalid or duplicate private backup manifest entry');
    }
    usedFiles.add(entry.file);
    const path = join(root, entry.file);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_TABLE_SIZE) {
      throw new Error('Invalid private backup table file');
    }
    const canonical = await realpath(path);
    const inside = relative(root, canonical);
    if (!inside || inside === '..' || inside.startsWith('..' + sep) || inside.startsWith(sep)) {
      throw new Error('Private backup file escapes directory');
    }
    const bytes = await readFile(canonical);
    if (digest(bytes) !== entry.sha256) throw new Error('Private backup table SHA-256 mismatch');
    const data = JSON.parse(bytes.toString('utf8'));
    if (data.sourceTable !== entry.table || !Array.isArray(data.columns) ||
        !Array.isArray(data.rows) || data.rows.length !== entry.rows) {
      throw new Error('Private backup table mismatch');
    }
    const stats = auditTable(entry.table, data.columns, data.rows);
    if (stats.duplicateId || stats.invalidId) throw new Error('Duplicate or invalid row identifiers in private backup');
    tables.set(entry.table, { columns: data.columns, rows: data.rows });
  }
  return tables;
}

function canonicalRow(row, columns) {
  return digest(JSON.stringify(columns.map(column => [column, row[column]])));
}

function rowDiff(before, after, columns) {
  const hasId = columns.includes('id') &&
    [...before, ...after].every(row => typeof row.id === 'string' && row.id !== '');
  if (hasId) {
    const oldIndex = new Map(before.map(row => [row.id, canonicalRow(row, columns)]));
    const newIndex = new Map(after.map(row => [row.id, canonicalRow(row, columns)]));
    if (oldIndex.size !== before.length || newIndex.size !== after.length) {
      throw new Error('Duplicate private row IDs');
    }
    let added = 0, removed = 0, modified = 0;
    for (const [id, hash] of newIndex) {
      if (!oldIndex.has(id)) added++;
      else if (oldIndex.get(id) !== hash) modified++;
    }
    for (const id of oldIndex.keys()) if (!newIndex.has(id)) removed++;
    return { added, removed, modified, keyless: false };
  }
  const counts = new Map();
  for (const row of before) {
    const h = canonicalRow(row, columns);
    counts.set(h, (counts.get(h) || 0) - 1);
  }
  for (const row of after) {
    const h = canonicalRow(row, columns);
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  let added = 0, removed = 0;
  for (const amount of counts.values()) {
    added += Math.max(0, amount);
    removed += Math.max(0, -amount);
  }
  return { added, removed, modified: 0, keyless: true };
}

export function compareSnapshots(before, after) {
  if (!(before instanceof Map) || !(after instanceof Map)) throw new Error('Invalid snapshots');
  const groups = new Map();
  let newTables = 0, missingTables = 0, schemaChangedTables = 0;
  for (const table of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(table), b = after.get(table);
    const domain = domainOf(table);
    if (!groups.has(domain)) groups.set(domain, {
      domain, tables: 0, beforeRows: 0, afterRows: 0, added: 0,
      removed: 0, modified: 0, schemaChangedTables: 0, keylessChangedTables: 0,
    });
    const g = groups.get(domain);
    g.tables++;
    g.beforeRows += a?.rows.length || 0;
    g.afterRows += b?.rows.length || 0;
    if (!a) { newTables++; g.added += b.rows.length; continue; }
    if (!b) { missingTables++; g.removed += a.rows.length; continue; }
    const columnsA = [...a.columns].sort();
    const columnsB = [...b.columns].sort();
    if (JSON.stringify(columnsA) !== JSON.stringify(columnsB)) {
      schemaChangedTables++;
      g.schemaChangedTables++;
      continue;
    }
    const delta = rowDiff(a.rows, b.rows, columnsA);
    g.added += delta.added;
    g.removed += delta.removed;
    g.modified += delta.modified;
    if (delta.keyless && (delta.added || delta.removed)) g.keylessChangedTables++;
  }
  const domains = [...groups.values()].sort((a,b) => a.domain.localeCompare(b.domain));
  const changes = domains.reduce((n,g) => n+g.added+g.removed+g.modified+g.schemaChangedTables,0);
  return {
    formatVersion: 1,
    scope: 'two-private-snapshots-readonly',
    beforeTables: before.size,
    afterTables: after.size,
    newTables, missingTables, schemaChangedTables,
    changesDetected: changes > 0 || newTables > 0 || missingTables > 0,
    domains,
    newerSnapshotVerifiedFromLiveSource: false,
    sourceWriteFreezeVerified: false,
    authorizationAndLoginMigrationVerified: false,
    firebaseWrites: 0,
    readyForImport: false,
    notes: [
      'Keyless table updates appear as added and removed rows, not modifications.',
      'No changes detected is not proof of a fresh live-source export or complete authorization mapping.',
      'Reconcile the last live export after writes are stopped before cutover.',
    ],
  };
}

export async function compareBackupDirectories(beforeDir, afterDir) {
  if (resolve(beforeDir) === resolve(afterDir)) throw new Error('Comparison requires two different backup directories');
  const [before, after] = await Promise.all([
    loadValidatedSnapshot(beforeDir),
    loadValidatedSnapshot(afterDir),
  ]);
  return compareSnapshots(before, after);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/firebase/compare-backup-snapshots.mjs BEFORE_NORMALIZED AFTER_NORMALIZED');
    process.exitCode = 2;
  } else {
    compareBackupDirectories(process.argv[2], process.argv[3])
      .then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
      .catch(() => {
        console.error('Private backup comparison blocked. No private values printed.');
        process.exitCode = 1;
      });
  }
}
