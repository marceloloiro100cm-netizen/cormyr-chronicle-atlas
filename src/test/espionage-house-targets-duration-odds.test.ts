import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {regionId} from '@/lib/house/regions';
import {spyDiceSuccessPercent} from '@/lib/espionage/spy-mission-probability';
import {spyHouseTargetStage} from '@/lib/espionage/spy-target-stages';

const file=(name:string)=>readFileSync(resolve(name),'utf8');
describe('Espionagem · catálogo oficial de casas, prazo e chance',()=>{
 it('usa a lista pública de 172 Casas revisadas em vez de apenas 8 fichas operacionais',()=>{
  const client=file('src/lib/espionage/spy-target-browser.ts');
  const panel=file('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(client).toContain("rpc('spy_public_noble_targets')");
  expect(client).toContain('supabase.auth.getSession()');
  expect(client).toContain('spyHouseTargetSchema');
  expect(client).not.toContain(".from('noble_house_sheets')");
  expect(panel).toContain('queryFn:readSpyNobleHouseTargetsBrowser');
  expect(panel).not.toContain('useServerFn(listSpyHouseTargets)');
  expect(panel).toContain('houseChoices.map(h=><option');
  const sql=file('docs/espionage/sql/0087_import_cormyr_noble_stats_2026_11_03.sql');
  expect(sql).toContain('public.spy_public_noble_targets()');
  expect(sql).toContain('c.public_reviewed IS TRUE');
  expect(sql).not.toContain('campaign_houses c\n WHERE');
 });
 it('reconhece nomes das 11 regiões conforme a lista das Casas',()=>{
  expect(regionId('Crownlands')).toBe('crownlands');
  expect(regionId('Dragon Coast')).toBe('dragoncoast');
  expect(regionId('Swordmarch')).toBe('swordmark');
  expect(regionId('Volkumburgh')).toBe('volkumburgh');
 });
 it('mostra os dois indicadores na prévia de cada Casa, sem estimativa fictícia',()=>{
  const card=file('src/components/house/espionage/spy-mission-odds-card.tsx');
  expect(card).toContain('Tempo para executar a missão');
  expect(card).toContain('Chance estimada de sucesso');
  expect(card).toContain('props.travelRounds+1');
  expect(card).toContain('missionRounds*10');
  expect(card).toContain('readSpyMissionOddsBrowser');
  expect(card).toContain('query.isPending');
  expect(card).not.toContain("useServerFn(previewSpyMissionOdds)");
  expect(spyDiceSuccessPercent(3,12)).toBe(37.5);
 });
 it('permite escolha de alvo antes da viagem sem autorizar execução fora da região',()=>{
  const panel=file('src/components/house/espionage/spy-regional-turns-panel.tsx');
  expect(panel).toContain('disabled={!destination||targetsQuery.isPending||targetsQuery.isError}');
  const agent={id:'123',codename:'Corvo',status:'available' as const,currentRegion:'dragoncoast'};
  expect(spyHouseTargetStage({
   agent,selectedRegion:'crownlands',targetHouseId:'calantar',
   houseTargets:[{id:'calantar',name:'Calantar',regionId:'crownlands'}],
   simulation:false,
  })).toBe('requires_region_arrival');
 });
 it('limita o cálculo percentual à RPC protegida, jamais expondo Lei ou fichas de todas as Casas',()=>{
  const client=file('src/lib/espionage/spy-target-browser.ts');
  expect(client).toContain("rpc('spy_player_mission_preview'");
  expect(client).toContain("db.from('spy_agent_upgrades')");
  expect(client).toContain('spyMissionOdds(data.houseDefense,data.agentCunning)');
  expect(client).not.toContain('service_role');
  expect(client).not.toContain(".select('*')");
  const sql=file('docs/espionage/sql/0088_spy_player_mission_preview_2026_11_03.sql');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
 });
});
