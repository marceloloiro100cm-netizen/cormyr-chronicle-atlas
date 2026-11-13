/**
 * Fail-closed Firestore readiness audit for a private, normalized PostgreSQL backup.
 * No Firebase network access. Outputs only redacted aggregate findings.
 *
 * PostgreSQL COPY values are strings/null in this export; the rows are NOT
 * Firestore documents and must not be uploaded without explicit type/domain mapping.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const SAFE_FILE = /^[0-9]{3,}\.json$/;
const BUDGET = 900 * 1024; // Conservative estimate, below Firestore's 1 MiB limit.
const MAX_TABLE_BYTES = 256 * 1024 * 1024;
const SECRET_FIELD = /password|refresh_token|access_token|secret|private_key|encrypted|otp|confirmation_token/i;
const PRIMARY_KEY = /^[^/]{1,1500}$/;

export function domainOf(table) {
  if (table.startsWith('auth.')) return 'authentication';
  if (table.startsWith('storage.')) return 'storage-metadata';
  if (/newspaper|newspaper_staff|engraving|commission/.test(table)) return 'newspaper';
  if (/letter|mail|receipt|reply/.test(table)) return 'correspondence';
  if (/calendar|time|temporal|schedule|year_transition/.test(table)) return 'temporal-calendar';
  if (/battle|combat|unit|military/.test(table)) return 'battles';
  if (/spy|espion|agent/.test(table)) return 'espionage';
  if (/house|noble|ledger|character|wallet/.test(table)) return 'houses-and-characters';
  if (/role|profile|player|membership|representation/.test(table)) return 'access-and-players';
  return 'other';
}

export function auditTable(tableName, columns, rows) {
  if (!SOURCE_TABLE.test(tableName) || !Array.isArray(columns) || !Array.isArray(rows)) {
    throw new Error('Unsupported table representation');
  }
  if (columns.some(key => typeof key !== 'string')) throw new Error('Invalid column');
  const keys = new Set();
  const stats = {
    rows: rows.length,
    missingId: 0, duplicateId: 0, invalidId: 0,
    estimatedLargeDocuments: 0, largestEstimatedBytes: 0,
    sensitiveColumns: columns.filter(key => SECRET_FIELD.test(key)).length,
    untypedValues: 0,
  };
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid row');
    if (Object.keys(row).length !== columns.length ||
        columns.some(key => !Object.hasOwn(row,key))) throw new Error('Row columns mismatch');
    const id = row.id;
    if (!Object.hasOwn(row, 'id') || id === null || id === '') stats.missingId++;
    else if (typeof id !== 'string' || !PRIMARY_KEY.test(id) || Buffer.byteLength(id) > 1500 || id === '.' || id === '..') {
      stats.invalidId++;
    } else if (keys.has(id)) stats.duplicateId++;
    else keys.add(id);
    for (const key of columns) {
      if (row[key] !== null && typeof row[key] !== 'string') throw new Error('Backup value is not text/null');
      if (row[key] !== null) stats.untypedValues++;
    }
    const approxSize = Buffer.byteLength(JSON.stringify(row), 'utf8');
    stats.largestEstimatedBytes = Math.max(stats.largestEstimatedBytes, approxSize);
    if (approxSize >= BUDGET) stats.estimatedLargeDocuments++;
  }
  return stats;
}

export async function auditNormalizedBackup(directory) {
  const root = await realpath(resolve(directory));
  const manifest = JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  if (manifest.formatVersion !== 1 ||
      manifest.valueEncoding !== 'postgres-copy-text-or-null' ||
      !Array.isArray(manifest.tables)) throw new Error('Unsupported normalized export manifest');
  const results = [];
  const visitedFiles = new Set();
  const visitedTables = new Set();
  for (const entry of manifest.tables) {
    if (!entry || !SOURCE_TABLE.test(entry.table) || !SAFE_FILE.test(entry.file) ||
        !SHA256.test(entry.sha256) || !Number.isSafeInteger(entry.rows) || entry.rows < 0 ||
        visitedFiles.has(entry.file) || visitedTables.has(entry.table)) {
      throw new Error('Invalid or duplicate normalized manifest entry');
    }
    visitedFiles.add(entry.file);
    visitedTables.add(entry.table);
    const filename = join(root, entry.file);
    const fileStat = await lstat(filename);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_TABLE_BYTES) {
      throw new Error('Unsupported private table file');
    }
    const canonical = await realpath(filename);
    const inside = relative(root, canonical);
    if (!inside || inside === '..' || inside.startsWith('..' + sep) || inside.startsWith(sep)) {
      throw new Error('Normalized export path escapes private directory');
    }
    const bytes = await readFile(canonical);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
      throw new Error('Backup table SHA-256 mismatch');
    }
    const data = JSON.parse(bytes.toString('utf8'));
    if (data.sourceTable !== entry.table || !Array.isArray(data.columns) ||
        !Array.isArray(data.rows) || data.rows.length !== entry.rows) {
      throw new Error('Table manifest content mismatch');
    }
    const stats = auditTable(entry.table, data.columns, data.rows);
    results.push({ table: entry.table, domain: domainOf(entry.table), ...stats });
  }
  const totals = {
    tables: results.length, rows: results.reduce((sum,r)=>sum+r.rows,0),
    missingId: results.reduce((sum,r)=>sum+r.missingId,0),
    duplicateId: results.reduce((sum,r)=>sum+r.duplicateId,0),
    invalidId: results.reduce((sum,r)=>sum+r.invalidId,0),
    estimatedLargeDocuments: results.reduce((sum,r)=>sum+r.estimatedLargeDocuments,0),
    tablesWithSensitiveFields: results.filter(r=>r.sensitiveColumns).length,
  };
  return {
    formatVersion: 1, scope: 'private-offline-backup',
    sourceLiveVerified: false, destinationInspected: false,
    noFirebaseWrites: true, readyForImport: false,
    sizeEstimateCaveat: 'COPY strings are not typed Firestore values; overhead not included. Any near-limit row needs mapping.',
    totals,
    domains: [...new Set(results.map(x=>x.domain))].sort().map(domain=>({
      domain, tables: results.filter(x=>x.domain===domain).length,
      rows: results.filter(x=>x.domain===domain).reduce((sum,x)=>sum+x.rows,0),
      estimatedLargeDocuments:results.filter(x=>x.domain===domain)
        .reduce((sum,x)=>sum+x.estimatedLargeDocuments,0),
    })),
    blockers: [
      'Backup is not a reconciled live export',
      'COPY text/null must be converted by explicit per-table schema and field types',
      'PostgreSQL SQL functions, transactions and RLS cannot be converted to Firestore automatically',
      'Firestore document IDs, references, collection partitioning, and access rules remain unapproved',
      'Private and auth/storage tables require separate purpose-built migrations',
      'No Firestore deployment or Auth import was performed',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/firebase/audit-firestore-backup.mjs PRIVATE_NORMALIZED_DIRECTORY');
    process.exitCode = 2;
  } else {
    auditNormalizedBackup(process.argv[2]).then(result => {
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }).catch(() => { console.error('Private Firestore preflight blocked: invalid or unreadable export'); process.exitCode = 1; });
  }
}
