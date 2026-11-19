/**
 * Diagnose Auth provider identity mappings offline without exposing private IDs.
 * The only output is aggregate counts, reason codes, and allowlisted categories.
 * No Firebase connection, exports, account modifications or secret logging.
 */
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadTable, auditNormalizedAuth } from './audit-auth-backup.mjs';

const MAPPABLE = Object.freeze({
  google: 'google.com',
  github: 'github.com',
  facebook: 'facebook.com',
  apple: 'apple.com',
  twitter: 'twitter.com',
  azure: 'microsoft.com',
});
const CATEGORIES = new Set([
  ...Object.keys(MAPPABLE),
  'phone', 'saml', 'sso', 'discord', 'gitlab', 'bitbucket',
  'twitch', 'slack', 'spotify', 'linkedin',
]);
// Publicly-known provider labels only. This is diagnostic classification,
// never an authorization to remap or silently change an OAuth subject.
const KNOWN_FIREBASE_IDS = new Set([
  'google.com', 'github.com', 'facebook.com', 'apple.com',
  'twitter.com', 'microsoft.com', 'yahoo.com',
]);
const KNOWN_NON_OAUTH = new Set([
  'phone', 'saml', 'sso', 'anonymous', 'oidc', 'custom', 'password', 'magiclink',
]);
export function classifyProviderFormat(raw) {
  if (typeof raw !== 'string' || !raw) return 'missing-or-invalid';
  if (KNOWN_FIREBASE_IDS.has(raw)) return 'firebase-id:' + raw;
  const normalized = raw.trim().toLowerCase();
  if (Object.hasOwn(MAPPABLE, normalized)) return 'case-or-space-variant:' + normalized;
  if (KNOWN_FIREBASE_IDS.has(normalized)) return 'firebase-id-case-or-space-variant';
  if (KNOWN_NON_OAUTH.has(normalized)) return 'known-non-oauth:' + normalized;
  if (raw.includes('@')) return 'email-like-or-at-sign';
  // Supabase reserves sso:<provider uuid> for SAML and custom:<id> for
  // custom OAuth/OIDC. Output only the public prefix, never the suffix.
  if (raw.startsWith('sso:') && raw.length > 4) return 'namespaced-sso-saml';
  if (raw.startsWith('custom:') && raw.length > 7) return 'namespaced-custom-oauth-oidc';
  if (raw.includes(':')) return 'namespaced-or-colon';
  if (raw.includes('/')) return 'path-or-slash';
  if (raw.includes('.')) return 'dotted-unknown';
  if (/\s/.test(raw)) return 'whitespace-unknown';
  if (!/^[a-z0-9_-]+$/.test(raw)) return 'uppercase-symbol-or-unicode';
  return 'plain-unknown';
}

const REASONS = Object.freeze([
  'sourceAccountMissing',
  'providerNotSupported',
  'providerSubjectMissingOrInvalid',
  'providerSubjectDuplicate',
]);
function increment(map, key) { map[key] = (map[key] || 0) + 1; }
function categoryOf(provider) {
  return CATEGORIES.has(provider) ? provider : 'other';
}

export function diagnoseIdentityMappings(users, identities) {
  if (!Array.isArray(users) || !Array.isArray(identities)) {
    throw new Error('Private auth.users and auth.identities tables are required');
  }
  const validUsers = new Set(users.filter(user =>
    typeof user?.id === 'string' && user.id.length > 0 && user.id.length <= 128
  ).map(user => user.id));
  const seen = new Set();
  const issuesByReason = Object.fromEntries(REASONS.map(key => [key, 0]));
  const unmappedByProviderCategory = {};
  const allExternalByProviderCategory = {};
  const unmappedByFormat = {};
  let externalIdentities = 0;
  let mappedExternalIdentities = 0;
  let unmappedExternalIdentities = 0;
  for (const identity of identities) {
    if (!identity?.provider || identity.provider === 'email') continue;
    externalIdentities++;
    const category = categoryOf(identity.provider);
    increment(allExternalByProviderCategory, category);
    const providerId = Object.hasOwn(MAPPABLE, identity.provider)
      ? MAPPABLE[identity.provider] : undefined;
    const ownerId = identity.user_id;
    const externalSubject = identity.provider_id;
    let reason = null;
    if (!validUsers.has(ownerId)) {
      reason = 'sourceAccountMissing';
    } else if (!providerId) {
      reason = 'providerNotSupported';
    } else if (typeof externalSubject !== 'string' || !externalSubject ||
               externalSubject.length > 256) {
      reason = 'providerSubjectMissingOrInvalid';
    } else {
      const key = JSON.stringify([providerId, externalSubject]);
      if (seen.has(key)) reason = 'providerSubjectDuplicate';
      else seen.add(key);
    }
    if (reason) {
      increment(issuesByReason, reason);
      increment(unmappedByProviderCategory, category);
      increment(unmappedByFormat, classifyProviderFormat(identity.provider));
      unmappedExternalIdentities++;
    } else {
      mappedExternalIdentities++;
    }
  }
  return {
    scope: 'private-offline-backup',
    externalIdentities,
    mappedExternalIdentities,
    unmappedExternalIdentities,
    issuesByReason,
    allExternalByProviderCategory,
    unmappedByProviderCategory,
    unmappedByFormat,
    noPersonalDataPrinted: true,
    firebaseWrites: 0,
    readyForImport: false,
  };
}

export async function diagnoseNormalizedIdentityMappings(normalized) {
  const dir = resolve(normalized);
  const audit = await auditNormalizedAuth(dir);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const users = await loadTable(dir, manifest, 'auth.users');
  const identities = await loadTable(dir, manifest, 'auth.identities');
  const result = diagnoseIdentityMappings(users, identities);
  if (result.externalIdentities !== audit.externalProviderIdentityCount) {
    throw new Error('External identity count does not match source audit');
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/firebase/diagnose-auth-identities.mjs PRIVATE_NORMALIZED_DIR');
    process.exitCode = 2;
  } else {
    diagnoseNormalizedIdentityMappings(process.argv[2])
      .then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
      .catch(() => {
        console.error('Private Auth identity diagnosis failed; no private fields printed.');
        process.exitCode = 1;
      });
  }
}
