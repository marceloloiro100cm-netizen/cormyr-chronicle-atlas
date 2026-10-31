/**
 * Hub Temporal — Lote 14: avaliação de prontidão, nunca um executor de deploy.
 *
 * Sem argumentos: relatório local bloqueado, sem rede e sem segredos.
 *
 * Evidências externas são declarações fornecidas pelo operador: NÃO há
 * atestação criptográfica, validação da autoria ou consulta ao banco.
 * Mesmo com todos os checks passando, production_release_authorized é false.
 *
 * node scripts/temporal-release-readiness.mjs --report
 * node scripts/temporal-release-readiness.mjs --gate --sha <commit> \
 *   --environment homologation --migration x.json --contracts y.json \
 *   --stack z.json --ci w.json --operations v.json
 *
 * --gate testa apenas a completude declarada. NÃO aciona deploy/merge/DDL.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeMigrationCatalog,loadMigrationCatalog} from './temporal-migration-audit.mjs';
import {auditTemporalStack,readTemporalStack} from './temporal-stack-audit.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const kinds=['migration','contracts','stack','ci','operations'];
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const textOrNull=v=>typeof v==='string'&&v.length?v:null;

export function evaluateTemporalReadiness({
 sourceSha=null,environment=null,evidence={},now=new Date(),
 localCatalog=null,localStack=null,
}={}){
 const blockers=[],checks={};
 const record=(id,ok,reason)=>{
  checks[id]=Boolean(ok);
  if(!ok)blockers.push({code:id,reason});
 };
 const catalog=localCatalog??loadMigrationCatalog();
 const stack=localStack??readTemporalStack();
 const migrationLocal=analyzeMigrationCatalog(catalog);
 const stackLocal=auditTemporalStack(stack);
 record('SOURCE_SHA_PRESENT',typeof sourceSha==='string'&&SHA.test(sourceSha),
  'Informe o SHA exato do commit validado');
 record('ENVIRONMENT_EXPLICIT',environment==='homologation'||environment==='production',
  'Identifique homologação ou produção explicitamente');
 record('LOCAL_MIGRATION_CATALOG',migrationLocal.ready_for_deploy,
  'O catálogo SQL/Drizzle contém lacunas, ambiguidades ou não foi conciliado');
 record('LOCAL_PR_STACK',stackLocal.chain_consistent,
  'Manifesto de dependências das PRs inconsistente');
 const time=now instanceof Date?now.getTime():Number.NaN;
 const reports={};
 for(const kind of kinds){
  const entry=evidence[kind];
  const envelopeOk=isObject(entry)&&entry.format_version===1&&
   entry.kind===kind&&entry.environment===environment&&
   entry.source_sha===sourceSha&&typeof entry.observed_at==='string'&&
   isObject(entry.report);
  const timestamp=envelopeOk?Date.parse(entry.observed_at):NaN;
  const recent=Number.isFinite(timestamp)&&Number.isFinite(time)&&
   timestamp<=time&&time-timestamp<=24*60*60*1000;
  record(kind.toUpperCase()+'_EVIDENCE',envelopeOk&&recent,
   'Evidência ausente, incorreta, de outro commit/ambiente ou com mais de 24h');
  if(envelopeOk&&recent)reports[kind]=entry.report;
 }
 const migrations=reports.migration;
 record('MIGRATION_RECONCILED',
  migrations?.ready_for_deploy===true&&migrations?.inventory_verified===true&&
   Array.isArray(migrations?.problems)&&migrations.problems.length===0&&
   migrations.summary?.unjournaled===0&&migrations.summary?.repeated_sql_ordinals===0&&
   Number.isSafeInteger(migrations.summary?.sql_files)&&
   migrations.summary.sql_files===catalog.migrations.length&&
   migrations.summary.journal_entries===catalog.journal.entries.length,
  'A auditoria de migração não comprovou reconciliação completa');
 const contracts=reports.contracts;
 record('CONTRACTS_APPROVED',contracts?.contract_ok===true&&
  contracts.production_release_authorized===false&&
  Array.isArray(contracts.checks)&&contracts.checks.length>=16&&
  contracts.checks.every(c=>c?.passed===true),
  'Contratos de permissões/RLS ou data pública não estão comprovados');
 const pr=reports.stack;
 record('PR_CHAIN_INTEGRATED',pr?.chain_consistent===true&&
  pr.live_verified===true&&pr.all_merged===true&&
  pr.release_authorized===false&&Array.isArray(pr.errors)&&pr.errors.length===0,
  'A cadeia ainda não está totalmente integrada e verificada no GitHub');
 const ci=reports.ci;
 record('CI_GREEN',ci?.conclusion==='success'&&
  ci?.jobs?.validate==='success'&&ci?.jobs?.['mail-database']==='success',
  'Não há evidência declarada de workflow CI completo e aprovado');
 const ops=reports.operations;
 record('OPERATOR_CHECKLIST',ops?.backup_restored===true&&
  ops?.representative_homologation===true&&ops?.role_based_rls_test===true&&
  ops?.migration_history_reconciled===true&&ops?.rollback_rehearsed===true&&
  ops?.window_authorized===true,
  'Backup restaurado, homologação, usuários, migrações, rollback e janela exigem comprovação externa');
 const evidenceComplete=Object.values(checks).every(Boolean);
 return {
  format_version:1,
  subject:'Cormyr Hub Temporal · Lote 14',
  source_sha:textOrNull(sourceSha),
  environment:textOrNull(environment),
  technical_evidence_complete:evidenceComplete,
  go_no_go:evidenceComplete?'MANUAL_APPROVAL_REQUIRED':'NO_GO',
  // Explicit invariants: no tool output is an authorization token.
  production_release_authorized:false,
  merge_authorized:false,
  migration_execution_authorized:false,
  any_operation_performed:false,
  external_evidence_unverified:true,
  human_review_required:true,
  verified_checks:checks,
  blockers,
  local_baseline:{
   sql_files:catalog.migrations.length,
   journal_entries:catalog.journal.entries.length,
   unjournaled:migrationLocal.summary?.unjournaled??null,
   duplicated_ordinals:migrationLocal.summary?.repeated_sql_ordinals??null,
   pr_dependencies:stack.sequence.length,
  },
 };
}

export function parseReleaseArgs(args){
 const parsed={mode:'report',sourceSha:null,environment:null,paths:{}};
 const files={'--migration':'migration','--contracts':'contracts',
  '--stack':'stack','--ci':'ci','--operations':'operations'};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--report')parsed.mode='report';
  else if(arg==='--gate')parsed.mode='gate';
  else if(arg==='--sha'||arg==='--environment'||files[arg]){
   if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Argumento sem valor: '+arg);
   const value=args[++i];
   if(arg==='--sha')parsed.sourceSha=value;
   else if(arg==='--environment')parsed.environment=value;
   else parsed.paths[files[arg]]=value;
  }else throw Error('Argumento desconhecido: '+arg);
 }
 return parsed;
}

export function runReleaseReadiness(argv,now=new Date()){
 const opts=parseReleaseArgs(argv),evidence={};
 for(const [kind,path] of Object.entries(opts.paths)){
  evidence[kind]=JSON.parse(readFileSync(resolve(path),'utf8'));
 }
 const report=evaluateTemporalReadiness({
  sourceSha:opts.sourceSha,environment:opts.environment,evidence,now,
 });
 return {report,exitCode:opts.mode==='gate'&&!report.technical_evidence_complete?2:0};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {report,exitCode}=runReleaseReadiness(process.argv.slice(2));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(error){
  process.stderr.write('Gate temporal bloqueado: '+
   (error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
