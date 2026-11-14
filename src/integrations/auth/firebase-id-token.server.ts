/** Server-side verification of Firebase ID tokens without extra dependencies.
 * RS256 only, signature checked against Google's securetoken JWKS (injected,
 * so it is testable and cacheable). Not wired into any middleware yet. */
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';

export interface FirebaseIdClaims { uid: string; email?: string; emailVerified: boolean; authTime: number; exp: number }
export class IdTokenError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'IdTokenError'; this.code = code; }
}
export const SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
export type JwkWithKid = JsonWebKey & { kid?: string };

export interface VerifyOptions {
  projectId: string;
  /** Returns the current key set; the caller owns caching. */
  jwks: () => Promise<JwkWithKid[]>;
  now?: () => number;
  /** Clock skew tolerance in seconds. */
  leewaySec?: number;
}

const b64 = (s: string) => Buffer.from(s, 'base64url');
function parseJson(part: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(b64(part).toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
    return v as Record<string, unknown>;
  } catch { throw new IdTokenError('MALFORMED'); }
}

export async function verifyFirebaseIdToken(token: string, opts: VerifyOptions): Promise<FirebaseIdClaims> {
  if (!opts.projectId) throw new Error('projectId required');
  const parts = typeof token === 'string' ? token.split('.') : [];
  const [h, p, s] = parts;
  if (parts.length !== 3 || !h || !p || !s) throw new IdTokenError('MALFORMED');
  const header = parseJson(h);
  if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') throw new IdTokenError('BAD_HEADER');
  const keys = await opts.jwks();
  const jwk = keys.find(k => k.kid === header['kid']);
  if (!jwk || jwk.kty !== 'RSA') throw new IdTokenError('UNKNOWN_KEY');
  let ok = false;
  try {
    ok = cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), b64(s));
  } catch { ok = false; }
  if (!ok) throw new IdTokenError('BAD_SIGNATURE');

  const c = parseJson(p);
  const now = Math.floor((opts.now ?? Date.now)() / 1000), leeway = opts.leewaySec ?? 60;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const exp = num(c['exp']), iat = num(c['iat']), authTime = num(c['auth_time']);
  if (!(exp > now - leeway)) throw new IdTokenError('EXPIRED');
  if (!(iat <= now + leeway) || !(authTime <= now + leeway)) throw new IdTokenError('FUTURE_TOKEN');
  if (c['aud'] !== opts.projectId || c['iss'] !== `https://securetoken.google.com/${opts.projectId}`)
    throw new IdTokenError('WRONG_AUDIENCE');
  const sub = c['sub'];
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) throw new IdTokenError('BAD_SUBJECT');
  const email = typeof c['email'] === 'string' ? c['email'] : undefined;
  return { uid: sub, ...(email ? { email } : {}), emailVerified: c['email_verified'] === true, authTime, exp };
}

/** Fetches and caches the public keys for the lifetime the response allows. */
export function cachedSecuretokenJwks(fetchFn: typeof fetch = fetch, now: () => number = Date.now) {
  let keys: JwkWithKid[] = [], until = 0;
  return async (): Promise<JwkWithKid[]> => {
    if (keys.length && now() < until) return keys;
    const res = await fetchFn(SECURETOKEN_JWKS_URL);
    if (!res.ok) throw new IdTokenError('JWKS_UNAVAILABLE');
    const body = await res.json() as { keys?: JwkWithKid[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) throw new IdTokenError('JWKS_UNAVAILABLE');
    const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
    keys = body.keys; until = now() + (m?.[1] ? Number(m[1]) * 1000 : 300_000);
    return keys;
  };
}
