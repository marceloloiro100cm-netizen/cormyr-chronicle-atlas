import { describe, it, expect, vi } from 'vitest';
import { authenticateFirebase, bearerFromHeader } from './firebase-auth-core.server';

const claims = { uid: 'u1', emailVerified: true, authTime: 1, exp: 2 };
describe('bearerFromHeader', () => {
  it('uses the same messages as the Supabase middleware', () => {
    expect(() => bearerFromHeader(null)).toThrow('No authorization header provided');
    expect(() => bearerFromHeader('Basic x')).toThrow('Only Bearer tokens are supported');
    expect(() => bearerFromHeader('Bearer ')).toThrow('No token provided');
    expect(() => bearerFromHeader('Bearer a.b')).toThrow('Invalid token');
    expect(bearerFromHeader('Bearer a.b.c')).toBe('a.b.c');
  });
});
describe('authenticateFirebase', () => {
  it('returns the user context from verified claims', async () => {
    const verify = vi.fn(async () => claims);
    expect(await authenticateFirebase('Bearer a.b.c', verify)).toEqual({ userId: 'u1', firebaseClaims: claims });
    expect(verify).toHaveBeenCalledWith('a.b.c');
  });
  it('hides the verifier failure reason and rejects empty subjects', async () => {
    await expect(authenticateFirebase('Bearer a.b.c', async () => { throw new Error('BAD_SIGNATURE'); })).rejects.toThrow('Unauthorized: Invalid token');
    await expect(authenticateFirebase('Bearer a.b.c', async () => ({ ...claims, uid: '' }))).rejects.toThrow('No user ID found in token');
  });
});
