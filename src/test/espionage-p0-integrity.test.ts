import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dateKey} from '@/lib/calendar/harptos';
import {advanceHarptosDesdia} from '@/lib/calendar/temporal-engine';
import {projectSpyHarptosSchedule} from '@/lib/espionage/round-calendar';
import {planSpyRegionalMission} from '@/lib/espionage/region-turns';
import {cormyrPreviewLinks} from '@/lib/espionage/cormyr-map';

const read=(path:string)=>readFileSync(path,'utf8');
const migration=()=>read('docs/espionage/sql/0110_spy_p0_intelligence_observation_and_status.sql');
const agent={id:'11111111-1111-4111-8111-111111111111',
 codename:'Teste isolado',status:'available' as const,currentRegion:'dragoncoast'};

describe('Espionagem P0 · integridade e segurança',()=>{
 it('não atribui a um valor novo a data passada da missão',()=>{
  const sql=migration();
  expect(sql).toContain('v_observed_date:=public.spy_official_date_key()');
  expect(sql).toContain('public.spy_campaign_ordinal(v_award.campaign_date_key)');
  expect(sql).toContain('verified_date_key=v_observed_date');
  expect(sql).toContain('v_row.item_key,\'revealed\',v_row.item_snapshot,v_observed_date');
  expect(sql).toContain('v_row.item_key,\'refreshed\',v_row.old_snapshot,v_row.item_snapshot,');
  expect(sql).toContain('v_observed_date,v_version');
  expect(sql).not.toContain('p_operation,p_operation,v_award.campaign_date_key');
  expect(sql).toContain('BEGIN;');
  expect(sql).toContain('COMMIT;');
 });
 it('não confunde ausência de item pendente com uma missão bem-sucedida já premiada',()=>{
  const sql=migration();
  expect(sql).toContain('public.spy_intelligence_operation_status(p_operation uuid)');
  expect(sql).toContain("THEN RETURN jsonb_build_object('status','missing_award')");
  expect(sql).toContain("public.is_campaign_admin()");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_intelligence_operation_status(uuid)');
  const server=read('src/lib/espionage/spy-dossier.functions.ts');
  expect(server).toContain("db.rpc('spy_intelligence_operation_status'");
  expect(server).toContain("if(status==='missing_award')");
  expect(server).toContain('if(!pending)throw new Error');
 });
 it('mostra corretamente a divergência entre resolução e atualização do dossiê',()=>{
  const ui=read('src/components/house/espionage/spy-narrator-resolution.tsx');
  expect(ui).toContain('response.intelligenceStatus');
  expect(ui).toContain("status==='waiting_catalog'");
  expect(ui).toContain("status==='retry_required'");
  expect(ui).toContain('role="alert" className="house-warning"');
  expect(ui).toContain("queryKey:['spy-dossiers']");
 });
 it('preserva a mesma chave em tentativa repetida de homologação',()=>{
  const ui=read('src/components/house/espionage/spy-narrator-resolution.tsx');
  expect(ui).toContain('requestKey.current??crypto.randomUUID()');
  expect(ui).toContain('requestKey.current=key');
  expect(ui).toContain('requestKey:key');
  const start=read('docs/espionage/sql/0102_spy_mission_active_travel_and_cancellation.sql');
  expect(start).toContain("pg_advisory_xact_lock(hashtextextended('spy-agent:'||p_agent::text,0))");
  expect(start).toContain("WHERE o.owner_house_id=p_house AND o.operation_key=p_request_key");
  const original=read('docs/espionage/sql/0104_spy_intelligence_dossiers_lotes_1_3.sql');
  expect(original).toContain('operation_id uuid PRIMARY KEY REFERENCES public.spy_operations(id)');
  expect(original).toContain('UNIQUE(owner_house_id,target_house_id)');
 });
 it('conserva as políticas de isolamento do servidor',()=>{
  const sql=read('docs/espionage/sql/0107_spy_intelligence_revoked_history_privacy.sql');
  expect(sql).toContain('public.in_campaign_house(p_house,false)');
  expect(sql).toContain('d.owner_house_id=p_house');
  expect(sql).toContain('v_admin OR EXISTS(');
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.spy_intelligence_read(text) FROM PUBLIC,anon');
 });
});
describe('Espionagem P0 · Hub Temporal / Harptos',()=>{
 it('conta Midwinter sem consumir dia ordinário da missão',()=>{
  const plan=planSpyRegionalMission({agent,
   destinationRegion:'dragoncoast',links:[],seaAllowed:true});
  expect(plan.status).toBe('ready');
  if(plan.status!=='ready')return;
  const schedule=projectSpyHarptosSchedule({
   plan,officialDate:'1522-01-21',calendarVersion:10});
  expect(schedule.travelRounds).toBe(0);
  expect(schedule.investigationEndsDateKey).toBe('1522-02-01');
  expect(schedule.crossedFestivalsUntilConclusion.map(f=>f.festivalId)).toContain('midwinter');
  expect(schedule.ordinaryDaysToConclusion).toBe(10);
 });
 it('inclui Midsummer e Shieldmeet, sem criar dias extras de investigação',()=>{
  const plan=planSpyRegionalMission({agent,
   destinationRegion:'dragoncoast',links:[],seaAllowed:true});
  if(plan.status!=='ready')throw new Error('Plano de teste não preparado');
  const schedule=projectSpyHarptosSchedule({
   plan,officialDate:'1524-07-21',calendarVersion:11});
  expect(schedule.investigationEndsDateKey).toBe('1524-08-01');
  expect(schedule.crossedFestivalsUntilConclusion.map(f=>f.festivalId))
   .toEqual(['midsummer','shieldmeet']);
  expect(schedule.ordinaryDaysToConclusion).toBe(10);
 });
 it('um salto grande contabiliza viagem e missão uma única vez',()=>{
  const plan=planSpyRegionalMission({agent,
   destinationRegion:'elfhold',links:cormyrPreviewLinks([]),seaAllowed:true});
  expect(plan.status).toBe('ready');
  if(plan.status!=='ready')return;
  expect(plan.travelRounds).toBe(2);
  const input={plan,officialDate:'1522-12-11',calendarVersion:12};
  const a=projectSpyHarptosSchedule(input);
  const b=projectSpyHarptosSchedule(input);
  expect(a).toEqual(b);
  expect(a.totalRounds).toBe(3);
  expect(a.ordinaryDaysToConclusion).toBe(30);
  expect(a.investigationEndsDateKey).toBe('1523-01-11');
  expect(dateKey(advanceHarptosDesdia('1522-12-11',3)))
   .toBe(a.investigationEndsDateKey);
 });
});
