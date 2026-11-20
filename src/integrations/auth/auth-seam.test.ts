import { describe, it, expect, vi } from 'vitest';
import { bearerHeaders, selectAuthBackend } from './token-provider';
import { createFirebaseRestAuth, FirebaseAuthError, memoryStorage } from './firebase-rest-auth';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const signIn = { localId: 'u1', idToken: 'id1', refreshToken: 'r1', expiresIn: '3600' };

describe('selectAuthBackend', () => {
  it('defaults to supabase and only the exact value picks firebase', () => {
    expect(selectAuthBackend(undefined)).toBe('supabase');
    expect(selectAuthBackend('')).toBe('supabase');
    expect(selectAuthBackend('FIREBASE')).toBe('supabase');
    expect(selectAuthBackend('firebase')).toBe('firebase');
  });
});
describe('bearerHeaders', () => {
  it('attaches the token, or nothing when absent or failing', async () => {
    expect(await bearerHeaders({ getToken: async () => 't' })).toEqual({ Authorization: 'Bearer t' });
    expect(await bearerHeaders({ getToken: async () => null })).toEqual({});
    expect(await bearerHeaders({ getToken: async () => { throw new Error('x'); } })).toEqual({});
  });
});
describe('firebase rest auth', () => {
  it('signs in against the emulator and returns the cached token', async () => {
    const f = vi.fn(async () => json(200, signIn));
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: f as never, emulatorHost: '127.0.0.1:9099', now: () => 0 });
    const s = await a.signInWithPassword('a@b.c', 'pw');
    expect(s).toEqual({ uid: 'u1', idToken: 'id1', expiresAt: 3_600_000 });
    expect(String((f.mock.calls as unknown[][])[0]?.[0])).toBe('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=k');
    expect(await a.getToken()).toBe('id1');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('uses production hosts without an emulator', async () => {
    const f = vi.fn(async () => json(200, signIn));
    await createFirebaseRestAuth({ apiKey: 'k', fetch: f as never }).signInWithPassword('a', 'b');
    expect(String((f.mock.calls as unknown[][])[0]?.[0])).toMatch(/^https:\/\/identitytoolkit\.googleapis\.com\//);
  });
  it('maps credential errors to a code without leaking the message tail', async () => {
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: (async () => json(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS : detail' } })) as never });
    await expect(a.signInWithPassword('a', 'b')).rejects.toMatchObject({ code: 'INVALID_LOGIN_CREDENTIALS' });
    const n = createFirebaseRestAuth({ apiKey: 'k', fetch: (async () => { throw new Error('offline'); }) as never });
    await expect(n.signInWithPassword('a', 'b')).rejects.toBeInstanceOf(FirebaseAuthError);
  });
  it('refreshes near expiry, once for concurrent callers, and keeps the rotated refresh token', async () => {
    let t = 0; const storage = memoryStorage();
    const f = vi.fn(async (url: unknown) => String(url).includes('securetoken')
      ? json(200, { user_id: 'u1', id_token: 'id2', refresh_token: 'r2', expires_in: '3600' })
      : json(200, signIn));
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: f as never, storage, now: () => t });
    await a.signInWithPassword('a', 'b');
    t = 3_600_000 - 30_000;
    const [x, y] = await Promise.all([a.getToken(), a.getToken()]);
    expect([x, y]).toEqual(['id2', 'id2']);
    expect(f).toHaveBeenCalledTimes(2);
    expect(storage.get()).toBe('r2');
    expect(String(((f.mock.calls as unknown[][])[1]?.[1] as RequestInit).body)).toBe('grant_type=refresh_token&refresh_token=r1');
  });
  it('drops the session when the refresh token is rejected but keeps it on network errors', async () => {
    let t = 0; const storage = memoryStorage(); let mode: 'ok' | 'net' | 'bad' = 'ok';
    const f = async (url: unknown) => {
      if (!String(url).includes('securetoken')) return json(200, signIn);
      if (mode === 'net') throw new Error('offline');
      return json(400, { error: { message: 'TOKEN_EXPIRED' } });
    };
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: f as never, storage, now: () => t });
    const seen: unknown[] = []; a.subscribe(s => seen.push(s));
    await a.signInWithPassword('a', 'b'); t = 4_000_000;
    mode = 'net'; expect(await a.getToken()).toBeNull(); expect(storage.get()).toBe('r1');
    mode = 'bad'; expect(await a.getToken()).toBeNull(); expect(storage.get()).toBeNull();
    expect(a.current()).toBeNull(); expect(seen.at(-1)).toBeNull();
  });
  it('signOut clears the stored token and notifies', async () => {
    const storage = memoryStorage();
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: (async () => json(200, signIn)) as never, storage });
    const fn = vi.fn(); const off = a.subscribe(fn);
    await a.signInWithPassword('a', 'b'); a.signOut();
    expect(storage.get()).toBeNull(); expect(await a.getToken()).toBeNull(); expect(fn).toHaveBeenLastCalledWith(null);
    off();
  });
  it('does not restore a session after sign-out while a refresh is in flight', async () => {
    let t = 0; const storage = memoryStorage();
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { complete = resolve; });
    const f = vi.fn(async (url: unknown) => String(url).includes('securetoken')
      ? pending : json(200, signIn));
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: f as never, storage, now: () => t });
    await a.signInWithPassword('a', 'b');
    t = 4_000_000;
    const oldRefresh = a.getToken();
    a.signOut();
    complete(json(200, { user_id: 'u1', id_token: 'stale', refresh_token: 'stale-refresh', expires_in: '3600' }));
    expect(await oldRefresh).toBeNull();
    expect(a.current()).toBeNull();
    expect(storage.get()).toBeNull();
    expect(await a.getToken()).toBeNull();
  });
  it('does not let an old failed refresh revoke a newer login', async () => {
    let t = 0; const storage = memoryStorage();
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { complete = resolve; });
    let logins = 0;
    const f = vi.fn(async (url: unknown) => {
      if (String(url).includes('securetoken')) return pending;
      logins += 1;
      return json(200, logins === 1 ? signIn :
        { localId: 'u2', idToken: 'new-id', refreshToken: 'new-refresh', expiresIn: '3600' });
    });
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: f as never, storage, now: () => t });
    await a.signInWithPassword('a', 'b');
    t = 4_000_000;
    const oldRefresh = a.getToken();
    await a.signInWithPassword('new', 'password');
    complete(json(400, { error: { message: 'TOKEN_EXPIRED' } }));
    expect(await oldRefresh).toBeNull();
    expect(a.current()?.uid).toBe('u2');
    expect(storage.get()).toBe('new-refresh');
    expect(await a.getToken()).toBe('new-id');
  });
  it('ignores a login response arriving after the user has signed out', async () => {
    const storage = memoryStorage();
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { complete = resolve; });
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: (async () => pending) as never, storage });
    const oldLogin = a.signInWithPassword('a', 'b');
    a.signOut();
    complete(json(200, signIn));
    await expect(oldLogin).rejects.toMatchObject({ code: 'STALE_SESSION' });
    expect(storage.get()).toBeNull();
    expect(a.current()).toBeNull();
  });
  it('rejects malformed responses', async () => {
    const a = createFirebaseRestAuth({ apiKey: 'k', fetch: (async () => json(200, { localId: 'u' })) as never });
    await expect(a.signInWithPassword('a', 'b')).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
  it('restores a still-valid tab session without another network request', async () => {
    const refreshTokens=memoryStorage(), ids=memoryStorage(),f=vi.fn(async () => json(200,signIn));
    const opts={apiKey:'k',fetch:f as never,storage:refreshTokens,idTokenStorage:ids,now:()=>1000};
    const first=createFirebaseRestAuth(opts);
    await first.signInWithPassword('a@b.c','pw');
    const restored=createFirebaseRestAuth(opts);
    expect(restored.current()?.uid).toBe('u1');
    expect(await restored.getToken()).toBe('id1');
    expect(f).toHaveBeenCalledTimes(1);
    restored.signOut();
    expect(ids.get()).toBeNull();
    expect(refreshTokens.get()).toBeNull();
  });
  it('ignores expired and malformed cached tokens and refreshes from Firebase', async () => {
    const storage=memoryStorage(), ids=memoryStorage();
    storage.set('refresh');
    ids.set(JSON.stringify({uid:'old',idToken:'stale',expiresAt:100}));
    const f=vi.fn(async()=>json(200,{
      user_id:'fresh',id_token:'fresh-id',refresh_token:'fresh-refresh',expires_in:'3600',
    }));
    const a=createFirebaseRestAuth({apiKey:'k',storage,idTokenStorage:ids,
      now:()=>500,fetch:f as never});
    expect(a.current()).toBeNull();
    expect(await a.getToken()).toBe('fresh-id');
    expect(a.current()?.uid).toBe('fresh');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('exchanges a Google identity credential with Firebase without trusting the Google token for Atlas APIs', async () => {
    const f=vi.fn(async()=>json(200,signIn));
    const a=createFirebaseRestAuth({apiKey:'k',fetch:f as never});
    const googleId='header.payload.signature';
    expect(await a.signInWithGoogleIdToken(googleId,'https://atlas.cormyr.com.br/auth'))
     .toEqual({uid:'u1',idToken:'id1',expiresAt:expect.any(Number)});
    expect(String(f.mock.calls[0]?.[0])).toContain('accounts:signInWithIdp?key=k');
    const body=JSON.parse(String((f.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      postBody:'id_token=header.payload.signature&providerId=google.com',
      requestUri:'https://atlas.cormyr.com.br/auth',returnSecureToken:true,
    });
    expect(await a.getToken()).toBe('id1');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('does not accept an unlinked Google account or a forged credential', async () => {
    const f=vi.fn(async()=>json(200,{needConfirmation:true}));
    const a=createFirebaseRestAuth({apiKey:'k',fetch:f as never});
    await expect(a.signInWithGoogleIdToken('header.payload.signature',
      'https://atlas.cormyr.com.br/auth')).rejects.toMatchObject({code:'ACCOUNT_LINK_REQUIRED'});
    expect(a.current()).toBeNull();
    await expect(a.signInWithGoogleIdToken('forged',
      'https://atlas.cormyr.com.br/auth')).rejects.toMatchObject({code:'INVALID_GOOGLE_CREDENTIAL'});
    expect(f).toHaveBeenCalledTimes(1);
  });

});
