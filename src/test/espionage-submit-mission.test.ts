import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');

describe('Espionagem · Executar missão registra ordem real, não simulação',()=>{
 it('mostra ação de execução somente após escolher espião, destino e Casa',()=>{
  const panel=read('src/components/house/espionage/spy-regional-turns-panel.tsx');
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(panel).toContain('{allSelected&&selected&&selectedTargetHouse');
  expect(panel).toContain('{ready&&agentAvailable&&originRegion&&');
  expect(panel).toContain('<SpySubmitHouseMission');
  expect(btn).toContain('Executar missão');
  expect(btn).toContain('Confirmar execução');
  expect(btn).toContain('onClick={()=>void send()}');
  expect(btn).toContain("regionId(agent.currentRegion??'')!==originRegion");
  expect(btn).toContain('readSpyHouseManagementBrowser(houseId)');
  expect(btn).toContain('setSubmitted');
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
  const sql=read('docs/espionage/sql/0101_spy_submit_house_mission.sql');
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
   "v_destination<>lower(regexp_replace(p_destination",
   "v_calendar.version<>p_expected_calendar_version",
   "mission_kind,requested_fields,status,source_calendar_version",
   "ARRAY['house_overview']::text[],'planned'",
   "status='assigned',version=version+1",
   "'house_mission_submitted'",
   "REVOKE ALL ON FUNCTION public.spy_submit_house_mission(",
   'TO authenticated;',
  ])expect(sql).toContain(text);
 });
 it('não cria chegada fictícia nem resoluções automáticas de missão',()=>{
  const sql=read('docs/espionage/sql/0101_spy_submit_house_mission.sql');
  expect(sql).not.toContain('INSERT INTO public.spy_operation_segments');
  expect(sql).not.toContain('INSERT INTO public.spy_temporal_deliveries');
  expect(sql).not.toContain('INSERT INTO public.spy_mission_decisions');
  expect(sql).not.toContain('spy_resolve_agent_mission(');
  expect(sql).not.toContain("status='traveling'");
  expect(sql).not.toContain("status='completed'");
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(btn).toContain('O envio não move');
  expect(btn).toContain('rota pelo Narrador');
 });
 it('após confirmação registra comprovante e recarrega elenco e rota',()=>{
  const panel=read('src/components/house/espionage/spy-regional-turns-panel.tsx');
  const btn=read('src/components/house/espionage/spy-submit-house-mission.tsx');
  expect(panel).toContain('Missão registrada:');
  expect(panel).toContain("setAssetId('');setDestination('');setTargetHouseId('')");
  expect(btn).toContain("['spy-house-management',houseId]");
  expect(btn).toContain("['espionage-regional-strategy',houseId]");
  expect(btn).toContain('onSubmitted?.(result.operationId)');
 });
});
