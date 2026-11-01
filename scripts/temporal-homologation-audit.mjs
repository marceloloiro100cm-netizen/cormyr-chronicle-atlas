/**
 * Lote 13 · inspeção de contratos em um banco explícito e somente leitura.
 *
 * Execução OPT-IN:
 * CORMYR_AUDIT_DATABASE_URL=... node scripts/temporal-homologation-audit.mjs --read-only
 *
 * Não usa LOVABLE_DB_MIGRATION_URL; não escreve, não publica datas e
 * não executa as funções administrativas SECURITY DEFINER.
 * Contratos de estrutura são evidência parcial, não prova de deploy.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const TEMPORAL_PRIVATE_TABLES=Object.freeze([
 'public.campaign_temporal_consumers',
 'public.campaign_temporal_deliveries',
 'public.campaign_temporal_delivery_resolutions',
 'public.campaign_temporal_effect_checkpoints',
]);
export const TEMPORAL_ADMIN_FUNCTIONS=Object.freeze([
 'public.get_temporal_release_preflight()',
 'public.get_temporal_consumer_dashboard(integer)',
 'public.replay_temporal_delivery(uuid)',
 'public.resolve_temporal_delivery(uuid,uuid,text,text)',
 'public.get_campaign_time_history(integer)',
 'public.preview_campaign_time_change(integer,text,text,integer,boolean)',
 'public.publish_campaign_time_change(integer,uuid,text,text,integer,text,boolean)',
]);
const fail=(name,detail)=>({name,passed:false,detail});
const pass=(name)=>({name,passed:true});

export async function inspectTemporalContracts(tx){
 const checks=[];
 for(const table of TEMPORAL_PRIVATE_TABLES){
  const rows=await tx.unsafe(
   "SELECT c.relrowsecurity AS rls_enabled, "+
   "has_table_privilege('anon',c.oid,'SELECT') AS anon_read, "+
   "has_table_privilege('authenticated',c.oid,'SELECT') AS player_read, "+
   "has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') AS anon_write, "+
   "has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS player_write "+
   "FROM pg_catalog.pg_class c WHERE c.oid=to_regclass($1)",[table]);
  const v=rows[0];
  checks.push(v?.rls_enabled===true&&!v.anon_read&&!v.player_read&&!v.anon_write&&!v.player_write?
   pass('private:'+table):fail('private:'+table,'RLS ausente, grants excessivos ou objeto não encontrado'));
 }
 for(const signature of TEMPORAL_ADMIN_FUNCTIONS){
  const rows=await tx.unsafe(
   "SELECT has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute "+
   "FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure($1)",[signature]);
  checks.push(rows[0]?.anon_can_execute===false?
   pass('rpc:'+signature):fail('rpc:'+signature,'RPC inexistente ou disponível ao papel anon'));
 }
 {
  const rows=await tx.unsafe(
   "SELECT p.prosecdef AS security_definer,p.provolatile AS volatility "+
   "FROM pg_catalog.pg_proc p "+
   "WHERE p.oid=to_regprocedure('public.get_temporal_release_preflight()')");
  checks.push(rows[0]?.security_definer===true&&rows[0]?.volatility==='s'?
   pass('preflight:stable-security-definer'):
   fail('preflight:stable-security-definer','Pré-voo não é STABLE SECURITY DEFINER'));
 }
 {
  const rows=await tx.unsafe(
   "SELECT count(*)::integer AS total FROM pg_catalog.pg_trigger "+
   "WHERE tgrelid=to_regclass('public.campaign_time_operations') "+
   "AND tgname='enqueue_campaign_temporal_consumers' "+
   "AND NOT tgisinternal AND tgenabled IN ('O','A')");
  checks.push(rows[0]?.total===1?pass('trigger:consumer-outbox'):
   fail('trigger:consumer-outbox','Gatilho da outbox ausente, desativado ou duplicado'));
 }
 {
  const rows=await tx.unsafe(
   "SELECT count(*)::integer AS total FROM pg_catalog.pg_constraint "+
   "WHERE conrelid=to_regclass('public.campaign_temporal_deliveries') "+
   "AND contype='u' AND array_length(conkey,1)=2");
  checks.push(rows[0]?.total>=1?pass('delivery:unique-pair'):
   fail('delivery:unique-pair','Chave exclusiva operação/consumidor não demonstrada'));
 }
 {
  const rows=await tx.unsafe(
   "SELECT has_function_privilege('anon',"+
   "'public.get_public_campaign_time()','EXECUTE') AS accessible");
  checks.push(rows[0]?.accessible===true?pass('public-clock:rpc-executable'):
   fail('public-clock:rpc-executable','Relógio público não está disponível'));
 }
 // Executar apenas o contrato de divulgação da data. Não lê fichas,
 // recursos, identidade dos participantes nem histórico das missivas.
 let publicClock=null;
 try{
  const rows=await tx.unsafe('SELECT public.get_public_campaign_time() AS clock');
  publicClock=rows[0]?.clock??null;
 }catch{
  checks.push(fail('public-clock:snapshot','Data pública indisponível'));
 }
 if(publicClock!==null){
  const allowed=['year','month','day','festival','version'];
  const keys=publicClock&&typeof publicClock==='object'?Object.keys(publicClock):[];
  const correct=keys.length===allowed.length&&keys.every(k=>allowed.includes(k));
  const valid=correct&&Number.isInteger(publicClock.year)&&publicClock.year>0&&
   Number.isInteger(publicClock.month)&&publicClock.month>=0&&publicClock.month<=11&&
   Number.isInteger(publicClock.day)&&publicClock.day>=1&&publicClock.day<=30&&
   (publicClock.festival===null||typeof publicClock.festival==='string')&&
   Number.isInteger(publicClock.version)&&publicClock.version>0;
  checks.push(valid?pass('public-clock:five-fields-only'):
   fail('public-clock:five-fields-only','Data pública inválida ou excede o contrato de cinco campos'));
 }
 return {
  format_version:1,
  contract_ok:checks.length===TEMPORAL_PRIVATE_TABLES.length+
    TEMPORAL_ADMIN_FUNCTIONS.length+5&&checks.every(c=>c.passed),
  production_release_authorized:false,
  requires_migration_reconciliation:true,
  requires_real_homologation:true,
  checks,
 };
}

export async function runTemporalHomologation(argv,connectionUrl){
 if(argv.length!==1||argv[0]!=='--read-only')
  throw new Error('Requer --read-only: inspeção de homologação nunca executa DDL.');
 if(!connectionUrl||!/^postgres(ql)?:\/\//i.test(connectionUrl))
  throw new Error('Configure CORMYR_AUDIT_DATABASE_URL para o banco autorizado.');
 const {default:postgres}=await import('postgres');
 const sql=postgres(connectionUrl,{max:1,prepare:false,
  application_name:'cormyr-temporal-contract-audit'});
 try{
  return await sql.begin(async tx=>{
   await tx.unsafe('SET TRANSACTION READ ONLY');
   return inspectTemporalContracts(tx);
  });
 }finally{await sql.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=await runTemporalHomologation(process.argv.slice(2),
   process.env.CORMYR_AUDIT_DATABASE_URL);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.contract_ok)process.exitCode=2;
 }catch(error){
  process.stderr.write('Pré-voo indisponível: '+
   (error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
