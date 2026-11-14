import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyFirebaseIdToken, cachedSecuretokenJwks, type JwkWithKid } from './firebase-id-token.server';

const PROJECT = 'cormyr';
const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const kp = pair(), other = pair();
const jwkOf = (k: typeof kp, kid: string): JwkWithKid => ({ ...k.publicKey.export({ format: 'jwk' }), kid });
const NOW = 1_800_000_000_000, sec = NOW / 1000;
const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mint(over: Record<string, unknown> = {}, opts: { kid?: string; alg?: string; key?: typeof kp } = {}) {
  const h = b({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const p = b({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'u1', iat: sec - 10, auth_time: sec - 10, exp: sec + 3000,
    email: 'a@b.c', email_verified: true, ...over });
  const s = sign('RSA-SHA256', Buffer.from(`${h}.${p}`), (opts.key ?? kp).privateKey).toString('base64url');
  return `${h}.${p}.${s}`;
}
const o = { projectId: PROJECT, jwks: async () => [jwkOf(kp, 'k1')], now: () => NOW };
const code = async (t: string, x = o) => { try { await verifyFirebaseIdToken(t, x); } catch (e) { return (e as { code?: string }).code; } return null; };

describe('verifyFirebaseIdToken', () => {
  it('accepts a valid token and returns the claims', async () => {
    expect(await verifyFirebaseIdToken(mint(), o)).toEqual({ uid: 'u1', email: 'a@b.c', emailVerified: true, authTime: sec - 10, exp: sec + 3000 });
  });
  it('rejects tampering, wrong keys and unknown kid', async () => {
    const t = mint(); const [h, , s] = t.split('.');
    expect(await code(`${h}.${b({ sub: 'evil' })}.${s}`)).toBe('BAD_SIGNATURE');
    expect(await code(mint({}, { key: other }))).toBe('BAD_SIGNATURE');
    expect(await code(mint({}, { kid: 'zz' }))).toBe('UNKNOWN_KEY');
  });
  it('rejects non-RS256 including alg none', async () => {
    expect(await code(mint({}, { alg: 'none' }))).toBe('BAD_HEADER');
    expect(await code(mint({}, { alg: 'HS256' }))).toBe('BAD_HEADER');
    expect(await code('a.b')).toBe('MALFORMED');
    expect(await code('x.y.z')).toBe('MALFORMED');
  });
  it('checks time, audience, issuer and subject', async () => {
    expect(await code(mint({ exp: sec - 1000 }))).toBe('EXPIRED');
    expect(await code(mint({ iat: sec + 1000 }))).toBe('FUTURE_TOKEN');
    expect(await code(mint({ aud: 'other' }))).toBe('WRONG_AUDIENCE');
    expect(await code(mint({ iss: 'https://securetoken.google.com/other' }))).toBe('WRONG_AUDIENCE');
    expect(await code(mint({ sub: '' }))).toBe('BAD_SUBJECT');
    expect(await code(mint({ exp: 'x' }))).toBe('EXPIRED');
  });
});
describe('cachedSecuretokenJwks', () => {
  it('caches by max-age and refetches after it', async () => {
    let t = 0;
    const f = vi.fn(async () => new Response(JSON.stringify({ keys: [jwkOf(kp, 'k1')] }), { headers: { 'cache-control': 'public, max-age=10' } }));
    const get = cachedSecuretokenJwks(f as never, () => t);
    await get(); await get(); expect(f).toHaveBeenCalledTimes(1);
    t = 11_000; await get(); expect(f).toHaveBeenCalledTimes(2);
  });
  it('fails closed when the key set is unavailable', async () => {
    const get = cachedSecuretokenJwks((async () => new Response('{}', { status: 500 })) as never);
    await expect(get()).rejects.toMatchObject({ code: 'JWKS_UNAVAILABLE' });
    const empty = cachedSecuretokenJwks((async () => new Response('{"keys":[]}')) as never);
    await expect(empty()).rejects.toMatchObject({ code: 'JWKS_UNAVAILABLE' });
  });
});
