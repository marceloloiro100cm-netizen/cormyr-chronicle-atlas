import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const read=(path:string)=>readFileSync(resolve(path),'utf8');

describe('P0/P1 — partidas compartilhadas com segurança e sem efeitos oficiais',()=>{
 it('multiplayer inicia desligado e exige liberação explícita',()=>{
  const flag=read('src/lib/battle/feature-flag.ts');
  expect(flag).toContain("VITE_ENABLE_BATTLE_V3_LIVE']==='true'");
  const player=read('src/components/battle/BattleV3PlayerEntry.tsx');
  const gm=read('src/components/battle/BattleNarratorHub.tsx');
  expect(player).toContain('BATTLE_V3_LIVE_ENABLED&&liveMatches.length>0');
  expect(gm).toContain('BATTLE_V3_LIVE_ENABLED&&<Button');
 });
 it('tabela V3 tem RLS, leitura de casas participantes e escrita só service_role',()=>{
  const sql=read('docs/battle/sql/0078_battle_v3_live_matches.sql');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  expect(sql).toContain('public.in_campaign_house(attacker_house_id,false)');
  expect(sql).toContain('public.in_campaign_house(defender_house_id,false)');
  expect(sql).toContain('REVOKE ALL ON TABLE public.battle_v3_live_matches FROM PUBLIC,anon,authenticated');
  expect(sql).toContain('GRANT SELECT ON public.battle_v3_live_matches TO authenticated');
  expect(sql).toContain('GRANT SELECT,INSERT,UPDATE ON public.battle_v3_live_matches TO service_role');
 });
 it('funções protegem JWT, vínculo da casa, concorrência e replay; sem operações oficiais',()=>{
  const src=read('src/lib/battle/v3/live.functions.ts');
  expect(src).toContain('requireSupabaseAuth');
  expect(src).toContain('campaign_access_active');
  expect(src).toContain("'in_campaign_house'");
  expect(src).toContain('edit_required:true');
  expect(src).toContain('requireNarrator');
  expect(src).toContain('verifyV3Replay');
  expect(src).toContain('captureV3Replay');
  expect(src).toContain(".eq('state_version',data.expectedVersion)");
  expect(src).toContain(".eq('state_hash',row.state_hash)");
  expect(src).toContain('Autorização revogada durante o turno');
  expect(src).not.toMatch(/houseOperation\(|changeUnitState\(|resolveSurvivors\(|noble_house_sheets/);
 });
 it('diagnóstico P0 exige sessão autenticada real e apenas leitura',()=>{
  const p=read('src/components/battle/BattleAccessCheck.tsx');
  for(const operation of ['checkBattlePersistence','listSavedBattles','listBattleSourceHouses','listV3Invitations'])
   expect(p).toContain(operation);
  expect(p).not.toMatch(/insert\(|update\(|delete\(|resetPassword|password|email.*=/);
  expect(p).toContain('role="player"').toBe(false);
 });
});
