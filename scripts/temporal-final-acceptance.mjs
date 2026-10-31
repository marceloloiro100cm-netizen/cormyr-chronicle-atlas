/** Final Hub Temporal acceptance. Offline, read-only and never a deploy gate.
 * A passing static contract does not authorize SQL execution or publication.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeMigrationCatalog,loadMigrationCatalog} from './temporal-migration-audit.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const FINAL_TEMPORAL_CONTRACTS=Object.freeze({
 'relógio único':{
  path:'src/lib/calendar/campaign-time.ts',
  markers:["CAMPAIGN_TIME_QUERY_KEY", "rpc('get_campaign_calendar')", 'validateCampaignTimeSnapshot'],
 },
 'désdias e festivais':{
  path:'src/lib/calendar/temporal-engine.ts',
  markers:['advanceHarptosDesdia','getHarptosDesdia','crossedFestivals'],
 },
 'publicação protegida':{
  path:'src/components/calendar/narrator-calendar.tsx',
  markers:["rpc('publish_campaign_time_change'",'await requireFreshNarratorAccess()','purgeRevokedNarratorCache(qc)'],
 },
 'idades anuais':{
  path:'src/lib/calendar/character-ages.ts',
  markers:['validateAgeDashboard','CharacterAgeStatus','deceased'],
 },
 'casas e obras':{
  path:'src/lib/calendar/house-time-impact.ts',
  markers:['validateHouseTimeImpact','projectTemporalNotice'],
 },
 'conexões transversais':{
  path:'src/lib/calendar/time-connections.ts',
  markers:['TEMPORAL_QUERY_CONNECTIONS','temporalQueryKeysForInvalidation'],
 },
 'bloqueio global':{
  path:'src/routes/_authenticated/jogadores.tsx',
  markers:['watchNarratorPrivateReadRevocations(qc)','if(revoked.data)return','CAMPAIGN_ACCESS_SCOPE_POLL_MS'],
 },
 'leitura privada':{
  path:'src/lib/auth/narrator-revocation.ts',
  markers:['watchNarratorPrivateReadRevocations','isNarratorPrivateQueryKey','purgeRevokedNarratorCache'],
 },
 'CI e banco descartável':{
  path:'.github/workflows/validate.yml',
  markers:['Unit and component tests','TypeScript verification','Production build',
   'Restore fixture backup and validate temporal contracts (isolated)'],
 },
});
export const FINAL_REQUIRED_TESTS=Object.freeze([
 'src/test/narrator-global-revocation-lote34.test.ts',
 'src/test/narrator-private-read-revocation-lote35.test.ts',
 'src/test/narrator-role-preflight-lote36.test.ts',
 'scripts/test-temporal-multiyear-effects.sql',
 'scripts/test-temporal-session-isolation.sql',
 'scripts/test-temporal-inflight-revocation.sql',
 'scripts/test-temporal-historical-consistency.sql',
 'scripts/test-temporal-homologation-contracts.sql',
]);

export function auditTemporalFinalAcceptance(read,exists){
 const findings=[];
 for(const [area,entry] of Object.entries(FINAL_TEMPORAL_CONTRACTS)){
  let content='';
  try{content=read(entry.path);}catch{findings.push({area,code:'MISSING_FILE',path:entry.path});continue;}
  for(const marker of entry.markers){
   if(!content.includes(marker))findings.push({area,code:'MISSING_CONTRACT',path:entry.path,marker});
  }
 }
 for(const path of FINAL_REQUIRED_TESTS){
  if(!exists(path))findings.push({area:'regressões',code:'MISSING_TEST',path});
 }
 return {
  format_version:1,
  inspected_surfaces:Object.keys(FINAL_TEMPORAL_CONTRACTS).length,
  required_regressions:FINAL_REQUIRED_TESTS.length,
  findings,
  static_contract_ok:findings.length===0,
  production_data_verified:false,
  real_backup_restoration_verified:false,
  sql_executed:false,
  merge_authorized:false,
  production_release_authorized:false,
  go_no_go:'NO_GO',
 };
}
export function runFinalTemporalAcceptance(mode,root=ROOT){
 if(!['--report','--gate'].includes(mode))throw Error('Use --report ou --gate');
 const read=p=>readFileSync(resolve(root,p),'utf8');
 const exists=p=>{try{return readFileSync(resolve(root,p)).length>0;}catch{return false;}};
 const report=auditTemporalFinalAcceptance(read,exists);
 const migration=analyzeMigrationCatalog(loadMigrationCatalog(root));
 report.migration_catalog_ready=Boolean(migration.ready_for_deploy);
 report.migration_blocker_codes=migration.problems.map(p=>p.code);
 report.pending_external_validation=[
  'Inventário e conciliação das migrações reais',
  'Restauração homologada de backup autorizado',
  'Revisão de RLS e fluxo end-to-end no ambiente-alvo',
  'Aprovação explícita da janela de implantação e integração das PRs',
 ];
 return {report,exitCode:mode==='--gate'&&!report.static_contract_ok?2:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error('Informe --report ou --gate');
  const {report,exitCode}=runFinalTemporalAcceptance(process.argv[2]);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(error){
  process.stderr.write('Auditoria temporal final bloqueada: '+String(error)+'\n');
  process.exitCode=2;
 }
}
