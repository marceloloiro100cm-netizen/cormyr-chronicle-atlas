import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthImportPlan } from './prepare-auth-import.mjs';

const bcrypt = '$2b$12$' + 'A'.repeat(53);
const audit = {
  providersVerified: true,
  externalProviderIdentityCount: 1,
  unsupportedHashCount: 0,
  duplicateUidCount: 0,
  duplicateEmailCount: 0,
  missingEmailCount: 0,
  invalidUidCount: 0,
};

test('prepare valid BCRYPT, verified email, passwordless and provider mapping', () => {
  const users = [
    { id: 'user-one', email: 'one@example.invalid', encrypted_password: bcrypt,
      email_confirmed_at: '2026-01-01', banned_until: null },
    { id: 'user-two', email: 'two@example.invalid', encrypted_password: null,
      email_confirmed_at: null, banned_until: null },
  ];
  const identities = [
    { user_id: 'user-two', provider: 'google', provider_id: 'google-person-id' },
    { user_id: 'user-one', provider: 'email', provider_id: 'one@example.invalid' },
  ];
  const { records, summary } = buildAuthImportPlan(users, identities, audit);
  assert.equal(records.length, 2);
  assert.equal(summary.bcryptCount, 1);
  assert.equal(summary.passwordlessCount, 1);
  assert.equal(summary.mappedExternalIdentities, 1);
  assert.equal(summary.unmappedExternalIdentities, 0);
  assert.equal(summary.verifiedEmailCount, 1);
  assert.equal(records[0].passwordHash.toString('utf8'), bcrypt);
  assert.equal(records[1].passwordHash, undefined);
  assert.deepEqual(records[1].providerData, [{ providerId: 'google.com', uid: 'google-person-id' }]);
  assert.deepEqual(summary.issues, []);
  assert.equal(summary.readyForLiveImport, false);
  assert.ok(!JSON.stringify(summary).includes('example.invalid'));
  assert.ok(!JSON.stringify(summary).includes('google-person-id'));
  assert.ok(!JSON.stringify(summary).includes(bcrypt));
});

test('reject unsupported provider mappings and orphan identities', () => {
  const users = [{ id: 'user-one', email: 'one@example.invalid', encrypted_password: bcrypt }];
  const identities = [
    { user_id: 'user-one', provider: 'unknown-provider', provider_id: 'private-value' },
    { user_id: 'missing', provider: 'google', provider_id: 'another-private-value' },
  ];
  const { summary } = buildAuthImportPlan(users, identities, {
    ...audit, externalProviderIdentityCount: 2,
  });
  assert.equal(summary.unmappedExternalIdentities, 2);
  assert.ok(summary.issues.length);
  assert.ok(!JSON.stringify(summary).includes('private-value'));
});

test('duplicates and unsupported hashes cannot be silently imported', () => {
  const users = [
    { id: 'user-one', email: 'one@example.invalid', encrypted_password: bcrypt },
    { id: 'user-two', email: 'ONE@example.invalid', encrypted_password: bcrypt },
    { id: 'user-three', email: 'three@example.invalid', encrypted_password: 'bad-hash' },
  ];
  const { records, summary } = buildAuthImportPlan(users, [], {
    ...audit, externalProviderIdentityCount: 0,
  });
  assert.equal(records.length, 1);
  assert.equal(summary.importCandidates, 1);
  assert.equal(summary.sourceUsers, 3);
  assert.ok(summary.issues.length);
  assert.equal(summary.readyForLiveImport, false);
});

test('banned users remain disabled in import candidate', () => {
  const { records, summary } = buildAuthImportPlan(
    [{ id: 'user-one', email: 'one@example.invalid', encrypted_password: bcrypt,
      banned_until: '2099-01-01T00:00:00Z' }],
    [], { ...audit, externalProviderIdentityCount: 0 },
  );
  assert.equal(records[0].disabled, true);
  assert.equal(summary.disabledCount, 1);
});
