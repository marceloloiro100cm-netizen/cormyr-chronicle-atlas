import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { summarizeAuth, auditNormalizedAuth } from './audit-auth-backup.mjs';

const bcrypt = '$2b$12$' + 'A'.repeat(53);
const user = (id, email, hash = bcrypt) => ({
  id, email, encrypted_password: hash, email_confirmed_at: '2026-01-01',
});

test('redacted summary detects verified bcrypt accounts, OAuth, and collisions', () => {
  const users = [
    user('uuid-1', 'a@example.invalid'),
    user('uuid-2', 'A@example.invalid', null),
    user('uuid-3', 'other@example.invalid', 'not-a-bcrypt-hash'),
    user('uuid-3', null),
  ];
  const report = summarizeAuth(users, [{ provider: 'google' }, { provider: 'email' }]);
  assert.equal(report.users, 4);
  assert.equal(report.bcryptPasswordCount, 2);
  assert.equal(report.emptyPasswordCount, 1);
  assert.equal(report.unsupportedHashCount, 1);
  assert.equal(report.duplicateEmailCount, 1);
  assert.equal(report.duplicateUidCount, 1);
  assert.equal(report.externalProviderIdentityCount, 1);
  assert.equal(report.firebaseUsersImported, 0);
  assert.equal(report.readyForImport, false);
  assert.ok(!JSON.stringify(report).includes('example.invalid'));
  assert.ok(!JSON.stringify(report).includes(bcrypt));
});

test('private normalized export must pass per-table SHA-256 validation', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'cormyr-auth-'));
  const dir = join(parent, 'normalized');
  await mkdir(dir);
  try {
    const table = { sourceTable: 'auth.users', columns: ['id','email','encrypted_password'],
      rows: [user('uuid-1', 'hidden@example.invalid')] };
    const data = Buffer.from(JSON.stringify(table));
    await writeFile(join(dir, '000.json'), data);
    const manifest = {
      formatVersion: 1, valueEncoding: 'postgres-copy-text-or-null',
      tables: [{ table: 'auth.users', file: '000.json', rows: 1,
        sha256: createHash('sha256').update(data).digest('hex') }],
    };
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const report = await auditNormalizedAuth(dir);
    assert.equal(report.users, 1);
    assert.equal(report.bcryptPasswordCount, 1);
    assert.equal(report.providersVerified, false);
    assert.ok(!JSON.stringify(report).includes('hidden@example.invalid'));
    await writeFile(join(dir, '000.json'), JSON.stringify({ ...table, rows: [] }));
    await assert.rejects(auditNormalizedAuth(dir), /hash mismatch/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
