import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseIdentityMappings } from './diagnose-auth-identities.mjs';

test('counts missing owner, unsupported provider, invalid subject and duplicate without private details', () => {
  const users = [{ id: 'id-A' }, { id: 'id-B' }];
  const identities = [
    { user_id: 'id-A', provider: 'google', provider_id: 's1' },
    { user_id: 'id-B', provider: 'discord', provider_id: 's2' },
    { user_id: 'not-found', provider: 'google', provider_id: 's3' },
    { user_id: 'id-B', provider: 'github', provider_id: null },
    { user_id: 'id-B', provider: 'google', provider_id: 's1' },
    { user_id: 'id-A', provider: 'email', provider_id: 'email@example.invalid' },
  ];
  const summary = diagnoseIdentityMappings(users, identities);
  assert.equal(summary.externalIdentities, 5);
  assert.equal(summary.mappedExternalIdentities, 1);
  assert.equal(summary.unmappedExternalIdentities, 4);
  assert.deepEqual(summary.issuesByReason, {
    sourceAccountMissing: 1,
    providerNotSupported: 1,
    providerSubjectMissingOrInvalid: 1,
    providerSubjectDuplicate: 1,
  });
  assert.equal(summary.unmappedByProviderCategory.discord, 1);
  assert.equal(summary.unmappedByProviderCategory.google, 2);
  assert.ok(!JSON.stringify(summary).includes('email@example.invalid'));
  assert.ok(!JSON.stringify(summary).includes('not-found'));
  assert.ok(!JSON.stringify(summary).includes('s1'));
  assert.equal(summary.firebaseWrites, 0);
  assert.equal(summary.readyForImport, false);
});

test('do not echo unknown provider names or malformed identity fields', () => {
  const secretProviderName = 'private-provider-secret';
  const secretSubject = 'secret-subject-123';
  const result = diagnoseIdentityMappings(
    [{ id: 'id-A' }],
    [{ user_id: 'id-A', provider: secretProviderName, provider_id: secretSubject }],
  );
  assert.equal(result.unmappedByProviderCategory.other, 1);
  assert.equal(result.issuesByReason.providerNotSupported, 1);
  assert.ok(!JSON.stringify(result).includes(secretProviderName));
  assert.ok(!JSON.stringify(result).includes(secretSubject));
});

test('recognizes safely mappable provider without needing identity data', () => {
  const report = diagnoseIdentityMappings(
    [{ id: 'id-A' }],
    [{ user_id: 'id-A', provider: 'apple', provider_id: 'apple-account' }],
  );
  assert.equal(report.unmappedExternalIdentities, 0);
  assert.equal(report.mappedExternalIdentities, 1);
  assert.equal(report.allExternalByProviderCategory.apple, 1);
});
