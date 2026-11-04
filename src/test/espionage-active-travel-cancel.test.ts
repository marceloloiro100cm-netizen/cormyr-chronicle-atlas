import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {cormyrPreviewLinks,CORMYR_CARTOGRAPHIC_BORDERS,
 CORMYR_NARRATOR_APPROVED_SEA_LINKS} from '@/lib/espionage/cormyr-map';
import {planSpyRegionalMission} from '@/lib/espionage/region-turns';
import {projectSpyHarptosSchedule} from '@/lib/espionage/round-calendar';
import {spyManagementSchema} from '@/lib/espionage/spy-management.functions';
const read=(f:string)=>readFileSync(f,'utf8');

describe('Espionagem operacional · deslocar, contar, cancelar',()=>{
 it('usa a malha confirmada de 19 fronteiras e 3 passagens, sem abreviar caminhos',()=>{
  const sql=read('docs/espionage/sql/0102_spy_mission_active_travel_and_cancellation.sql');
  expect(CORMYR_CARTOGRAPHIC_BORDERS.length).toBe(19);
  expect(CORMYR_NARRATOR_APPROVED_SEA_LINKS.length).toBe(3);
  for(const [a,b] of CORMYR_CARTOGRAPHIC_BORDERS)
   expect(sql).toContain("('"+a+"','"+b+"','land_neighbor')");
  for(const edge of CORMYR_NARRATOR_APPROVED_SEA_LINKS)
   expect(sql).toContain("('"+edge.fromRegion+"','"+edge.toRegion+"','sea_passage')");
  expect(sql).toContain('public.spy_cormyr_mission_route(v_origin,v_destination)');
  expect(sql).toContain('v_rounds:=(v_path->>\'rounds\')::integer');
 });
 it('da Dragon Coast até Elfhold são 2 désdias de viagem; conclusão após mais 1',()=>{
  const agent={id:'eecf43ec-f405-4f17-a086-70443c8e551b',
   codename:'Teste',status:'available' as const,currentRegion:'dragoncoast'};
  const plan=planSpyRegionalMission({
   agent,destinationRegion:'elfhold',
   links:cormyrPreviewLinks([]),seaAllowed:true,
  });
  expect(plan.status).toBe('ready');
  if(plan.status!=='ready')return;
  expect(plan.travelRounds).toBe(2);
  expect(plan.totalRounds).toBe(3);
  const schedule=projectSpyHarptosSchedule({
   plan,officialDate:'1522-10-11',calendarVersion:2,
  });
  expect(schedule.arrivesAtTargetDateKey).toBe('1522-11-01');
  expect(schedule.investigationEndsDateKey).toBe('1522-11-11');
 });
 it('distingue viagem, investigação e resultado no Hub sem rodar resolução automática',()=>{
  const sql=read('docs/espionage/sql/0102_spy_mission_active_travel_and_cancellation.sql');
  for(const term of [
   'spy_mission_hub_advance','public.spy_campaign_ordinal(v_now)',
   "v_stage:='operating'", "v_stage:='pending_narrator_review'",
   "v_agent_stage:='pending_review'",
   "v_start_status:=CASE WHEN v_rounds=0 THEN 'operating' ELSE 'traveling' END",
   'public.spy_add_desdias(v_arrive,1)',
  ])expect(sql).toContain(term);
  expect(sql).not.toContain('INSERT INTO public.spy_mission_decisions');
  expect(sql).not.toContain("UPDATE public.campaign_calendar SET");
  expect(sql).toContain('IF public.spy_campaign_ordinal(v_now)<=public.spy_campaign_ordinal(v_old)');
  expect(sql).toContain('GET DIAGNOSTICS v_changed=ROW_COUNT');
 });
 it('mantém operação e prazos históricos depois do cancelamento',()=>{
  const sql=read('docs/espionage/sql/0102_spy_mission_active_travel_and_cancellation.sql');
  expect(sql).toContain('CREATE OR REPLACE FUNCTION public.spy_cancel_house_mission(');
  expect(sql).toContain("v_op.status NOT IN('planned','traveling','operating','pending_narrator_review')");
  expect(sql).toContain("SET status='cancelled',version=version+1");
  expect(sql).toContain("UPDATE public.spy_assets SET status='available',version=version+1");
  expect(sql).toContain("'mission_cancelled'");
  expect(sql).not.toContain('DELETE FROM public.spy_operations');
  expect(sql).not.toContain('DELETE FROM public.spy_mission_timeline');
  expect(sql).toContain("v_agent.status NOT IN('assigned','traveling','operating','pending_review')");
 });
 it('inclui opção Cancelar missão na ficha, confirmação e atualização das consultas',()=>{
  const card=read('src/components/house/espionage/spy-house-management.tsx');
  const btn=read('src/components/house/espionage/spy-cancel-mission-button.tsx');
  const client=read('src/lib/espionage/spy-browser-client.ts');
  expect(card).toContain('<SpyCancelMissionButton');
  expect(card).toContain('Em viagem · ');
  expect(card).toContain('dias ordinários restantes');
  expect(card).toContain('Chegada prevista');
  expect(btn).toContain('Cancelar missão');
  expect(btn).toContain('Confirmar cancelamento');
  expect(btn).toContain('onClick={()=>void cancel()}');
  expect(btn).toContain('cancelSpyMissionBrowser');
  expect(btn).toContain("qc.setQueryData<SpyManagement>(['spy-house-management',houseId]");
  expect(btn).toContain("status:'available' as const");
  expect(btn).toContain("status:'cancelled' as const");
  expect(btn).not.toContain('spy-agent-cancelled');
  expect(btn).not.toContain('Missão cancelada</span>');
  expect(client).toContain("houseRpc('spy_cancel_house_mission',input.houseId");
  expect(client).toContain("houseRpc('spy_house_mission_timeline',houseId)");
  expect(client).not.toContain('service_role');
 });
 it('aceita novos prazos e estados da RPC sem vazar ficha de outra Casa',()=>{
  const row={
   id:'11111111-1111-4111-8111-111111111111',
   assetId:'22222222-2222-4222-8222-222222222222',
   targetId:'dagohnlar',targetType:'house',missionKind:'house_recon',
   status:'traveling',createdAt:'2026-11-04T16:41:00+00:00',
   travelDays:20,arrivalKey:'1522-11-01',
   departureKey:'1522-10-11',investigationEndKey:'1522-11-11',
   originRegion:'dragoncoast',destinationRegion:'elfhold',
   targetHouseName:'Dagohnlar',version:2,
  };
  expect(spyManagementSchema.safeParse({
   houseId:'ashkar',agents:[],operations:[row],history:[],
   recruitment:[],portraits:[],houseVersion:1,
  }).success).toBe(true);
 });
});
