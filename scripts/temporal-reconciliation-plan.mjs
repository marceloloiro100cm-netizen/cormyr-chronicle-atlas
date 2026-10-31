/**
 * Hub Temporal — Lote 15: plano de reconciliação SQL/Drizzle por arquivo.
 *
 * NUNCA executa SQL, consulta banco, altera journal ou declara deploy aprovado.
 * Gera inventário, folha de evidências e validação DOCUMENTAL local.
 *
 * node scripts/temporal-reconciliation-plan.mjs --report
 * node scripts/temporal-reconciliation-plan.mjs --template \
 *   --sha <commit> --environment homologation
 * node scripts/temporal-reconciliation-plan.mjs --check \
 *   --sha <commit> --environment homologation --evidence evidence.json
 *
 * Evidência é uma DECLARAÇÃO humana, jamais prova criptográfica de execução.
 * "evidence_complete" não implica "ready_for_deploy".
 */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMigrationCatalog} from './temporal-migration-audit.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const SHA=/^[a-f0-9]{40}$/i;
const FILE_HASH=/^[a-f0-9]{64}$/i;
const DISPOSITIONS=new Set(['applied','not_applied']);
const ENVIRONMENTS=new Set(['homologation','production']);
const NON_EMPTY=value=>typeof value==='string'&&value.trim().length>=3;
const evidenceShape=(entry)=>({
 tag:entry.tag,file_sha256:entry.sha256,
 disposition:'unknown',deployment_log_ref:null,schema_comparison_ref:null,
 operator:null,reviewer:null,reviewed_at:null,
});

/**
 * Meros indícios lexicais, NÃO uma análise gramatical/semântica de SQL.
 * A ausência de flag jamais significa que aplicar o arquivo é seguro.
 */
