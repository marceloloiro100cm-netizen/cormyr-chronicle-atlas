/**
 * Private, read-only coverage audit for migration of Supabase Auth to Firebase.
 * Answers whether the unsupported "custom:" identity belongs to a user with
 * a separate usable sign-in method. No IDs, emails, subjects, hashes, or
 * provider suffixes are written to stdout, files, or logs.
 */
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { auditNormalizedAuth, loadTable } from './audit-auth-backup.mjs';

const SUPPORTED = new Set(['google', 'github', 'facebook', 'apple', 'twitter', 'azure']);
const BCRYPT = /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/;

export function summarizeSignInCoverage(users, identities) {
  if (!Array.isArray(users) || !Array.isArray(identities)) {
    throw new Error('Normalized auth.users and auth.identities required');
  }

  // The only purpose of transient IDs is comparing account and identity links
  // in memory. Never include a raw ID or provider subject in this result.
  const accounts = new Map();
  const emails = new Set();
  for (const user of users) {
    const uid = user?.id;
    const email = user?.email;
    if (typeof uid !== 'string' || !uid || uid.length > 128 || accounts.has(uid) ||
        typeof email !== 'string' || !email.trim() ||
        emails.has(email.trim().toLowerCase())) {
      throw new Error('Invalid or duplicate private source account');
    }
    emails.add(email.trim().toLowerCase());
    accounts.set(uid, {
      hasPassword: BCRYPT.test(user.encrypted_password || ''),
      knownOauth: false,
      custom: false,
    });
  }

  let customIdentities = 0;
  let knownProviderIdentities = 0;
  let unknownIdentities = 0;
  let orphanIdentities = 0;
  for (const identity of identities) {
    const provider = identity?.provider;
    if (typeof provider !== 'string' || !provider || provider === 'email') continue;
    const account = accounts.get(identity.user_id);
    if (!account) {
      orphanIdentities++;
      continue;
    }
    const validSubject = typeof identity.provider_id === 'string' &&
      identity.provider_id.length > 0 && identity.provider_id.length <= 256;
    if (provider.startsWith('custom:')) {
      customIdentities++;
      account.custom = true;
    } else if (SUPPORTED.has(provider) && validSubject) {
      knownProviderIdentities++;
      account.knownOauth = true;
    } else {
      unknownIdentities++;
    }
  }

  const result = {
    scope: 'private-offline-backup',
    sourceAccounts: accounts.size,
    accountsWithBcrypt: 0,
    passwordlessAccounts: 0,
    passwordlessWithKnownOauth: 0,
    passwordlessWithoutKnownOauth: 0,
    customIdentities,
    accountsWithCustomIdentity: 0,
    customAccountsWithBcrypt: 0,
    customPasswordlessWithKnownOauth: 0,
    customPasswordlessWithoutKnownOauth: 0,
    knownProviderIdentities,
    unknownIdentities,
    orphanIdentities,
    customProviderConfigConfirmed: false,
    sourceLiveReconciled: false,
    firebaseWrites: 0,
    readyForImport: false,
  };
  for (const account of accounts.values()) {
    if (account.hasPassword) result.accountsWithBcrypt++;
    else {
      result.passwordlessAccounts++;
      if (account.knownOauth) result.passwordlessWithKnownOauth++;
      else result.passwordlessWithoutKnownOauth++;
    }

    if (account.custom) {
      result.accountsWithCustomIdentity++;
      if (account.hasPassword) result.customAccountsWithBcrypt++;
      else if (account.knownOauth) result.customPasswordlessWithKnownOauth++;
      else result.customPasswordlessWithoutKnownOauth++;
    }
  }

  return {
    ...result,
    nextAction: result.customPasswordlessWithoutKnownOauth
      ? 'Custom-only account requires verified sign-in recovery or OIDC provider integration'
      : 'Custom identity can be deferred only with an explicitly tested alternative sign-in and operator approval',
  };
}

export async function auditNormalizedSignInCoverage(directory) {
  const root = resolve(directory);
  const audit = await auditNormalizedAuth(root);
  if (!audit.providersVerified || audit.invalidUidCount || audit.duplicateUidCount ||
      audit.duplicateEmailCount || audit.missingEmailCount || audit.unsupportedHashCount) {
    throw new Error('Source Auth backup failed integrity or identifier checks');
  }
  const manifest = JSON.parse(await readFile(join(root,'manifest.json'), 'utf8'));
  const users = await loadTable(root, manifest, 'auth.users');
  const identities = await loadTable(root, manifest, 'auth.identities');
  const output = summarizeSignInCoverage(users, identities);
  if (output.sourceAccounts !== audit.users) {
    throw new Error('Source account count mismatch');
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/firebase/audit-auth-signin-coverage.mjs PRIVATE_NORMALIZED_DIRECTORY');
    process.exitCode = 2;
  } else {
    auditNormalizedSignInCoverage(process.argv[2])
      .then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
      .catch(() => {
        console.error('Auth sign-in coverage audit failed; private values were not printed.');
        process.exitCode = 1;
      });
  }
}
