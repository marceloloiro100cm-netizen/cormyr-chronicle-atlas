/**
 * Firebase Auth migration preparation for a PRIVATE, normalized PostgreSQL dump.
 * Default: offline dry-run (no Firebase access, no writes).
 * Execution: explicitly opt in after final source reconciliation and provider configuration.
 * Never log UIDs, emails, provider IDs, hashes, passwords, or source rows.
 */
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { auditNormalizedAuth, loadTable } from './audit-auth-backup.mjs';
import { listAllFirebaseUsers } from './audit-auth-destination.mjs';

const BCRYPT = /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/;
const PROVIDERS = {
  google: 'google.com',
  github: 'github.com',
  facebook: 'facebook.com',
  apple: 'apple.com',
  twitter: 'twitter.com',
  azure: 'microsoft.com',
};
const HASH = /^[0-9a-f]{64}$/;

export function buildAuthImportPlan(users, identities, sourceAudit) {
  if (!Array.isArray(users) || !Array.isArray(identities)) {
    throw new Error('Both private auth.users and auth.identities exports are required');
  }
  const issues = [];
  const byUid = new Map();
  const emails = new Set();
  const records = [];
  let bcryptCount = 0;
  let passwordlessCount = 0;
  let disabledCount = 0;
  let verifiedEmailCount = 0;
  let mappedExternalIdentities = 0;
  let unmappedExternalIdentities = 0;

  for (const user of users) {
    const uid = user?.id;
    const email = user?.email;
    if (typeof uid !== 'string' || !uid || uid.length > 128 ||
        typeof email !== 'string' || !email.includes('@') || email.length > 320 ||
        byUid.has(uid) || emails.has(email.trim().toLowerCase())) {
      issues.push('Source has missing, duplicated, or invalid account identifier');
      continue;
    }
    const hash = user?.encrypted_password;
    if (hash != null && hash !== '' && !BCRYPT.test(hash)) {
      issues.push('At least one account has an unsupported password hash');
      continue;
    }
    const record = { uid, email: email.trim(), emailVerified: !!(user.email_confirmed_at || user.confirmed_at) };
    if (hash) {
      record.passwordHash = Buffer.from(hash, 'utf8');
      bcryptCount++;
    } else {
      passwordlessCount++;
    }
    const bannedUntil = Date.parse(user.banned_until || '');
    if (user.deleted_at || (Number.isFinite(bannedUntil) && bannedUntil > Date.now())) {
      record.disabled = true;
      disabledCount++;
    }
    if (record.emailVerified) verifiedEmailCount++;
    byUid.set(uid, record);
    emails.add(email.trim().toLowerCase());
    records.push(record);
  }

  for (const identity of identities) {
    if (!identity?.provider || identity.provider === 'email') continue;
    const providerId = Object.hasOwn(PROVIDERS, identity.provider)
      ? PROVIDERS[identity.provider] : undefined;
    const owner = byUid.get(identity.user_id);
    const providerUid = identity.provider_id;
    if (!owner || !providerId || typeof providerUid !== 'string' || !providerUid ||
        providerUid.length > 256) {
      unmappedExternalIdentities++;
      continue;
    }
    const existing = owner.providerData || [];
    if (existing.some(item => item.providerId === providerId && item.uid === providerUid)) {
      unmappedExternalIdentities++;
      continue;
    }
    owner.providerData = [...existing, { providerId, uid: providerUid }];
    mappedExternalIdentities++;
  }

  if (records.length !== users.length) issues.push('Not every source account has a valid import record');
  if (unmappedExternalIdentities) issues.push('External identity mapping is incomplete or unsupported');
  if (sourceAudit?.unsupportedHashCount || sourceAudit?.duplicateUidCount ||
      sourceAudit?.duplicateEmailCount || sourceAudit?.missingEmailCount ||
      sourceAudit?.invalidUidCount || !sourceAudit?.providersVerified) {
    issues.push('Source Authentication audit did not pass all identifier/provider checks');
  }
  if (sourceAudit?.externalProviderIdentityCount !== mappedExternalIdentities + unmappedExternalIdentities) {
    issues.push('External identity count differs from private backup audit');
  }
  return {
    records,
    summary: {
      sourceUsers: users.length,
      importCandidates: records.length,
      bcryptCount,
      passwordlessCount,
      disabledCount,
      verifiedEmailCount,
      mappedExternalIdentities,
      unmappedExternalIdentities,
      issues: [...new Set(issues)],
      dryRunOnly: true,
      readyForLiveImport: false,
    },
  };
}

