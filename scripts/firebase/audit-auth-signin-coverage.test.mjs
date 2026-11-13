import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSignInCoverage } from './audit-auth-signin-coverage.mjs';

const bcrypt = '$2b$12$' + 'A'.repeat(53);
const user = (id, email, hash = bcrypt) => ({ id, email, encrypted_password: hash });

test('custom identity on bcrypt account can be reviewed separately from passwordless google account', () => {
  const output = summarizeSignInCoverage([
    user('uid-1', 'private1@example.invalid'),
    user('uid-2', 'private2@example.invalid', ''),
  ], [
    { user_id: 'uid-1', provider: 'custom:private-tenant', provider_id: 'private-subject' },
    { user_id: 'uid-2', provider: 'google', provider_id: 'google-subject' },
  ]);
  assert.equal(output.sourceAccounts, 2);
  assert.equal(output.accountsWithBcrypt, 1);
  assert.equal(output.passwordlessAccounts, 1);
  assert.equal(output.customIdentities, 1);
  assert.equal(output.customAccountsWithBcrypt, 1);
  assert.equal(output.customPasswordlessWithoutKnownOauth, 0);
  assert.equal(output.passwordlessWithKnownOauth, 1);
  assert.equal(output.firebaseWrites, 0);
  assert.equal(output.readyForImport, false);
  assert.ok(!JSON.stringify(output).includes('private-tenant'));
  assert.ok(!JSON.stringify(output).includes('private-subject'));
  assert.ok(!JSON.stringify(output).includes('example.invalid'));
});

test('custom-only passwordless account requires explicit sign-in recovery', () => {
  const output = summarizeSignInCoverage([
    user('uid-1', 'private1@example.invalid', null),
  ], [
    { user_id: 'uid-1', provider: 'custom:secret', provider_id: 'secret-subject' },
  ]);
  assert.equal(output.customPasswordlessWithoutKnownOauth, 1);
  assert.equal(output.passwordlessWithoutKnownOauth, 1);
  assert.match(output.nextAction, /requires verified sign-in recovery/);
  assert.equal(output.readyForImport, false);
});

test('custom plus google on passwordless account has a potential alternate login, not provider approval', () => {
  const output = summarizeSignInCoverage([
    user('uid-1', 'private1@example.invalid', null),
  ], [
    { user_id: 'uid-1', provider: 'custom:private-name', provider_id: 'secret' },
    { user_id: 'uid-1', provider: 'google', provider_id: 'google-uid' },
  ]);
  assert.equal(output.customPasswordlessWithKnownOauth, 1);
  assert.equal(output.customPasswordlessWithoutKnownOauth, 0);
  assert.equal(output.passwordlessWithKnownOauth, 1);
  assert.equal(output.customProviderConfigConfirmed, false);
});

test('reject duplicate or missing auth identifiers and ignore unrelated OAuth identity safely', () => {
  assert.throws(() => summarizeSignInCoverage([
    user('uid-1', 'private1@example.invalid'),
    user('uid-2', 'PRIVATE1@example.invalid'),
  ], []), /Invalid or duplicate/);

  const output = summarizeSignInCoverage([
    user('uid-1', 'private1@example.invalid', null),
  ], [
    { user_id: 'other', provider: 'google', provider_id: 'unknown-subject' },
    { user_id: 'uid-1', provider: 'unknown-provider', provider_id: 'private-subject' },
  ]);
  assert.equal(output.orphanIdentities, 1);
  assert.equal(output.unknownIdentities, 1);
  assert.equal(output.passwordlessWithoutKnownOauth, 1);
  assert.ok(!JSON.stringify(output).includes('unknown-provider'));
  assert.ok(!JSON.stringify(output).includes('private-subject'));
});
