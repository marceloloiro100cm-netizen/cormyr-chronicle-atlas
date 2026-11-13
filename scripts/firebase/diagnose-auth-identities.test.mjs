import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseIdentityMappings, classifyProviderFormat } from './diagnose-auth-identities.mjs';

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

test('distinguishes public provider aliases and format differences without echoing private labels', () => {
  assert.equal(classifyProviderFormat('google.com'), 'firebase-id:google.com');
  assert.equal(classifyProviderFormat(' GOOGLE '), 'case-or-space-variant:google');
  assert.equal(classifyProviderFormat('phone'), 'known-non-oauth:phone');
  assert.equal(classifyProviderFormat('auth:private-tenant-id'), 'namespaced-or-colon');
  assert.equal(classifyProviderFormat('person@example.invalid'), 'email-like-or-at-sign');
  assert.equal(classifyProviderFormat('unlisted.private-domain'), 'dotted-unknown');
  assert.equal(classifyProviderFormat('unknown id'), 'whitespace-unknown');
  assert.equal(classifyProviderFormat('Mystery'), 'uppercase-symbol-or-unicode');
  assert.equal(classifyProviderFormat('unknown_provider'), 'plain-unknown');

  const report = diagnoseIdentityMappings(
    [{ id: 'user-a' }],
    [{ user_id: 'user-a', provider: 'person@example.invalid', provider_id: 'subject-secret' }],
  );
  assert.deepEqual(report.unmappedByFormat, { 'email-like-or-at-sign': 1 });
  assert.ok(!JSON.stringify(report).includes('person@example.invalid'));
  assert.ok(!JSON.stringify(report).includes('subject-secret'));
});

test('prototype-like strings cannot be misclassified as supported provider', () => {
  const report = diagnoseIdentityMappings(
    [{ id: 'user-a' }],
    [{ user_id: 'user-a', provider: '__proto__', provider_id: 'subject-secret' }],
  );
  assert.equal(report.mappedExternalIdentities, 0);
  assert.equal(report.unmappedExternalIdentities, 1);
  assert.equal(report.issuesByReason.providerNotSupported, 1);
  assert.ok(!JSON.stringify(report).includes('subject-secret'));
});
