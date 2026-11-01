/**
 * Inventário somente leitura de um banco escolhido explicitamente pelo operador.
 *
 * NÃO usa automaticamente LOVABLE_DB_MIGRATION_URL ou a conexão do site.
 * Requer:
 *   CORMYR_AUDIT_DATABASE_URL=... node scripts/temporal-db-inventory.mjs --read-only
 *
 * Use uma credencial com SELECT/pg_catalog e preferência por replica/homologação.
 * O JSON não contém textos de Casas, jogadores, cartas, nomes ou credenciais.
 * O registro Drizzle, quando existe, é usado como EVIDÊNCIA, nunca como
 * instrução para reaplicar, registrar ou alterar uma migração.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {REQUIRED_TEMPORAL_OBJECTS} from './temporal-migration-audit.mjs';

const tableNames=new Set([
 'public.campaign_calendar','public.campaign_time_operations',
 'public.campaign_temporal_consumers','public.campaign_temporal_deliveries',
 'public.campaign_temporal_delivery_resolutions',
 'public.campaign_temporal_effect_checkpoints',
]);
const functionSignatures={
 'public.publish_campaign_time_change':
  'public.publish_campaign_time_change(integer,uuid,text,text,integer,text,boolean)',
 'public.get_temporal_release_preflight':
  'public.get_temporal_release_preflight()',
};

/**
 * Leitura de catálogo explícita, sem varrer dados de usuários/objetos sigilosos.
 * Executar dentro de uma transação read-only. Não conceder acesso direto a
 * tabelas do Hub Temporal.
 */
export async function inspectTemporalSchema(transaction){
 const found={};
 for(const name of REQUIRED_TEMPORAL_OBJECTS){
  if(tableNames.has(name)){
   const rows=await transaction.unsafe(
    'SELECT to_regclass($1) IS NOT NULL AS present',[name]);
   found[name]=rows[0]?.present===true;
  }else{
   const rows=await transaction.unsafe(
    'SELECT to_regprocedure($1) IS NOT NULL AS present',[functionSignatures[name]]);
   found[name]=rows[0]?.present===true;
  }
 }
 const marker=await transaction.unsafe(
  "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present");
 const present=marker[0]?.present===true;
 let migrationRecords=[];
 if(present){
  // Identificador estático, nunca interpolado do usuário.
  const rows=await transaction.unsafe(
   'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id');
  migrationRecords=rows.map(row=>({
   hash:String(row.hash),created_at:String(row.created_at),
  }));
 }
 return {format_version:1,migration_registry_present:present,
  migration_records:migrationRecords,objects:found};
}
export async function runTemporalInventory(argv,connectionUrl){
 if(argv.length!==1||argv[0]!=='--read-only')
  throw new Error('Operação proibida: exige argumento explícito --read-only');
 if(!connectionUrl||!/^postgres(ql)?:\/\//i.test(connectionUrl))
  throw new Error('Defina CORMYR_AUDIT_DATABASE_URL para o banco a auditar.');
 const {default:postgres}=await import('postgres');
 const sql=postgres(connectionUrl,{max:1,prepare:false,application_name:'cormyr-temporal-readonly-audit'});
 try{
  return await sql.begin(async transaction=>{
   // SET TRANSACTION deve ser a primeira instrução da transação.
   await transaction.unsafe('SET TRANSACTION READ ONLY');
   return inspectTemporalSchema(transaction);
  });
 }finally{
  await sql.end();
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=await runTemporalInventory(process.argv.slice(2),process.env.CORMYR_AUDIT_DATABASE_URL);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(error){
  process.stderr.write('Inventário não realizado: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
