import { describe, it, expect, vi } from 'vitest';
import { resolveBearerHeaders } from './bearer-attacher';

const src = (s: string | null, f: string | null) => ({
  supabase: { getToken: vi.fn(async () => s) },
  firebase: { getToken: vi.fn(async () => f) },
});
describe('resolveBearerHeaders', () => {
  it('uses Supabase by default and never asks Firebase', async () => {
    const s = src('sb', 'fb');
    expect(await resolveBearerHeaders(undefined, s)).toEqual({ Authorization: 'Bearer sb' });
    expect(s.firebase.getToken).not.toHaveBeenCalled();
  });
  it('uses Firebase only for the exact flag value', async () => {
    const s = src('sb', 'fb');
    expect(await resolveBearerHeaders('firebase', s)).toEqual({ Authorization: 'Bearer fb' });
    expect(s.supabase.getToken).not.toHaveBeenCalled();
    expect(await resolveBearerHeaders('Firebase', src('sb', 'fb'))).toEqual({ Authorization: 'Bearer sb' });
  });
  it('does not fall back to the other backend when the selected one has no token', async () => {
    expect(await resolveBearerHeaders('firebase', src('sb', null))).toEqual({});
    expect(await resolveBearerHeaders(undefined, src(null, 'fb'))).toEqual({});
  });
});
