import { describe, expect, it, vi } from 'vitest';
import {
  resolveHomologationConfig, sessionTokenStorage, verifyFirebaseHomologationToken,
} from './firebase-homologation';

describe('Firebase homologation client (never a production backend switch)', () => {
  it('requires explicit enabled flag and both public Firebase settings', () => {
    expect(resolveHomologationConfig(undefined, 'key', 'cormyr')).toBeNull();
    expect(resolveHomologationConfig('TRUE', 'key', 'cormyr')).toBeNull();
    expect(resolveHomologationConfig('true', undefined, 'cormyr')).toBeNull();
    expect(resolveHomologationConfig('true', 'key', '')).toBeNull();
    expect(resolveHomologationConfig('true', 'key', 'cormyr')).toEqual({
      apiKey: 'key', projectId: 'cormyr',
    });
  });
  it('holds refresh credentials only in the injected browser session storage', () => {
    const state = new Map<string, string>();
    const store = {
      getItem: (k: string) => state.get(k) ?? null,
      setItem: (k: string, v: string) => { state.set(k, v); },
      removeItem: (k: string) => { state.delete(k); },
    };
    const tokens = sessionTokenStorage(store);
    expect(tokens.get()).toBeNull();
    tokens.set('refresh-secret');
    expect(tokens.get()).toBe('refresh-secret');
    tokens.set(null);
    expect(tokens.get()).toBeNull();
    expect(state.size).toBe(0);
  });
  it('attaches the Firebase token only to the isolated verification endpoint', async () => {
    const fetcher = vi.fn(async () => new Response('{"authenticated":true}', { status: 200 }));
    expect(await verifyFirebaseHomologationToken('jwt', fetcher as never)).toBe('verified');
    expect(fetcher).toHaveBeenCalledWith('/api/firebase-auth-verify', {
      method: 'GET', cache: 'no-store', credentials: 'omit',
      headers: { Authorization: 'Bearer jwt' },
    });
    expect(await verifyFirebaseHomologationToken('', fetcher as never)).toBe('denied');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not treat an HTML 200 fallback as successful verification', async () => {
    const html = vi.fn(async () => new Response('<html>OK</html>', { status: 200 }));
    expect(await verifyFirebaseHomologationToken('jwt', html as never)).toBe('unavailable');
    const wrong = vi.fn(async () => new Response('{"authenticated":false}', { status: 200 }));
    expect(await verifyFirebaseHomologationToken('jwt', wrong as never)).toBe('unavailable');
  });
  it('does not use Supabase fallback when the Firebase token fails', async () => {
    const fail = vi.fn(async () => new Response('{}', { status: 401 }));
    expect(await verifyFirebaseHomologationToken('jwt', fail as never)).toBe('denied');
    const unavailable = vi.fn(async () => new Response('{}', { status: 503 }));
    expect(await verifyFirebaseHomologationToken('jwt', unavailable as never)).toBe('unavailable');
  });
});
