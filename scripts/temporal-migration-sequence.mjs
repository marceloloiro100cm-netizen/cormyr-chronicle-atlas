/**
 * Cormyr Hub Temporal — Lote 17.
 * Produz uma avaliação de ORDEM de migrações baseada em evidências fornecidas
 * pelo operador. Nunca produz SQL, comandos de execução, alteração de journal
 * ou autorização para aplicar scripts.
 *
 * Uso offline:
 *   node scripts/temporal-migration-sequence.mjs --report
 *   node scripts/temporal-migration-sequence.mjs --template --sha <40-hex> --environment homologation
 *   node scripts/temporal-migration-sequence.mjs --check --sha <40-hex> \
 *     --environment homologation --evidence .temporal-audit/temporal-status.json
 *
 * Toda evidência externa é AUTODECLARADA. No catálogo atual (27 SQL sem
 * journal, 0041 duplicado) o estado continua NO_GO mesmo com declarações
 * positivas e logs de clones descartáveis.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMigrationCatalog,analyzeMigrationCatalog} from './temporal-migration-audit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SHA=/^[a-f0-9]{40}$/i;
const SQL_SHA=/^[a-f0-9]{64}$/i;
const validEnvironments=new Set(['homologation','production']);
const validStates=new Set(['applied','not_applied']);
const temporalPrefixes=Object.freeze(['0060','0061','0062','0063','0064','0065','0066','0067']);
const value=v=>typeof v==='string'&&v.trim().length>=3;
const issue=(code,detail)=>({code,detail});

/** Observações da execução no GitHub Actions, não do banco do usuário. */
export function loadReplayRisks(file=join(root,'docs/hub-temporal-replay-risks.json')){
 return JSON.parse(readFileSync(file,'utf8'));
}
function resolveTemporalCatalog(catalog){
 const temporal=[];
 const problems=[];
 for(const prefix of temporalPrefixes){
  const matches=catalog.migrations.filter(m=>m.tag.startsWith(prefix+'_'));
  if(matches.length!==1)problems.push(issue('TEMPORAL_FILE_AMBIGUOUS',
   prefix+': requer exatamente um arquivo SQL'));
  else temporal.push(matches[0]);
 }
 return {temporal,problems};
}

export function buildTemporalStatusTemplate(catalog,{sourceSha,environment}){
 const {temporal,problems}=resolveTemporalCatalog(catalog);
 if(problems.length)throw Error('Catálogo temporal incompleto');
 if(!SHA.test(sourceSha??'')||!validEnvironments.has(environment))
  throw Error('Template exige SHA completo e ambiente explícito');
 return {
  format_version:1,
  source_sha:sourceSha,
  environment,
  legacy_history_reconciled:false,
  historical_collision_0041_resolved:false,
  migration_strategy_reviewed:false,
  operator:null,
  independent_reviewer:null,
  reviewed_at:null,
  records:temporal.map(m=>({
   tag:m.tag,
   file_sha256:m.sha256,
   state:'unknown',
   deployment_evidence_ref:null,
   schema_evidence_ref:null,
  })),
  warning:'Folha autodeclarada; não prova implantação ou autoriza aplicar SQL.',
 };
}

function checkReplayObservations(temporal,manifest){
 const blockers=[];
 if(!manifest||manifest.format_version!==1||
    manifest.source?.ci_run_id!==41241607317||
    !Array.isArray(manifest.results))return [issue('REPLAY_RECORD_MISSING',
      'Manifesto de ensaio local sem rastreabilidade à execução do CI')];
 const byTag=new Map();
 for(const x of manifest.results){
  if(!x||typeof x.tag!=='string'||byTag.has(x.tag))
   blockers.push(issue('REPLAY_RECORD_DUPLICATE','Registros de risco duplicados ou inválidos'));
  else byTag.set(x.tag,x);
 }
 for(const row of temporal){
  const r=byTag.get(row.tag);
  if(!r||r.file_sha256!==row.sha256||
   typeof r.replay_succeeded_on_clone!=='boolean'||
   typeof r.schema_changed_in_clone!=='boolean'||
   typeof r.data_changed_in_clone!=='boolean'||
   typeof r.season_fix_regressed_in_clone!=='boolean')
   blockers.push(issue('REPLAY_RECORD_DRIFT',row.tag+' diverge do SQL ou do ensaio'));
 }
 if(byTag.size!==temporal.length)
  blockers.push(issue('REPLAY_RECORD_INCOMPLETE','Faltam registros no manifesto'));
 if(byTag.get('0062_canonical_character_registry')?.replay_succeeded_on_clone!==false||
  byTag.get('0063_annual_character_ages')?.replay_succeeded_on_clone!==false||
  byTag.get('0066_temporal_consumer_outbox')?.season_fix_regressed_in_clone!==true||
  byTag.get('0066_temporal_consumer_outbox')?.schema_changed_in_clone!==true)
  blockers.push(issue('REPLAY_RISK_MISMATCH','Perdas de garantias do ensaio de 0062/0063/0066'));
 return blockers;
}

