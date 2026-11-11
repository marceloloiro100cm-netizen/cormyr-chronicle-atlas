import { describe, it, expect, vi } from 'vitest';
import { loadSeasonHouses, loginErrorMessage, shouldLeaveAuthPage } from './season-houses';
const ok = (data: unknown) => () => Promise.resolve({ data, error: null });
const fail = (message: string) => () => Promise.resolve({ data: null, error: { message } });
const eight = Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, name: `Casa ${i}` }));
const players = eight.map(h => ({ house_id: h.id }));

describe('loadSeasonHouses', () => {
  it('returns the eight player houses', async () => {
    const r = await loadSeasonHouses({ catalog: ok([...eight, { id: 'x', name: 'NPC' }]), playerHouses: ok(players) });
    expect(r.houses).toHaveLength(8); expect(r.errors).toEqual([]);
  });
  it('never promotes the Espião identity into the season-two login roster', async () => {
    const catalog = [...eight, { id:'espiao', name:'Espião' }];
    const active = [...players, { house_id:'espiao' }];
    const r = await loadSeasonHouses({catalog:ok(catalog),playerHouses:ok(active)});
    expect(r.houses).toHaveLength(8);
    expect(r.houses.some(h=>h.id==='espiao')).toBe(false);
  });
  it('reports catalog failure independently', async () => {
    const r = await loadSeasonHouses({ catalog: fail('permission denied'), playerHouses: ok(players) });
    expect(r.houses).toEqual([]); expect(r.errors).toHaveLength(1); expect(r.errors[0]).toMatch(/^Lista de casas/);
  });
  it('reports RPC failure independently', async () => {
    const r = await loadSeasonHouses({ catalog: ok(eight), playerHouses: fail('Failed to fetch') });
    expect(r.errors).toEqual(['Casas de jogadores: Servidor da campanha indisponível no momento.']);
  });
  it('reports both failures and thrown rejections', async () => {
    const r = await loadSeasonHouses({ catalog: () => Promise.reject(new Error('Failed to fetch')), playerHouses: fail('503') });
    expect(r.errors).toHaveLength(2);
  });
  it('rejects malformed payloads and dedups', async () => {
    expect((await loadSeasonHouses({ catalog: ok(null), playerHouses: ok(players) })).errors).toHaveLength(1);
    const r = await loadSeasonHouses({ catalog: ok([eight[0], eight[0], { id: 1 }, { id: 'h2', name: '' }]), playerHouses: ok([...players, null]) });
    expect(r.houses).toEqual([eight[0]]);
  });
  it('empty state is not an error', async () => {
    const r = await loadSeasonHouses({ catalog: ok([]), playerHouses: ok([]) });
    expect(r).toEqual({ houses: [], errors: [] });
  });
  it('retry after failure succeeds', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } }).mockResolvedValue({ data: players, error: null });
    expect((await loadSeasonHouses({ catalog: ok(eight), playerHouses: rpc })).errors).toHaveLength(1);
    expect((await loadSeasonHouses({ catalog: ok(eight), playerHouses: rpc })).houses).toHaveLength(8);
  });
});
describe('login helpers', () => {
  it('maps sign-in errors', () => {
    expect(loginErrorMessage({ message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.');
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toMatch(/indisponível/);
  });
  it('leaves /auth only with a signed-in user (narrator or player)', () => {
    expect(shouldLeaveAuthPage('SIGNED_IN', true)).toBe(true);
    expect(shouldLeaveAuthPage('SIGNED_IN', false)).toBe(false);
    expect(shouldLeaveAuthPage('TOKEN_REFRESHED', true)).toBe(false);
    expect(shouldLeaveAuthPage('INITIAL_SESSION', false)).toBe(false);
  });
});
