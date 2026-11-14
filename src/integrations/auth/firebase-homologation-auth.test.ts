import { describe, expect, it } from 'vitest';
import { verifyFirebaseHomologationRequest } from './firebase-homologation-auth.server';

const claims = { uid: 'user-a', emailVerified: true, authTime: 100, exp: 300 };
const request = (authorization?: string) =>
  new Request('https://example.test/api/firebase-auth-verify', {
    headers: authorization ? { Authorization: authorization } : {},
  });
const enabled = { enabled: true, projectId: 'cormyr', verifyToken: async () => claims };

describe('Firebase server homologation gate', () => {
  it('is disabled unless server explicitly enables it and supplies a project', async () => {
    const a = await verifyFirebaseHomologationRequest(request('Bearer a.b.c'), {
      ...enabled, enabled: false,
    });
    const b = await verifyFirebaseHomologationRequest(request('Bearer a.b.c'), {
      ...enabled, projectId: undefined,
    });
    expect([a.status, b.status]).toEqual([503, 503]);
  });
  it('rejects anonymous, malformed and invalid tokens without identifying the user', async () => {
    expect((await verifyFirebaseHomologationRequest(request(), enabled)).status).toBe(401);
    expect((await verifyFirebaseHomologationRequest(request('Basic a.b.c'), enabled)).status).toBe(401);
    const bad = await verifyFirebaseHomologationRequest(request('Bearer a.b.c'), {
      ...enabled, verifyToken: async () => { throw new Error('secret details'); },
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ authenticated: false });
  });
  it('accepts verified ID token and never grants Cormyr roles or exposes identity', async () => {
    const res = await verifyFirebaseHomologationRequest(request('Bearer a.b.c'), enabled);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('vary')).toBe('Authorization');
  });
});
