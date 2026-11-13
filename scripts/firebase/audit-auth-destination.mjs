/**
 * Read-only comparison of a private normalized Supabase Auth backup against
 * the configured Firebase Authentication destination. NEVER writes to Auth.
 * Only aggregate counts are emitted; no email, UID, hash or provider ID.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditNormalizedAuth, loadTable } from './audit-auth-backup.mjs';

export function compareDestination(sourceUsers, destinationUsers, sourceAudit) {
  if (!Array.isArray(sourceUsers) || !Array.isArray(destinationUsers)) {
    throw new Error('Invalid auth comparison input');
  }
  const targetIds = new Set(destinationUsers.map(user => user.uid));
  const targetEmails = new Set(destinationUsers
    .map(user => typeof user.email === 'string' ? user.email.trim().toLowerCase() : '')
    .filter(Boolean));

  const sourceUids = new Set();
  const sourceEmails = new Set();
  let uidCollisions = 0;
  let emailCollisions = 0;
  for (const user of sourceUsers) {
    if (typeof user.id === 'string' && targetIds.has(user.id)) uidCollisions++;
    if (typeof user.email === 'string' && targetEmails.has(user.email.trim().toLowerCase())) {
      emailCollisions++;
    }
    if (typeof user.id === 'string') sourceUids.add(user.id);
    if (typeof user.email === 'string') sourceEmails.add(user.email.trim().toLowerCase());
  }

  const destinationEmpty = destinationUsers.length === 0;
  const blockers = [
    'Final live-source delta and role/house access rules are not reconciled',
    'OAuth identities and passwordless accounts need an approved sign-in strategy',
    'This audit never imports users or changes sessions',
  ];
  if (!destinationEmpty) blockers.push('Destination is not empty: do not bulk-import into existing accounts');
  if (uidCollisions || emailCollisions) blockers.push('Destination UID/email collisions: import may overwrite or duplicate users');
  if (sourceAudit?.unsupportedHashCount || sourceAudit?.invalidUidCount ||
      sourceAudit?.duplicateUidCount || sourceAudit?.duplicateEmailCount ||
      sourceAudit?.missingEmailCount) blockers.push('Source identifiers or password hashes need reconciliation');

  return {
    formatVersion: 1,
    scope: 'private-backup-versus-firebase-auth-readonly',
    projectVerifiedByCaller: true,
    sourceUsers: sourceUsers.length,
    destinationUsers: destinationUsers.length,
    destinationEmpty,
    uidCollisions,
    emailCollisions,
    sourceUidCount: sourceUids.size,
    sourceEmailCount: sourceEmails.size,
    sourceBcryptAccounts: sourceAudit?.bcryptPasswordCount ?? null,
    sourcePasswordlessAccounts: sourceAudit?.emptyPasswordCount ?? null,
    sourceExternalIdentities: sourceAudit?.externalProviderIdentityCount ?? null,
    liveSourceReconciled: false,
    firebaseWrites: 0,
    readyForImport: false,
    blockers,
  };
}

export async function listAllFirebaseUsers(auth) {
  const users = [];
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    if (!page || !Array.isArray(page.users)) throw new Error('Invalid Firebase listUsers response');
    users.push(...page.users);
    if (users.length > 100000) throw new Error('Destination exceeds safe audit limit');
    token = page.pageToken;
  } while (token);
  return users;
}

export async function auditDestination(normalizedDir, projectId, options = {}) {
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId || '')) {
    throw new Error('Explicit Firebase project ID required');
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Firebase Auth emulator enabled: live destination audit refused');
  }
  if (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== projectId) {
    throw new Error('Project ID differs from Cloud Shell environment');
  }
  const root = resolve(normalizedDir);
  const sourceAudit = await auditNormalizedAuth(root);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const users = await loadTable(root, manifest, 'auth.users');
  if (!users || !users.length) throw new Error('Private source users missing');

  if (options.auth) {
    return compareDestination(users, await listAllFirebaseUsers(options.auth), sourceAudit);
  }
  const { applicationDefault, initializeApp, deleteApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const app = initializeApp({ credential: applicationDefault(), projectId },
    'cormyr-auth-readonly-preflight');
  try {
    return compareDestination(users, await listAllFirebaseUsers(getAuth(app)), sourceAudit);
  } finally {
    await deleteApp(app);
  }
}

function parseArgs(args) {
  if (args.length !== 4 || args[0] !== '--normalized' || args[2] !== '--project' ||
      !args[1] || !args[3]) {
    throw new Error('Usage: node scripts/firebase/audit-auth-destination.mjs --normalized PRIVATE_DIR --project FIREBASE_PROJECT');
  }
  return { normalized: args[1], project: args[3] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    auditDestination(options.normalized, options.project)
      .then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
      .catch(() => {
        console.error('Firebase Auth destination audit failed; no account data printed and no writes performed.');
        process.exitCode = 1;
      });
  } catch {
    console.error('Usage: node scripts/firebase/audit-auth-destination.mjs --normalized PRIVATE_DIR --project FIREBASE_PROJECT');
    process.exitCode = 2;
  }
}
