/**
 * Copy the public PostgreSQL schema's COPY-text rows into a PRIVATE emulator-only
 * preservation archive. This is not the app's final Firestore data model.
 *
 * No imports of auth.*, storage.*, or other non-public schemas. Never log
 * source values, UIDs, correspondence, emails, hashes, file names or row IDs.
 * Default is dry-run; writes require a localhost Firestore emulator AND an
 * explicitly named demo-* project, never a real Firebase project.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{64}$/;
const TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const SAFE_FILE = /^[0-9]{3,}\.json$/;
const MAX_FILE = 256 * 1024 * 1024;
const MAX_DOC_ESTIMATE = 850 * 1024;
const DEMO_PROJECT = 'demo-cormyr-migration';
const PRIVATE_COLLECTION = 'migrationPrivateSnapshots';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function sourceRowDigest(columns, row) {
  return sha256(JSON.stringify(columns.map(key => [key, row[key]])));
}

function validRow(row, columns) {
  return row && typeof row === 'object' && !Array.isArray(row) &&
    Object.keys(row).length === columns.length &&
    columns.every(key => Object.hasOwn(row, key) &&
      (row[key] === null || typeof row[key] === 'string'));
}

export function assertEmulatorOnly(env, projectId) {
  if (projectId !== DEMO_PROJECT) throw new Error('Only the fixed demo Firebase project is permitted');
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{1,4})$/.test(env.FIRESTORE_EMULATOR_HOST || '')) {
    throw new Error('Local Firestore emulator hostname and port are mandatory');
  }
  if (env.FIRESTORE_EMULATOR_HOST.includes('://')) throw new Error('Emulator host must have no protocol');
}

export function buildPrivateArchivePlan(tables, snapshotHash) {
  if (!Array.isArray(tables) || !SHA.test(snapshotHash)) throw new Error('Invalid private snapshot plan');
  const plannedRows = [];
  const tableDocs = [];
  const tableNames = new Set();
  const issues = { invalidTable: 0, invalidRows: 0, oversizedRows: 0, duplicateIds: 0 };
  let ignoredNonPublicTables = 0;
  let ignoredNonPublicRows = 0;
  let keylessTables = 0;

  for (const { table, columns, rows } of tables) {
    if (typeof table !== 'string' || !TABLE.test(table) || tableNames.has(table)) {
      issues.invalidTable++;
      continue;
    }
    tableNames.add(table);
    if (!Array.isArray(rows) || !Array.isArray(columns) ||
        !columns.every(key => typeof key === 'string' && key.length > 0 &&
          Buffer.byteLength(key, 'utf8') < 1400) ||
        new Set(columns).size !== columns.length) {
      issues.invalidTable++;
      continue;
    }
    if (!table.startsWith('public.')) {
      ignoredNonPublicTables++;
      ignoredNonPublicRows += rows.length;
      continue;
    }
    const tableDigest = sha256(table).slice(0,40);
    const seenIds = new Set();
    const duplicateRowOrdinals = new Map();
    const hasId = columns.includes('id');
    if (!hasId) keylessTables++;
    const tableDocsForRows = [];
    let invalidInTable = false;
    for (const row of rows) {
      if (!validRow(row, columns)) {
        issues.invalidRows++; invalidInTable = true; continue;
      }
      const rowHash = sourceRowDigest(columns, row);
      // Hashing input IDs avoids constructing unsafe document paths.
      const id = hasId && typeof row.id === 'string' && row.id ? row.id : null;
      let docId;
      if (id !== null) {
        if (seenIds.has(id)) { issues.duplicateIds++; invalidInTable = true; continue; }
        seenIds.add(id);
        docId = sha256('key:' + table + ':' + id);
      } else {
        // Rows without a primary id are not assumed unique. Identical rows
        // get distinct stable occurrence indices (independent of other order).
        const next = duplicateRowOrdinals.get(rowHash) || 0;
        duplicateRowOrdinals.set(rowHash, next + 1);
        docId = sha256('row:' + table + ':' + rowHash + ':' + next);
      }
      const doc = {
        sourceRowSha256: rowHash,
        rawValues: columns.map(key => row[key]),
        encoding: 'postgres-copy-text-or-null',
      };
      // Allow generous overhead below Firestore's hard 1 MiB limit.
      if (Buffer.byteLength(JSON.stringify(doc), 'utf8') + 8192 > MAX_DOC_ESTIMATE) {
        issues.oversizedRows++; invalidInTable = true; continue;
      }
      tableDocsForRows.push({ tableDigest, docId, payload: doc });
    }
    if (invalidInTable) continue;
    tableDocs.push({
      tableDigest,
      payload: {
        sourceTable: table, columns, rowCount: rows.length,
        encoding: 'postgres-copy-text-or-null',
      },
    });
    plannedRows.push(...tableDocsForRows);
  }

  const issueCount = Object.values(issues).reduce((n,v)=>n+v,0);
  const summary = {
    formatVersion: 1,
    scope: 'PRIVATE-FIRESTORE-EMULATOR-ARCHIVE-ONLY',
    sourceTables: tables.length,
    archivedPublicTables: tableDocs.length,
    archivedPublicRows: plannedRows.length,
    ignoredNonPublicTables,
    ignoredNonPublicRows,
    keylessTables,
    issues,
    sourceLiveReconciled: false,
    cloudWrites: 0,
    readyForCloudImport: false,
    emulatorPlanValid: issueCount === 0,
    caveat: 'Raw PostgreSQL COPY text/null archive. Not converted types, access rules, SQL RPC or application Firestore model.',
  };
  return {
    snapshotId: snapshotHash,
    tableDocs, plannedRows,
    summary,
  };
}

export async function loadVerifiedPrivateTables(normalizedDir) {
  const root = await realpath(resolve(normalizedDir));
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error('Invalid private normalized directory');
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 ||
      manifest.valueEncoding !== 'postgres-copy-text-or-null' ||
      !Array.isArray(manifest.tables)) {
    throw new Error('Invalid private normalized manifest');
  }
  const seenFiles = new Set();
  const tables = [];
  for (const entry of manifest.tables) {
    if (!entry || !TABLE.test(entry.table || '') || !SAFE_FILE.test(entry.file || '') ||
        !SHA.test(entry.sha256 || '') || !Number.isSafeInteger(entry.rows) ||
        entry.rows < 0 || seenFiles.has(entry.file)) {
      throw new Error('Invalid private source manifest entry');
    }
    seenFiles.add(entry.file);
    const filepath = join(root, entry.file);
    const stat = await lstat(filepath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE) {
      throw new Error('Invalid private source table file');
    }
    const canonical = await realpath(filepath);
    const inside = relative(root, canonical);
    if (!inside || inside === '..' || inside.startsWith('..'+sep) || inside.startsWith(sep)) {
      throw new Error('Private source table escaped the normalized directory');
    }
    const bytes = await readFile(canonical);
    if (sha256(bytes) !== entry.sha256) throw new Error('Invalid table SHA-256');
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (parsed.sourceTable !== entry.table || !Array.isArray(parsed.rows) ||
        !Array.isArray(parsed.columns) || parsed.rows.length !== entry.rows) {
      throw new Error('Normalized table does not match manifest');
    }
    tables.push({table: entry.table, columns: parsed.columns, rows: parsed.rows});
  }

  // Derive a stable archive namespace from the verified per-table SHA-256
  // values, without logging the original SQL dump hash or individual IDs.
  const identity = sha256(JSON.stringify(
    manifest.tables.map(entry => [entry.table, entry.sha256]).sort((a,b)=>a[0].localeCompare(b[0]))
  ));
  return { tables, snapshotHash: identity };
}

export async function loadPrivateArchivePlan(normalizedDir) {
  const { tables, snapshotHash } = await loadVerifiedPrivateTables(normalizedDir);
  return buildPrivateArchivePlan(tables, snapshotHash);
}

export async function writePrivateArchiveToEmulator(plan, db) {
  if (!plan?.summary?.emulatorPlanValid || !SHA.test(plan.snapshotId)) {
    throw new Error('Private archive is incomplete or invalid; no emulator writes allowed');
  }
  const root = db.collection(PRIVATE_COLLECTION).doc(plan.snapshotId);
  let batch = db.batch();
  let pending = 0;
  let writes = 0;
  const flush = async () => {
    if (!pending) return;
    await batch.commit();
    writes += pending;
    batch = db.batch();
    pending = 0;
  };
  async function enqueue(ref, payload) {
    batch.set(ref, payload);
    pending++;
    if (pending >= 200) await flush();
  }
  // Status is "incomplete" until every document commit succeeded.
  await root.set({
    formatVersion: 1, status: 'incomplete',
    publicRowsExpected: plan.summary.archivedPublicRows,
    publicTablesExpected: plan.summary.archivedPublicTables,
    private: true,
  });
  writes++;
  for (const table of plan.tableDocs) {
    await enqueue(root.collection('tables').doc(table.tableDigest), table.payload);
  }
  for (const row of plan.plannedRows) {
    const ref = root.collection('tables').doc(row.tableDigest).collection('rows').doc(row.docId);
    await enqueue(ref, row.payload);
  }
  await flush();
  await root.set({
    formatVersion: 1, status: 'complete',
    publicRowsExpected: plan.summary.archivedPublicRows,
    publicTablesExpected: plan.summary.archivedPublicTables,
    private: true,
  });
  writes++;
  return {
    snapshotCreated: true, archivedPublicTables: plan.summary.archivedPublicTables,
    archivedPublicRows: plan.summary.archivedPublicRows,
    emulatorWrites: writes, cloudWrites: 0, readyForCloudImport: false,
  };
}

function parseArgs(args) {
  const options = {execute: false};
  for (let i=0; i<args.length; i++) {
    if (args[i] === '--execute-emulator') { options.execute = true; continue; }
    if (args[i] === '--normalized' && args[i+1] && !args[i+1].startsWith('--')) {
      options.normalized = args[++i]; continue;
    }
    throw new Error('Invalid CLI option');
  }
  if (!options.normalized) throw new Error('Private normalized directory is required');
  return options;
}

export async function main(args, options={}) {
  const parsed = parseArgs(args);
  // Make a complete plan and validate size/IDs before touching an emulator.
  const plan = await loadPrivateArchivePlan(parsed.normalized);
  if (!parsed.execute) {
    if (!options.silent) process.stdout.write(JSON.stringify(plan.summary, null, 2) + '\n');
    return plan.summary;
  }
  assertEmulatorOnly(options.env || process.env, options.projectId || DEMO_PROJECT);
  if (!plan.summary.emulatorPlanValid) throw new Error('Archive has blockers; no emulator write performed');
  const suppliedDb = options.db;
  let app, db = suppliedDb;
  if (!db) {
    const { initializeApp, deleteApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    app = initializeApp({projectId: DEMO_PROJECT}, 'cormyr-private-emulator-archive');
    db = getFirestore(app);
  }
  try {
    const result = await writePrivateArchiveToEmulator(plan, db);
    if (!options.silent) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    if (app) {
      const { deleteApp } = await import('firebase-admin/app');
      await deleteApp(app);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => {
    console.error('Firestore emulator archive blocked or failed. Private fields not printed.');
    process.exitCode = 1;
  });
}
