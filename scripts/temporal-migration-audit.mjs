/**
 * Auditoria local e fail-closed do histórico de migrações.
 * NUNCA executa SQL, altera _journal.json ou marca migrations como aplicadas.
 *
 * Uso:
 *   node scripts/temporal-migration-audit.mjs --report
 *   node scripts/temporal-migration-audit.mjs --report --inventory /caminho/inventory.json
 *   node scripts/temporal-migration-audit.mjs --gate --inventory /caminho/inventory.json
 *
 * Relatório não equivale a autorização. --gate falha se existir qualquer lacuna
 * de diário, ambiguidade, mismatch de hash ou evidência faltante de produção.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REQUIRED_TEMPORAL_OBJECTS=Object.freeze([
 'public.campaign_calendar',
 'public.campaign_time_operations',
 'public.campaign_temporal_consumers',
 'public.campaign_temporal_deliveries',
 'public.campaign_temporal_delivery_resolutions',
 'public.campaign_temporal_effect_checkpoints',
 'public.publish_campaign_time_change',
 'public.get_temporal_release_preflight',
]);

const rootDefault=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tagFor=(name)=>name.slice(0,-4);
const numberFor=(tag)=>/^\d{4}_/.test(tag)?Number(tag.slice(0,4)):null;
const sha256=(text)=>createHash('sha256').update(text,'utf8').digest('hex');
const uniq=(items)=>[...new Set(items)];
const issue=(code,detail)=>({code,detail});

export function loadMigrationCatalog(root=rootDefault){
 const dir=join(root,'drizzle/migrations');
 const migrations=readdirSync(dir)
  .filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort()
  .map(name=>{
   const content=readFileSync(join(dir,name),'utf8');
   return {tag:tagFor(name),number:numberFor(tagFor(name)),sha256:sha256(content)};
  });
 const journal=JSON.parse(readFileSync(join(dir,'meta/_journal.json'),'utf8'));
 return {migrations,journal};
}

/** Não infere que objetos existentes provem a execução de uma migration. */
export function analyzeMigrationCatalog({migrations,journal},inventory=null){
 const problems=[];
 if(!journal||!Array.isArray(journal.entries)){
  problems.push(issue('INVALID_JOURNAL','Diário Drizzle ausente ou malformado'));
  return {ready_for_deploy:false,problems,inventory_verified:false};
 }
 const entries=journal.entries;
 const byTag=new Map(migrations.map(m=>[m.tag,m]));
 const journalTags=new Set(entries.map(e=>e.tag));
 const missingJournal=migrations.filter(m=>!journalTags.has(m.tag)).map(m=>m.tag);
 const missingFile=entries.filter(e=>!byTag.has(e.tag)).map(e=>e.tag);
 const repeatedOrdinals=uniq(migrations.map(m=>m.number))
  .filter(num=>num!==null&&migrations.filter(m=>m.number===num).length>1);
 const duplicatedEntries=uniq(entries.map(e=>e.tag)).filter(tag=>entries.filter(e=>e.tag===tag).length>1);
 const invalidSequence=entries.some((e,i)=>!Number.isSafeInteger(e.idx)||e.idx!==i||
  !Number.isSafeInteger(e.when)||(i>0&&e.when<=entries[i-1].when));

 if(missingJournal.length)problems.push(issue('UNJOURNALED_SQL',
  missingJournal.length+' migração(ões) SQL sem registro no _journal.json'));
 if(missingFile.length)problems.push(issue('JOURNAL_WITHOUT_SQL',
  missingFile.length+' registro(s) do diário sem arquivo SQL'));
 if(repeatedOrdinals.length)problems.push(issue('AMBIGUOUS_SQL_ORDINAL',
  'Prefixos numéricos repetidos: '+repeatedOrdinals.map(n=>String(n).padStart(4,'0')).join(', ')));
 if(duplicatedEntries.length)problems.push(issue('REPEATED_JOURNAL_TAG',
  'Tags repetidas: '+duplicatedEntries.join(', ')));
 if(invalidSequence)problems.push(issue('NON_CANONICAL_JOURNAL_SEQUENCE',
  'Há lacuna/ordenação inválida nos idx ou timestamps do diário; não reescrever automaticamente'));
 if(inventory===null){
  problems.push(issue('NO_PRODUCTION_INVENTORY',
   'Não há inventário read-only de um ambiente-alvo comprovado'));
 }else if(typeof inventory!=='object'||inventory===null||
   inventory.format_version!==1||typeof inventory.migration_registry_present!=='boolean'||
   !Array.isArray(inventory.migration_records)||!inventory.objects||
   typeof inventory.objects!=='object'){
  problems.push(issue('INVALID_INVENTORY','Inventário do banco não corresponde ao contrato v1'));
 }else{
  if(!inventory.migration_registry_present){
   problems.push(issue('MISSING_DB_MIGRATION_REGISTRY',
    'Tabela de registro de migrações Drizzle não encontrada no banco-alvo'));
  }
  for(const name of REQUIRED_TEMPORAL_OBJECTS){
   if(inventory.objects[name]!==true){
    problems.push(issue('MISSING_TEMPORAL_OBJECT',name+' não encontrado no banco-alvo'));
   }
  }
  const byWhen=new Map(entries.map(e=>[String(e.when),e.tag]));
  const seen=new Set();
  for(const row of inventory.migration_records){
   if(!row||!['string','number'].includes(typeof row.created_at)||
    typeof row.hash!=='string'||!(/^[0-9a-f]{64}$/i).test(row.hash)){
    problems.push(issue('INVALID_DB_RECORD','Registro de migração do banco com campos inválidos'));
    continue;
   }
   const when=String(row.created_at);
   const tag=byWhen.get(when);
   if(!tag){
    problems.push(issue('UNRECOGNIZED_DB_MIGRATION',
     'O banco registra uma migration com timestamp não mapeado no diário: '+when));
    continue;
   }
   if(seen.has(when)){
    problems.push(issue('DUPLICATE_DB_MIGRATION','Timestamp repetido no banco: '+when));
    continue;
   }
   seen.add(when);
   const expected=byTag.get(tag)?.sha256;
   if(!expected){
    problems.push(issue('DB_MIGRATION_WITHOUT_SQL','Registro do banco sem SQL atual: '+tag));
   }else if(row.hash.toLowerCase()!==expected.toLowerCase()){
    problems.push(issue('DB_MIGRATION_HASH_MISMATCH',
     'Hash SQL diferente do registro do banco: '+tag));
   }
  }
  // Um registro ausente no banco NÃO implica que o SQL não foi aplicado:
  // pode ter sido executado manualmente. Exige reconciliação humana.
  if(entries.some(e=>!seen.has(String(e.when)))){
   problems.push(issue('JOURNAL_RECORDS_NOT_PROVEN',
    'Não há prova de aplicação no registro do banco para todas as entradas do diário'));
  }
  if(missingJournal.length){
   problems.push(issue('UNTRACKED_MIGRATIONS_UNVERIFIED',
    'Arquivos fora do diário não podem ser considerados aplicados sem evidências individuais'));
  }
 }
 const foundDuplicates=Object.fromEntries(repeatedOrdinals.map(num=>[
  String(num).padStart(4,'0'),migrations.filter(m=>m.number===num).map(m=>m.tag),
 ]));
 return {
  format_version:1,
  ready_for_deploy:problems.length===0,
  inventory_verified:inventory!==null&&
   !problems.some(p=>['INVALID_INVENTORY','NO_PRODUCTION_INVENTORY'].includes(p.code)),
  summary:{sql_files:migrations.length,journal_entries:entries.length,
   unjournaled:missingJournal.length,journal_without_sql:missingFile.length,
   repeated_sql_ordinals:repeatedOrdinals.length,
   audited_registry_rows:inventory?.migration_records?.length??null},
  missing_journal_tags:missingJournal,
  missing_sql_tags:missingFile,
  repeated_ordinal_files:foundDuplicates,
  problems,
  sql_sha256:migrations.map(m=>({tag:m.tag,sha256:m.sha256})),
 };
}
export function parseMigrationAuditArgs(argv){
 let mode='report',inventoryPath=null;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--report')mode='report';
  else if(argv[i]==='--gate')mode='gate';
  else if(argv[i]==='--inventory'&&argv[i+1])inventoryPath=argv[++i];
  else throw new Error('Argumento inválido. Use --report, --gate e --inventory arquivo.json');
 }
 return {mode,inventoryPath};
}
export function runMigrationAudit(argv,root=rootDefault){
 const {mode,inventoryPath}=parseMigrationAuditArgs(argv);
 const inventory=inventoryPath?JSON.parse(readFileSync(resolve(inventoryPath),'utf8')):null;
 const report=analyzeMigrationCatalog(loadMigrationCatalog(root),inventory);
 return {report,exitCode:mode==='gate'&&!report.ready_for_deploy?2:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {report,exitCode}=runMigrationAudit(process.argv.slice(2));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=exitCode;
 }catch(error){
  process.stderr.write('Auditoria bloqueada: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=2;
 }
}
