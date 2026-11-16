import { describe, it, expect, vi } from 'vitest';
import {readFileSync} from 'node:fs';
import { loadSeasonHouses, loadFirebasePublicSeasonHouses, loginErrorMessage, shouldLeaveAuthPage } from './season-houses';
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

describe('seletor de Casas · API pública Firebase',()=>{
  it('o portal não consulta diretamente o catálogo/RPC Supabase para escolha visual',()=>{
    const source=readFileSync('src/routes/auth.tsx','utf8');
    expect(source).toContain('loadFirebasePublicSeasonHouses()');
    expect(source).not.toContain("supabase.from('campaign_houses')");
    expect(source).not.toContain("supabase.rpc('public_player_houses')");
  });

  const success=()=>Response.json({houses:[...eight,{id:'npc',name:'Casa NPC'}],playerHouses:players});

  it('consulta apenas o catálogo público com GET sem cookies ou Authorization',async()=>{
    const fetcher=vi.fn(async()=>success()) as unknown as typeof fetch;
    const result=await loadFirebasePublicSeasonHouses(fetcher);
    expect(result.houses).toEqual(eight);
    expect(result.errors).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path,options]=vi.mocked(fetcher).mock.calls[0]!;
    expect(path).toBe('/api/public/catalog');
    expect(options).toMatchObject({
      method:'GET',credentials:'omit',cache:'no-store',
      redirect:'error',headers:{Accept:'application/json'},
    });
    expect(JSON.stringify(options)).not.toMatch(/Authorization|Bearer|token|supabase/i);
  });

  it('recusa publicação desativada (503) sem tentar RPC ou mostrar detalhes internos',async()=>{
    const fetcher=vi.fn(async()=>Response.json({
      error:'private_firestore_document',
    },{status:503})) as unknown as typeof fetch;
    const result=await loadFirebasePublicSeasonHouses(fetcher);
    expect(result.houses).toEqual([]);
    expect(result.errors).toEqual(['Lista pública de Casas indisponível no momento.']);
    expect(JSON.stringify(result)).not.toContain('private_firestore_document');
  });

  it('rejeita HTML, conteúdo inválido e respostas maiores que o orçamento',async()=>{
    for(const response of [
      new Response('<html>login</html>',{
        status:200,headers:{'Content-Type':'text/html'},
      }),
      Response.json({houses:[...eight]}, {status:200}),
      Response.json({houses:'invalid',playerHouses:players}),
      new Response(JSON.stringify({houses:eight,playerHouses:players}),{
        headers:{'Content-Type':'application/json','Content-Length':'999999'},
      }),
    ]){
      const fetcher=vi.fn(async()=>response) as unknown as typeof fetch;
      const result=await loadFirebasePublicSeasonHouses(fetcher);
      expect(result.houses).toEqual([]);
      expect(result.errors).toHaveLength(1);
    }
  });

  it('recusa redirecionamento/rede indisponível e depois pode repetir',async()=>{
    const fetcher=vi.fn()
      .mockRejectedValueOnce(new Error('AUTH_PRIVATE_KEY_SECRET'))
      .mockResolvedValueOnce(success()) as unknown as typeof fetch;
    const failed=await loadFirebasePublicSeasonHouses(fetcher);
    expect(failed.errors).toHaveLength(1);
    expect(JSON.stringify(failed)).not.toContain('AUTH_PRIVATE_KEY_SECRET');
    const retried=await loadFirebasePublicSeasonHouses(fetcher);
    expect(retried.houses).toHaveLength(8);
    expect(retried.errors).toEqual([]);
  });

  it('não promove a Casa Espião nem Casas fora da lista pública de jogadores',async()=>{
    const payload={houses:[...eight,{id:'espiao',name:'Espião'}],
      playerHouses:[...players,{house_id:'espiao'},{house_id:'unlisted'}]};
    const fetcher=vi.fn(async()=>Response.json(payload)) as unknown as typeof fetch;
    const result=await loadFirebasePublicSeasonHouses(fetcher);
    expect(result.houses).toEqual(eight);
    expect(result.houses.map(h=>h.id)).not.toContain('espiao');
  });
});
