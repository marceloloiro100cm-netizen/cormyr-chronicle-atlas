import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readRuntimeSources,auditTemporalSite,runTemporalSiteAudit}
 from './temporal-site-audit.mjs';

const sources=readRuntimeSources();
const codes=report=>report.errors.map(e=>e.code);

describe('Lote 22 · contrato de data canônica através do site',()=>{
 it('examina arquivos runtime, conecta módulos obrigatórios e não certifica produção',()=>{
  const report=auditTemporalSite(sources);
  assert.ok(report.files_inspected>50);
  assert.ok(report.required_surfaces>=10);
  assert.ok(report.registered_invalidation_prefixes>=20);
  assert.equal(report.static_contract_ok,true,JSON.stringify(report.errors,null,2));
  assert.equal(report.all_site_behaviour_verified,false);
  assert.equal(report.database_accessed,false);
  assert.equal(report.production_release_authorized,false);
  assert.equal(runTemporalSiteAudit(['--gate']).exitCode,0);
 });
 it('rejeita uma segunda consulta direta ao relógio, evitando cache paralelo',()=>{
  const x={...sources,'src/components/house/fake-time.ts':
   "const {data}=await supabase.rpc('get_campaign_calendar');"};
  const report=auditTemporalSite(x);
  assert.ok(codes(report).includes('SECOND_CANONICAL_CLOCK_FETCH'));
  assert.equal(report.static_contract_ok,false);
 });
 it('rejeita SELECT direto em campanha oficial mesmo no painel do Narrador',()=>{
  const x={...sources,'src/components/calendar/unapproved.tsx':
   'const rows=await supabase.from("campaign_calendar").select("*");'};
  assert.ok(codes(auditTemporalSite(x)).includes('DIRECT_CALENDAR_TABLE_QUERY'));
 });
 it('não permite substituir o calendário de Harptos pelo relógio real ou ano fixo',()=>{
  const x={...sources,'src/components/house/current-year.tsx':
   'const currentYear = new Date().getFullYear();\nconst officialYear=1522;'};
  const report=auditTemporalSite(x);
  assert.ok(codes(report).includes('INDEPENDENT_CAMPAIGN_YEAR'));
  assert.ok(report.errors.length>=2);
 });
 it('recusa remoção de link para missivas ou consulta canônica da UI',()=>{
  const altered={...sources};
  altered['src/lib/calendar/time-connections.ts']=
   altered['src/lib/calendar/time-connections.ts'].replace(
    "prefix:'mail-page'","prefix:'replaced-mail-page'");
  assert.ok(codes(auditTemporalSite(altered)).includes('MISSING_REQUIRED_QUERY_PREFIX'));
  const missing={...sources};
  missing['src/components/calendar/calendar.tsx']=
   missing['src/components/calendar/calendar.tsx'].replaceAll('useCampaignTime','useOtherClock');
  assert.ok(codes(auditTemporalSite(missing)).includes('MISSING_SURFACE_INTEGRATION'));
 });
 it('Date.now usado apenas como chave de rascunho não vira relógio de campanha',()=>{
  const report=auditTemporalSite({
   ...sources,'src/components/players/mail-draft-test.tsx':
    'const draft={key: Date.now(), subject: "", content: ""};',
  });
  assert.equal(codes(report).includes('WALL_CLOCK_CAMPAIGN_DATE'),false);
 });
 it('modo --gate falha para contratos inválidos; opções de escrita não existem',()=>{
  assert.throws(()=>runTemporalSiteAudit(['--apply']),/--report ou --gate/);
  assert.throws(()=>runTemporalSiteAudit([]),/--report ou --gate/);
 });
});