export function evaluateTemporalMigrationSequence(catalog,evidence=null,opts={}){
 const {sourceSha=null,environment=null,now=new Date(),
  replayRisks=loadReplayRisks()}=opts;
 const {temporal,problems}=resolveTemporalCatalog(catalog);
 const blockers=[...problems,...checkReplayObservations(temporal,replayRisks)];
 const catalogReport=analyzeMigrationCatalog(catalog);
 // A ausência de inventário real é esperada nesta análise offline; não
 // deixar passar ambiguidades do catálogo versionado.
 for(const p of catalogReport.problems||[])
  if(p.code!=='NO_PRODUCTION_INVENTORY')
   blockers.push(issue('LOCAL_CATALOG_'+p.code,p.detail));

 if(!SHA.test(sourceSha??''))blockers.push(issue('SOURCE_SHA_REQUIRED','Commit SHA de 40 caracteres obrigatório'));
 if(!validEnvironments.has(environment))
  blockers.push(issue('ENVIRONMENT_REQUIRED','Informe homologation ou production'));
 const validEvidence=evidence!==null&&typeof evidence==='object'&&!Array.isArray(evidence)&&
  evidence.format_version===1&&evidence.source_sha===sourceSha&&
  evidence.environment===environment&&Array.isArray(evidence.records);
 if(!validEvidence)blockers.push(issue('STATUS_EVIDENCE_MISSING','Evidência ausente, outro commit ou outro ambiente'));
 const rows=new Map();
 if(validEvidence){
  for(const row of evidence.records){
   if(!row||typeof row.tag!=='string'||rows.has(row.tag)){
    blockers.push(issue('STATUS_DUPLICATE','Tags de status duplicadas ou incorretas'));continue;
   }
   rows.set(row.tag,row);
  }
  for(const tag of rows.keys())
   if(!temporal.some(m=>m.tag===tag))
    blockers.push(issue('STATUS_UNEXPECTED_TAG','Registro estranho: '+tag));
 }
 const statuses=[];
 for(const m of temporal){
  const row=rows.get(m.tag);
  const localIssues=[];
  if(!row)localIssues.push('STATUS_UNPROVEN');
  else{
   if(!SQL_SHA.test(row.file_sha256??'')||row.file_sha256!==m.sha256)
    localIssues.push('FILE_HASH_MISMATCH');
   if(!validStates.has(row.state))localIssues.push('UNKNOWN_APPLICATION_STATE');
   if(!value(row.deployment_evidence_ref))localIssues.push('DEPLOYMENT_LOG_NOT_REFERENCED');
   if(!value(row.schema_evidence_ref))localIssues.push('SCHEMA_NOT_VERIFIED');
  }
  statuses.push({
   tag:m.tag,
   file_sha256:m.sha256,
   claimed_state:validStates.has(row?.state)?row.state:'unknown',
   evidence_status:localIssues.length===0?'self_declared_only':'missing_or_invalid',
   issues:localIssues,
  });
  for(const code of localIssues)blockers.push(issue(code,m.tag+': '+code));
 }
 if(validEvidence){
  const ts=Date.parse(evidence.reviewed_at);
  const when=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(ts)||ts<=0||ts>when)
   blockers.push(issue('REVIEW_DATE_INVALID','Revisão futura ou não comprovada'));
  if(!value(evidence.operator)||!value(evidence.independent_reviewer)||
   evidence.operator.trim()===evidence.independent_reviewer.trim())
   blockers.push(issue('INDEPENDENT_REVIEW_REQUIRED','Responsável e revisor independentes obrigatórios'));
  for(const field of ['legacy_history_reconciled','historical_collision_0041_resolved',
   'migration_strategy_reviewed'])
   if(evidence[field]!==true)
    blockers.push(issue('HISTORICAL_APPROVAL_REQUIRED',
      field+' não foi documentado/validado'));
 }
 let sawPending=false;
 for(const row of statuses){
  if(row.claimed_state==='not_applied')sawPending=true;
  if(row.claimed_state==='applied'&&sawPending)
   blockers.push(issue('NON_PREFIX_APPLICATION',
    row.tag+': script posterior alegadamente aplicado com predecessor pendente'));
 }
 const candidate=blockers.length===0?
  statuses.filter(s=>s.claimed_state==='not_applied').map(s=>s.tag):[];
 const conclusions={
  format_version:1,
  environment,
  source_sha:sourceSha,
  catalog_sql_total:catalog.migrations.length,
  journal_entries:catalog.journal?.entries?.length??0,
  historical_sql_without_journal:catalogReport.summary?.unjournaled??null,
  chronological_temporal_order:temporal.map(m=>m.tag),
  reviewed_candidate_suffix: candidate,
  candidate_status: blockers.length?
   'BLOCKED':'REVIEW_ONLY_NOT_EXECUTABLE',
  go_no_go:'NO_GO',
  blockers,
  claimed_statuses:statuses,
  replay_risk_facts:{
   ci_run_id:replayRisks?.source?.ci_run_id??null,
   non_reentrant_on_scratch:['0062_canonical_character_registry','0063_annual_character_ages'],
   downgrade_if_0066_replayed_after_0067:true,
  },
  production_release_authorized:false,
  execute_migrations:false,
  writes_sql_files:false,
  updates_drizzle_journal:false,
  human_review_required:true,
  external_evidence_is_authenticated:false,
 };
 return conclusions;
}
export function parseSequenceArgs(argv){
 const parsed={mode:'report',sourceSha:null,environment:null,evidencePath:null};
 for(let i=0;i<argv.length;i++){
  const token=argv[i];
  if(['--report','--template','--check'].includes(token))parsed.mode=token.slice(2);
  else if(['--sha','--environment','--evidence'].includes(token)){
   const next=argv[++i];
   if(!next||next.startsWith('--'))throw Error('Argumento requer valor: '+token);
   if(token==='--sha')parsed.sourceSha=next;
   else if(token==='--environment')parsed.environment=next;
   else parsed.evidencePath=next;
  }else throw Error('Argumento desconhecido: '+token);
 }
 if(parsed.mode==='check'&&!parsed.evidencePath)throw Error('--check exige --evidence');
 if(parsed.mode==='template'&&(!SHA.test(parsed.sourceSha??'')||
  !validEnvironments.has(parsed.environment)))
  throw Error('--template exige --sha de 40 caracteres e ambiente');
 return parsed;
}
export function runSequencePlan(argv,catalog=loadMigrationCatalog(),now=new Date()){
 const args=parseSequenceArgs(argv);
 if(args.mode==='template')return {
  report:buildTemporalStatusTemplate(catalog,args),exitCode:0,
 };
 const evidence=args.evidencePath?
  JSON.parse(readFileSync(resolve(args.evidencePath),'utf8')):null;
 const report=evaluateTemporalMigrationSequence(catalog,evidence,{
  sourceSha:args.sourceSha,environment:args.environment,now,
 });
 return {report,exitCode:args.mode==='check'&&report.candidate_status==='BLOCKED'?2:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {report,exitCode}=runSequencePlan(process.argv.slice(2));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(err){
  process.stderr.write('Plano temporal bloqueado: '+
   (err instanceof Error?err.message:String(err))+'\n');
  process.exitCode=2;
 }
}
