import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');

describe('Espionagem · Iniciar missão registra ordem real, não simulação',()=>{
 it('mostra ação de execução somente após escolher espião, destino e Casa',()=>{
  const panel=read('src/components/house/espionage/spy-regional-turns-panel.tsx');
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(panel).toContain('{allSelected&&selected&&selectedTargetHouse');
  expect(panel).toContain('{ready&&agentAvailable&&originRegion&&');
  expect(panel).toContain('<SpySubmitHouseMission');
  const previewEnd=panel.indexOf('<SpyMissionOddsCard');
  const mapEnd=panel.indexOf('<CormyrInteractiveMap');
  const button=panel.indexOf('<SpySubmitHouseMission');
  const dates=panel.indexOf('Datas previstas pelo Hub Temporal');
  expect(previewEnd).toBeGreaterThan(0);
  expect(mapEnd).toBeGreaterThan(previewEnd);
  expect(button).toBeGreaterThan(mapEnd);
  expect(dates).toBeGreaterThan(button);
  expect(panel).toContain('className="spy-planner-start-row"');
  const css=read('src/components/house/espionage/spy-mission-planner.css');
  expect(css).toContain('.spy-planner-start-row .spy-planner-execution-button');
  expect(css).toContain('width:100%');

  expect(btn).toContain('Iniciar missão');
  expect(btn).toContain('Confirmar início');
  expect(btn).toContain('onClick={()=>void send()}');
  expect(btn).toContain("regionId(agent.currentRegion??'')!==originRegion");
  expect(btn).toContain('readSpyHouseManagementBrowser(houseId)');
  expect(panel).toContain('setSubmitted');
 });
 it('usa o backend autenticado com idempotência e versão do agente e calendário',()=>{
  const frontend=read('src/lib/espionage/spy-browser-client.ts');
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(frontend).toContain("houseRpc('spy_submit_house_mission',input.houseId");
  expect(frontend).toContain("p_expected_agent_version:input.expectedAgentVersion");
  expect(frontend).toContain("p_expected_calendar_version:input.expectedCalendarVersion");
  expect(frontend).toContain("p_request_key:input.requestKey");
  expect(btn).toContain("requestKey.current??crypto.randomUUID()");
  expect(btn).toContain("agentVersion.current===null");
  expect(btn).not.toContain("onClick={()=>{requestKey.current=null");
 });
 it('trava dupla missão e valida casa-alvo, região, localização e autorização no SQL',()=>{
  const sql=read('docs/espionage/sql/0102_spy_mission_active_travel_and_cancellation.sql');
  for(const text of [
   'BEGIN;','COMMIT;','public.campaign_access_active()',
   'public.in_campaign_house(p_house,true)',
   "pg_advisory_xact_lock(hashtextextended('spy-agent:'",
   "o.operation_key=p_request_key",
   "v_agent.status<>'available'",
   "v_agent.version<>p_expected_agent_version",
   "v_agent.location_approved IS DISTINCT FROM true",
   "o.status NOT IN('completed','cancelled')",
   "c.public_reviewed=true",
   "v_destination<>public.spy_cormyr_normalize_region(p_destination)",
   "v_calendar.version<>p_expected_calendar_version",
   "mission_kind,requested_fields,status,source_calendar_version",
   "v_start_status:=CASE WHEN v_rounds=0 THEN 'operating' ELSE 'traveling' END",
   "UPDATE public.spy_assets SET status=v_start_status,version=version+1",
   "'mission_started'",
   "REVOKE ALL ON FUNCTION public.spy_submit_house_mission(",
   'TO authenticated;',
  ])expect(sql).toContain(text);
 });
 it('inicia viagem imediatamente, registra prazos e mantém o resultado sob julgamento',()=>{
  const sql=read('docs/espionage/sql/0102_spy_mission_active_travel_and_cancellation.sql');
  expect(sql).toContain('public.spy_add_desdias(v_depart,v_rounds)');
  expect(sql).toContain('public.spy_add_desdias(v_arrive,1)');
  expect(sql).toContain('INSERT INTO public.spy_mission_timeline(');
  expect(sql).toContain('CREATE TRIGGER spy_mission_hub_advance');
  expect(sql).toContain("'pending_narrator_review'");
  expect(sql).not.toContain('INSERT INTO public.spy_mission_decisions');
  expect(sql).not.toContain('spy_resolve_agent_mission(');
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(btn).toContain('Missão iniciada. O espião está em viagem');
  expect(btn).toContain('A missão começa após confirmar.');
  expect(btn).not.toContain('homologação da rota pelo Narrador');
 });
 it('após confirmação registra comprovante e recarrega elenco e rota',()=>{
  const panel=read('src/components/house/espionage/spy-regional-turns-panel.tsx');
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(panel).toContain('Missão iniciada:');
  expect(panel).toContain("setAssetId('');setDestination('');setTargetHouseId('')");
  expect(btn).toContain("['spy-house-management',houseId]");
  expect(btn).toContain("['espionage-regional-strategy',houseId]");
  expect(btn).toContain('onSubmitted?.(result.operationId)');
 });
});