export async function loadPrivateAuthPlan(normalized) {
  const root = resolve(normalized);
  const audit = await auditNormalizedAuth(root);
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (!HASH.test(manifest.audit?.sqlSha256 || '')) {
    throw new Error('Private dump requires a validated original SQL SHA-256');
  }
  const users = await loadTable(root, manifest, 'auth.users');
  const identities = await loadTable(root, manifest, 'auth.identities');
  const { records, summary } = buildAuthImportPlan(users, identities, audit);
  return { records, summary, sourceSqlSha256: manifest.audit.sqlSha256 };
}

function parseArgs(argv) {
  const flags = new Set(['--execute', '--confirm-source-reconciled', '--confirm-provider-signin-configured']);
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i];
    if (flags.has(option)) { parsed[option] = true; continue; }
    if (!['--normalized', '--project', '--expected-sql-sha256'].includes(option) ||
        !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Invalid or incomplete CLI option');
    }
    parsed[option] = argv[++i];
  }
  if (!parsed['--normalized'] || !parsed['--project']) {
    throw new Error('Usage: node scripts/firebase/prepare-auth-import.mjs --normalized PRIVATE_DIR --project PROJECT [--execute --expected-sql-sha256 SHA --confirm-source-reconciled --confirm-provider-signin-configured]');
  }
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(parsed['--project'])) throw new Error('Invalid project ID');
  return parsed;
}

export async function run(argv, options = {}) {
  const args = parseArgs(argv);
  const { records, summary, sourceSqlSha256 } = await loadPrivateAuthPlan(args['--normalized']);
  if (!args['--execute']) {
    const result = { ...summary, project: args['--project'],
      requiresFinalLiveReconciliation: true, firebaseWrites: 0 };
    if (!options.silent) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Refusing live import with emulator configured');
  if (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== args['--project']) {
    throw new Error('Cloud Shell project mismatch');
  }
  if (summary.issues.length || summary.importCandidates !== summary.sourceUsers ||
      !args['--confirm-source-reconciled'] || !args['--confirm-provider-signin-configured'] ||
      args['--expected-sql-sha256'] !== sourceSqlSha256) {
    throw new Error('Import blocked: source, providers, or explicit operator acknowledgments incomplete');
  }
  const { applicationDefault, initializeApp, deleteApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const app = initializeApp({ credential: applicationDefault(), projectId: args['--project'] },
    'cormyr-auth-import-gated');
  try {
    const auth = options.auth || getAuth(app);
    // Firebase importUsers may REPLACE same UID and does not reject duplicate emails.
    // Recheck the entire destination immediately before attempting any writes.
    const destination = await listAllFirebaseUsers(auth);
    if (destination.length) throw new Error('Import blocked: Firebase Authentication destination is not empty');
    const result = await auth.importUsers(records, { hash: { algorithm: 'BCRYPT' } });
    const counts = {
      project: args['--project'],
      attempted: records.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      firebaseWrites: result.successCount,
      needsManualReconciliation: result.failureCount > 0,
    };
    if (!options.silent) process.stdout.write(JSON.stringify(counts, null, 2) + '\n');
    return counts;
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch(() => {
    console.error('Auth import preflight blocked or failed. No personal account details logged. Do not retry blindly after a partial import.');
    process.exitCode = 1;
  });
}
