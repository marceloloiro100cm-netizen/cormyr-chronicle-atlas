/** Cormyr full-migration inventory. Never exports private rows or credentials.
 *
 * This is a READ-ONLY compatibility check, not a database export/restore tool.
 * Run only from a trusted operator machine with an explicitly provided URL.
 * A matching report is insufficient to authorize cutover.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const MIGRATION_TABLES=Object.freeze([
  'auth.users','auth.identities','auth.mfa_factors',
  'public.campaign_players','public.house_memberships',
  'public.campaign_houses','public.campaign_letters','public.letter_replies',
  'public.letter_receipts','public.campaign_records',
  'public.campaign_characters','public.campaign_private_gm_content',
  'public.noble_house_sheets','public.noble_house_ledger',
  'public.campaign_time_operations',
  'storage.buckets','storage.objects'
]);
export const FORMAT_VERSION=1;

export function assertInventory(snapshot){
  if(!snapshot||typeof snapshot!=='object'||snapshot.format_version!==FORMAT_VERSION
     ||!snapshot.tables||typeof snapshot.tables!=='object'||Array.isArray(snapshot.tables))
    throw new Error('Inventário inválido ou versão não suportada');
  const tableKeys=Object.keys(snapshot.tables);
  if(tableKeys.length!==MIGRATION_TABLES.length || tableKeys.some(k=>!MIGRATION_TABLES.includes(k)))
    throw new Error('Inventário incompleto ou contém objetos inesperados');
  for(const name of MIGRATION_TABLES){
    const v=snapshot.tables[name];
    if(!v||typeof v!=='object'||typeof v.present!=='boolean'
      ||(v.present ? !/^(0|[1-9][0-9]*)$/.test(v.count) : v.count!==null))
      throw new Error('Contagem inválida para '+name);
  }
  return snapshot;
}

/** Return only category names; never display row contents or secrets. */
export function compareInventories(source,destination){
  assertInventory(source);assertInventory(destination);
  const mismatches=[]; const missing=[];
  for(const name of MIGRATION_TABLES){
    const a=source.tables[name], b=destination.tables[name];
    if(!a.present||!b.present)missing.push(name);
    else if(a.count!==b.count)mismatches.push(name);
  }
  return {
    format_version:FORMAT_VERSION,
    checked_categories:MIGRATION_TABLES.length,
    missing_categories:missing,
    differing_counts:mismatches,
    aggregate_counts_match:missing.length===0&&mismatches.length===0,
    // Counts do NOT prove row, policy, attachment-byte or password-hash equality.
    users_and_password_hashes_validated:false,
    storage_file_bytes_validated:false,
    rls_permissions_validated:false,
    functional_login_validated:false,
    cutover_authorized:false
  };
}

export async function captureInventory(databaseUrl){
  if(!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl))
    throw new Error('Informe CORMYR_MIGRATION_AUDIT_DATABASE_URL em ambiente seguro.');
  const {default:postgres}=await import('postgres');
  const sql=postgres(databaseUrl,{max:1,prepare:false,application_name:'cormyr-full-migration-read-only'});
  try{
    return await sql.begin(async tx=>{
      // Before every SELECT, the transaction is explicitly read-only.
      await tx.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tables={};
      for(const name of MIGRATION_TABLES){
        const [state]=await tx.unsafe('SELECT to_regclass($1) IS NOT NULL AS present',[name]);
        if(!state?.present){tables[name]={present:false,count:null};continue;}
        // Identifier is sourced from the above immutable allowlist, never user input.
        const [row]=await tx.unsafe('SELECT count(*)::text AS count FROM '+name);
        tables[name]={present:true,count:row.count};
      }
      return {format_version:FORMAT_VERSION,tables};
    });
  }finally{await sql.end();}
}
export async function run(argv,env=process.env){
  if(argv.length===1&&argv[0]==='--snapshot'){
    return captureInventory(env['CORMYR_MIGRATION_AUDIT_DATABASE_URL']);
  }
  if(argv.length===3&&argv[0]==='--compare'){
    const source=JSON.parse(readFileSync(argv[1],'utf8'));
    const destination=JSON.parse(readFileSync(argv[2],'utf8'));
    return compareInventories(source,destination);
  }
  throw new Error('Uso: --snapshot OU --compare <source.json> <destination.json>. Nunca executa migrações.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run(process.argv.slice(2)).then(report=>{
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if('aggregate_counts_match' in report && !report.aggregate_counts_match)process.exitCode=2;
  }).catch(e=>{
    process.stderr.write('Inventário não concluído: '+(e instanceof Error?e.message:String(e))+'\n');
    process.exitCode=2;
  });
}
