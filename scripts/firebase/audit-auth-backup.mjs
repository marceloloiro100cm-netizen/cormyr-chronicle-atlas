/**
 * Private, read-only validation of normalized Supabase auth backup.
 * Never logs or exports UID, email, password hash, provider identity, or raw rows.
 * Input is produced offline by scripts/firebase/prepare-backup.sh.
 */
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const bcrypt = /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/;

export async function loadTable(normalizedDir, manifest, sourceTable) {
  const entry = manifest.tables?.find(record => record.table === sourceTable);
  if (!entry) return null;
  if (!/^[0-9]{3,}\u002ejson$/.test(entry.file || '') || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
    throw new Error('Invalid private manifest entry');
  }
  const root = await realpath(normalizedDir);
  const path = join(root, entry.file);
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Non-regular private table file');
  const actual = await realpath(path);
  const inside = relative(root, actual);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || inside.startsWith(sep)) {
    throw new Error('Private export path escapes normalization directory');
  }
  const bytes = await readFile(actual);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== entry.sha256) throw new Error('Private auth export hash mismatch');
  const data = JSON.parse(bytes.toString('utf8'));
  if (data.sourceTable !== sourceTable || !Array.isArray(data.rows) ||
      data.rows.length !== entry.rows) throw new Error('Private table integrity mismatch');
  return data.rows;
}

export function summarizeAuth(users, identities) {
  if (!Array.isArray(users)) throw new Error('Missing auth.users table');
  const ids = new Set();
  const emails = new Set();
  const report = {
    formatVersion: 1, scope: 'offline-backup-only', liveSourceCompared: false,
    users: users.length,
    bcryptPasswordCount: 0, emptyPasswordCount: 0, unsupportedHashCount: 0,
    invalidUidCount: 0, duplicateUidCount: 0,
    missingEmailCount: 0, duplicateEmailCount: 0,
    verifiedEmailCount: 0,
    externalProviderIdentityCount: 0,
    providersVerified: identities !== null,
    firebaseUsersImported: 0, readyForImport: false,
  };
  for (const row of users) {
    const id = row?.id;
    if (typeof id !== 'string' || !id || id.length > 128) report.invalidUidCount++;
    else if (ids.has(id)) report.duplicateUidCount++;
    else ids.add(id);

    const email = row?.email;
    if (typeof email !== 'string' || !email.trim()) report.missingEmailCount++;
    else {
      const key = email.trim().toLowerCase();
      if (emails.has(key)) report.duplicateEmailCount++;
      emails.add(key);
    }

    const hash = row?.encrypted_password;
    if (hash === null || hash === undefined || hash === '') report.emptyPasswordCount++;
    else if (typeof hash === 'string' && bcrypt.test(hash)) report.bcryptPasswordCount++;
    else report.unsupportedHashCount++;

    const verifiedField = Object.hasOwn(row,'email_confirmed_at') ? row.email_confirmed_at : row.confirmed_at;
    if (verifiedField !== null && verifiedField !== undefined && verifiedField !== '') report.verifiedEmailCount++;
  }
  if (Array.isArray(identities)) {
    report.externalProviderIdentityCount = identities.filter(identity =>
      identity?.provider && identity.provider !== 'email').length;
  }
  const blockers = [
    'Backup cannot prove the current source Auth state; reconcile with a final live export',
    'Firebase destination UID and email collisions must be checked before bulk import',
    'No Firebase Auth users or sessions have been imported by this audit',
  ];
  if (report.invalidUidCount || report.duplicateUidCount || report.duplicateEmailCount) {
    blockers.push('Invalid or duplicate source identifiers need manual reconciliation');
  }
  if (report.unsupportedHashCount) blockers.push('Unsupported source password hashes require separate handling');
  if (report.emptyPasswordCount) blockers.push('Users without a password need a supported sign-in/reset strategy');
  if (!report.providersVerified || report.externalProviderIdentityCount) {
    blockers.push('OAuth identities must be reviewed and re-linked; never assume passwords cover them');
  }
  return { ...report, blockers };
}

export async function auditNormalizedAuth(normalizedDir) {
  const dir = resolve(normalizedDir);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.valueEncoding !== 'postgres-copy-text-or-null' ||
      !Array.isArray(manifest.tables)) throw new Error('Unsupported normalized backup manifest');
  const users = await loadTable(dir, manifest, 'auth.users');
  const identities = await loadTable(dir, manifest, 'auth.identities');
  return summarizeAuth(users, identities);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/firebase/audit-auth-backup.mjs PRIVATE_NORMALIZED_DIRECTORY');
    process.exitCode = 2;
  } else {
    auditNormalizedAuth(process.argv[2]).then(report => {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    }).catch(error => {
      // Do not print arbitrary source data or file contents in error messages.
      console.error('Private Auth preflight failed:', error.message);
      process.exitCode = 1;
    });
  }
}