export function scanSqlReviewHints(sql){
 const clean=sql.replace(/\/\*[\s\S]*?\*\//g,' ')
  .replace(/--[^\n]*/g,' ');
 const checks=[
  ['security-definer',/\bSECURITY\s+DEFINER\b/i],
  ['data-write',/\b(INSERT\s+INTO|UPDATE\s+[\w".]+|DELETE\s+FROM|TRUNCATE\s+)\b/i],
  ['drop',/\bDROP\s+(TABLE|FUNCTION|TRIGGER|POLICY|VIEW|INDEX|TYPE|SCHEMA)\b/i],
  ['alter',/\bALTER\s+(TABLE|FUNCTION|POLICY|TYPE|SCHEMA)\b/i],
  ['permissions',/\b(GRANT|REVOKE)\s+/i],
  ['trigger',/\bCREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b/i],
  ['rls',/\b(ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY)\b/i],
  ['function',/\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i],
 ];
 return checks.filter(([,regex])=>regex.test(clean)).map(([name])=>name);
}

const validDate=(value,now)=>{
 if(typeof value!=='string'||!/\d{4}-\d{2}-\d{2}T/.test(value))return false;
 const millis=Date.parse(value);
 return Number.isFinite(millis)&&millis<=now.getTime()&&millis>0;
};

export function buildReconciliationTemplate(catalog,{sourceSha,environment}){
 const journalTags=new Set(catalog.journal.entries.map(e=>e.tag));
 return {
  format_version:1,source_sha:sourceSha,environment,
  disclaimer:'Autodeclaração para revisão manual. NÃO comprova deploy.',
  files:catalog.migrations.filter(m=>!journalTags.has(m.tag)).map(evidenceShape),
 };
}

export function reconcileMigrationEvidence(catalog,evidence=null,options={}){
 const root=options.root??ROOT,now=options.now??new Date();
 const snapshots=readdirSync(join(root,'drizzle/migrations/meta'))
  .filter(name=>/^\d{4}_snapshot\.json$/.test(name)).sort();
 const journalTags=new Set(catalog.journal.entries.map(e=>e.tag));
 const candidates=catalog.migrations.filter(m=>!journalTags.has(m.tag));
 const numbers=new Map();
 for(const migration of catalog.migrations)
  numbers.set(migration.number,(numbers.get(migration.number)??0)+1);
 const global=[];
 if(!options.sourceSha||!SHA.test(options.sourceSha))
  global.push('SOURCE_SHA_REQUIRED');
 if(!ENVIRONMENTS.has(options.environment))
  global.push('ENVIRONMENT_REQUIRED');
 const validEnvelope=evidence!==null&&typeof evidence==='object'&&!Array.isArray(evidence)&&
  evidence.format_version===1&&evidence.source_sha===options.sourceSha&&
  evidence.environment===options.environment&&Array.isArray(evidence.files);
 if(!validEnvelope)global.push('EVIDENCE_ENVELOPE_MISSING_OR_INVALID');
 const evidenceByTag=new Map();
 if(validEnvelope){
  for(const item of evidence.files){
   if(!item||typeof item.tag!=='string'){
    global.push('INVALID_EVIDENCE_ENTRY');continue;
   }
   if(evidenceByTag.has(item.tag))global.push('DUPLICATE_EVIDENCE_TAG:'+item.tag);
   else evidenceByTag.set(item.tag,item);
  }
  for(const tag of evidenceByTag.keys())
   if(!candidates.some(m=>m.tag===tag))global.push('UNEXPECTED_EVIDENCE_TAG:'+tag);
 }
 const entries=candidates.map(m=>{
  const issues=[],item=evidenceByTag.get(m.tag);
  const sql=readFileSync(join(root,'drizzle/migrations',m.tag+'.sql'),'utf8');
  if(!item)issues.push('NO_FILE_EVIDENCE');
  else{
   if(!FILE_HASH.test(item.file_sha256??'')||
    item.file_sha256.toLowerCase()!==m.sha256.toLowerCase())
    issues.push('SQL_HASH_MISMATCH');
   if(!DISPOSITIONS.has(item.disposition))
    issues.push('DISPOSITION_UNPROVEN');
   if(!NON_EMPTY(item.deployment_log_ref))
    issues.push('DEPLOYMENT_LOG_MISSING');
   if(!NON_EMPTY(item.schema_comparison_ref))
    issues.push('SCHEMA_COMPARISON_MISSING');
   if(!NON_EMPTY(item.operator)||!NON_EMPTY(item.reviewer)||
    item.operator.trim()===item.reviewer.trim())
    issues.push('INDEPENDENT_REVIEW_MISSING');
   if(!validDate(item.reviewed_at,now))
    issues.push('REVIEW_TIMESTAMP_INVALID');
  }
  const ambiguousOrdinal=numbers.get(m.number)>1;
  if(ambiguousOrdinal)issues.push('DUPLICATE_SQL_ORDINAL');
  return {
   tag:m.tag,
   sha256:m.sha256,
   journal_status:'absent',
   review_hints:scanSqlReviewHints(sql),
   ordinal_collision:ambiguousOrdinal,
   claimed_disposition:DISPOSITIONS.has(item?.disposition)?
    item.disposition:'unknown',
   evidence_reviewed:issues.length===0,
   issues,
  };
 });
 const reviewed=entries.filter(e=>e.evidence_reviewed).length;
 const unresolved=entries.length-reviewed;
 const report={
  format_version:1,
  source_sha:options.sourceSha??null,
  environment:options.environment??null,
  total_sql:catalog.migrations.length,
  journal_entries:catalog.journal.entries.length,
  snapshot_count:snapshots.length,
  latest_snapshot_file:snapshots.at(-1)??null,
  unjournaled_total:candidates.length,
  evidenced_total:reviewed,
  awaiting_evidence_total:unresolved,
  duplicate_ordinals:[...numbers.entries()].filter(([,n])=>n>1)
   .map(([ordinal])=>String(ordinal).padStart(4,'0')),
  evidence_complete:global.length===0&&unresolved===0,
  global_issues:global,
  files:entries,
  // O código-fonte ainda não foi conciliado com um ledger real.
  ready_for_deploy:false,
  migrations_applied_by_this_tool:0,
  journal_modified:false,
  production_release_authorized:false,
  requires_manual_reconciliation:true,
  evidence_is_self_declared:true,
 };
 return report;
}

export function parseReconciliationArgs(argv){
 const options={mode:'report',sourceSha:null,environment:null,evidencePath:null};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(['--report','--template','--check'].includes(arg))
   options.mode=arg.slice(2);
  else if(['--sha','--environment','--evidence'].includes(arg)){
   if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+arg);
   const value=argv[++i];
   if(arg==='--sha')options.sourceSha=value;
   else if(arg==='--environment')options.environment=value;
   else options.evidencePath=value;
  }else throw Error('Unknown argument '+arg);
 }
 if(options.mode==='check'&&!options.evidencePath)
  throw Error('--check requires --evidence');
 if(options.mode==='template'&&(!SHA.test(options.sourceSha??'')||
  !ENVIRONMENTS.has(options.environment)))
  throw Error('--template requires a full --sha and --environment');
 return options;
}

export function runReconciliationPlan(argv,options={}){
 const parsed=parseReconciliationArgs(argv);
 const catalog=options.catalog??loadMigrationCatalog();
 if(parsed.mode==='template')return {
  output:buildReconciliationTemplate(catalog,parsed),exitCode:0,
 };
 const evidence=parsed.evidencePath?
  JSON.parse(readFileSync(resolve(parsed.evidencePath),'utf8')):null;
 const output=reconcileMigrationEvidence(catalog,evidence,{
  ...parsed,root:options.root??ROOT,now:options.now??new Date(),
 });
 return {output,exitCode:parsed.mode==='check'&&!output.evidence_complete?2:0};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {output,exitCode}=runReconciliationPlan(process.argv.slice(2));
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(error){
  process.stderr.write('Conciliação bloqueada: '+
   (error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
