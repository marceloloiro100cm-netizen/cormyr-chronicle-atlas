import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDestination, listAllFirebaseUsers } from './audit-auth-destination.mjs';

const mockAudit = {
  bcryptPasswordCount: 2,
  emptyPasswordCount: 1,
  externalProviderIdentityCount: 1,
  invalidUidCount: 0,
  duplicateUidCount: 0,
  duplicateEmailCount: 0,
  missingEmailCount: 0,
  unsupportedHashCount: 0,
};

const source = [
  { id: 'uid-1', email: 'A@example.invalid' },
  { id: 'uid-2', email: 'b@example.invalid' },
  { id: 'uid-3', email: 'c@example.invalid' },
];

test('empty Firebase destination reports no collisions but never claims import readiness', () => {
  const result = compareDestination(source, [], mockAudit);
  assert.equal(result.destinationEmpty, true);
  assert.equal(result.destinationUsers, 0);
  assert.equal(result.uidCollisions, 0);
  assert.equal(result.emailCollisions, 0);
  assert.equal(result.readyForImport, false);
  assert.equal(result.firebaseWrites, 0);
  assert.equal(result.sourceBcryptAccounts, 2);
});

test('UID overwrites and case-insensitive email collisions block import', () => {
  const result = compareDestination(source, [
    { uid: 'uid-2', email: 'other@example.invalid' },
    { uid: 'unrelated', email: 'a@EXAMPLE.invalid' },
  ], mockAudit);
  assert.equal(result.destinationEmpty, false);
  assert.equal(result.uidCollisions, 1);
  assert.equal(result.emailCollisions, 1);
  assert.ok(result.blockers.some(text => text.includes('overwrite')));
  assert.ok(!JSON.stringify(result).includes('example.invalid'));
  assert.ok(!JSON.stringify(result).includes('uid-2'));
});

test('all pages are inspected, not just the first thousand users', async () => {
  const seen = [];
  const users = await listAllFirebaseUsers({
    async listUsers(size, pageToken) {
      seen.push([size, pageToken]);
      return pageToken
        ? { users: [{ uid: 'uid-2' }] }
        : { users: [{ uid: 'uid-1' }], pageToken: 'next' };
    },
  });
  assert.deepEqual(users.map(user => user.uid), ['uid-1', 'uid-2']);
  assert.deepEqual(seen, [[1000, undefined], [1000, 'next']]);
});

test('invalid listUsers responses fail closed', async () => {
  await assert.rejects(listAllFirebaseUsers({
    async listUsers() { return { users: null }; },
  }), /Invalid Firebase/);
});
