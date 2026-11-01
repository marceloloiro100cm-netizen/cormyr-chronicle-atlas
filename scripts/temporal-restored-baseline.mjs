/**
 * Cormyr Hub Temporal — Lote 19.
 * Snapshot agregado de uma CÓPIA RESTAURADA autorizada, não de produção.
 * Nenhuma consulta de nome, texto, UUID de jogador, segredo, missiva ou ficha.
 * Não verifica a procedência real da cópia: a autorização é do operador.
 *
 * Snapshot offline/opt-in:
 * CORMYR_RESTORED_DATABASE_URL=... CORMYR_APPROVED_RESTORED_HOST=... \
 * CORMYR_APPROVED_RESTORED_DB=... CORMYR_AUDIT_SOURCE_SHA=... \
 * node scripts/temporal-restored-baseline.mjs --snapshot --read-only --restored-copy
 *
 * Comparar dois snapshots coletados localmente:
 * node scripts/temporal-restored-baseline.mjs --compare <baseline.json> <candidate.json>
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SNAPSHOT_TABLES=Object.freeze([
 'campaign_houses','noble_house_sheets','house_memberships',
 'campaign_characters','campaign_letters','letter_replies',
 'noble_house_ledger','campaign_time_operations',
 'campaign_temporal_deliveries',
]);
export const JSON_ARRAY_METRICS=Object.freeze(['units','holdings']);
const SHA=/^[a-f0-9]{40}$/i;
const VERSION=1;
const METRICS=Object.freeze([
 ...SNAPSHOT_TABLES.map(table=>'rows_'+table),
 ...JSON_ARRAY_METRICS.map(name=>'house_'+name),
]);

function safeCount(value){
 return typeof value==='string' && /^(0|[1-9][0-9]*)$/.test(value);
}
function isClock(clock){
 if(!clock||typeof clock!=='object'||Array.isArray(clock))return false;
 const allowed=['year','month','day','festival','version'];
 const keys=Object.keys(clock);
 return keys.length===allowed.length&&keys.every(k=>allowed.includes(k))&&
  Number.isInteger(clock.year)&&clock.year>0&&
  Number.isInteger(clock.month)&&clock.month>=0&&clock.month<=11&&
  Number.isInteger(clock.day)&&clock.day>=1&&clock.day<=30&&
  (clock.festival===null||typeof clock.festival==='string')&&
  Number.isInteger(clock.version)&&clock.version>0;
}
export function validateRestoredTarget(url,approvedHost,approvedDb,sourceSha){
 if(!url||!/^postgres(ql)?:\/\//i.test(url))throw Error('URL de cópia restaurada não fornecida');
 if(!approvedHost||!approvedDb||!SHA.test(sourceSha??''))
  throw Error('Exige host, banco restaurado aprovado e SHA do código');
 const parsed=new URL(url);
 if(parsed.hostname!==approvedHost)
  throw Error('Hostname não corresponde à cópia autorizada');
 const db=decodeURIComponent(parsed.pathname.slice(1));
 if(db!==approvedDb||!/(_restore|_clone|_homolog|_staging|_test)(_[a-z0-9]+)?$/i.test(db))
  throw Error('Banco de destino não identificado como cópia/restauração isolada');
 if(parsed.search)
  throw Error('Query string de conexão não é permitida');
 if(parsed.username.length===0||parsed.password.length===0)
  throw Error('Use credencial explícita de leitura aprovada para a cópia');
 return {host:approvedHost,database:db,source_sha:sourceSha.toLowerCase()};
}
export async function inspectRestoredBaseline(tx,{sourceSha,now=new Date()}){
 if(!SHA.test(sourceSha??''))throw Error('SHA da revisão é obrigatório');
 const totals={};
 for(const table of SNAPSHOT_TABLES){
  // Identificador estático, vindo exclusivamente do allowlist acima.
  const exists=await tx.unsafe('SELECT to_regclass($1) IS NOT NULL AS exists',
   ['public.'+table]);
  if(exists[0]?.exists!==true)throw Error('Objeto esperado ausente: '+table);
  const rows=await tx.unsafe('SELECT count(*)::text AS total FROM public.'+table);
  if(!safeCount(rows[0]?.total))throw Error('Contagem inválida: '+table);
  totals['rows_'+table]=rows[0].total;
 }
 for(const field of JSON_ARRAY_METRICS){
  const rows=await tx.unsafe(
   "SELECT coalesce(sum(CASE WHEN jsonb_typeof(state->'"+field+
   "')='array' THEN jsonb_array_length(state->'"+field+
   "') ELSE 0 END),0)::text AS total FROM public.noble_house_sheets");
  if(!safeCount(rows[0]?.total))throw Error('Contagem JSON inválida: '+field);
  totals['house_'+field]=rows[0].total;
 }
 const clockRows=await tx.unsafe('SELECT public.get_public_campaign_time() AS clock');
 const clock=clockRows[0]?.clock;
 if(!isClock(clock))throw Error('Relógio público ausente ou contém campos não autorizados');
 return {
  format_version:VERSION,
  kind:'restored_campaign_aggregate_snapshot',
  source_sha:sourceSha.toLowerCase(),
  environment:'homologation-restored',
  collected_at:now.toISOString(),
  totals,
  public_clock:clock,
  data_contents_collected:false,
  source_database_verified:false,
  copy_identity_operator_asserted:true,
  production_backup_restored:false,
  production_release_authorized:false,
  actions_performed:['read_only_aggregate_sql'],
 };
}
export function compareRestoredBaselines(baseline,candidate){
 const blockers=[];
 const validSnapshot=(v)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  v.format_version===VERSION&&v.kind==='restored_campaign_aggregate_snapshot'&&
  SHA.test(v.source_sha??'')&&v.environment==='homologation-restored'&&
  v.data_contents_collected===false&&v.source_database_verified===false&&
  v.production_release_authorized===false&&
  v.copy_identity_operator_asserted===true&&
  v.totals&&typeof v.totals==='object'&&!Array.isArray(v.totals)&&
  Object.keys(v.totals).length===METRICS.length&&
  Object.keys(v.totals).every(k=>METRICS.includes(k))&&
  METRICS.every(k=>safeCount(v.totals[k]))&&isClock(v.public_clock)&&
  typeof v.collected_at==='string'&&!Number.isNaN(Date.parse(v.collected_at));
 if(!validSnapshot(baseline)||!validSnapshot(candidate))
  blockers.push('SNAPSHOT_FORMAT_OR_INCOMPLETE');
 if(validSnapshot(baseline)&&validSnapshot(candidate)){
  if(baseline.source_sha!==candidate.source_sha)blockers.push('SOURCE_SHA_MISMATCH');
  for(const key of METRICS)
   if(baseline.totals[key]!==candidate.totals[key])blockers.push('COUNT_MISMATCH:'+key);
  if(JSON.stringify(baseline.public_clock)!==JSON.stringify(candidate.public_clock))
   blockers.push('CLOCK_MISMATCH');
 }
 return {
  format_version:VERSION,
  snapshot_comparison_ok:blockers.length===0,
  evaluated_metrics:METRICS.length,
  private_values_disclosed:false,
  integrity_evidence_scope:'aggregate_counts_and_public_clock_only',
  source_database_verified:false,
  production_backup_restored:false,
  migrations_reconciled:false,
  production_release_authorized:false,
  blockers,
 };
}
export function parseBaselineArgs(args){
 if(args.length===3&&args[0]==='--compare'&&
  !args[1].startsWith('--')&&!args[2].startsWith('--'))
  return {mode:'compare',baseline:args[1],candidate:args[2]};
 if(args.length===3&&
  args[0]==='--snapshot'&&args[1]==='--read-only'&&args[2]==='--restored-copy')
  return {mode:'snapshot'};
 throw Error('Use --snapshot --read-only --restored-copy ou --compare <baseline> <cópia>');
}
export async function runRestoredBaseline(argv,env=process.env){
 const args=parseBaselineArgs(argv);
 if(args.mode==='compare'){
  const a=JSON.parse(readFileSync(resolve(args.baseline),'utf8'));
  const b=JSON.parse(readFileSync(resolve(args.candidate),'utf8'));
  const report=compareRestoredBaselines(a,b);
  return {report,exitCode:report.snapshot_comparison_ok?0:2};
 }
 const opts=validateRestoredTarget(
  env.CORMYR_RESTORED_DATABASE_URL,
  env.CORMYR_APPROVED_RESTORED_HOST,
  env.CORMYR_APPROVED_RESTORED_DB,
  env.CORMYR_AUDIT_SOURCE_SHA);
 const {default:postgres}=await import('postgres');
 const db=postgres(env.CORMYR_RESTORED_DATABASE_URL,{max:1,prepare:false,
  application_name:'cormyr-restored-aggregate-readonly'});
 try{
  const report=await db.begin(async tx=>{
   await tx.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
   return inspectRestoredBaseline(tx,{sourceSha:opts.source_sha});
  });
  return {report,exitCode:0};
 }finally{await db.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {report,exitCode}=await runRestoredBaseline(process.argv.slice(2));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(error){
  process.stderr.write('Auditoria da cópia bloqueada: '+
   (error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
