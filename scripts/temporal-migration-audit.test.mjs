import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {loadMigrationCatalog,analyzeMigrationCatalog,
 REQUIRED_TEMPORAL_OBJECTS,runMigrationAudit,parseMigrationAuditArgs} from './temporal-migration-audit.mjs';
import {inspectTemporalSchema,runTemporalInventory} from './temporal-db-inventory.mjs';

const sha='a'.repeat(64);
const cleanCatalog=()=>({
 migrations:[{tag:'0000_sample',number:0,sha256:sha}],
 journal:{entries:[{idx:0,tag:'0000_sample',when:100000}]},
});
const inventory=()=>({
 format_version:1,
 migration_registry_present:true,
 migration_records:[{hash:sha,created_at:'100000'}],
 objects:Object.fromEntries(REQUIRED_TEMPORAL_OBJECTS.map(k=>[k,true])),
});

describe('Lote 12 · verificador de histórico não mutante',()=>{
 it('identifica a dívida factual sem afirmar prontidão da produção',()=>{
  const {report,exitCode}=runMigrationAudit(['--report']);
  assert.equal(exitCode,0);
  assert.equal(report.ready_for_deploy,false);
  assert.ok(report.summary.sql_files>=69);
  assert.ok(report.summary.journal_entries>=42);
  assert.ok(report.missing_journal_tags.includes('0036_seed_legacy_houses_state'));
  assert.ok(report.missing_journal_tags.includes('0041_campaign_translations'));
  assert.ok(report.missing_journal_tags.includes('0067_temporal_release_preflight'));
  assert.deepEqual(report.repeated_ordinal_files['0041'],
   ['0041_campaign_translations','0041_seed_complete_noble_house_possessions']);
  assert.ok(report.problems.some(p=>p.code==='NO_PRODUCTION_INVENTORY'));
  assert.ok(report.problems.some(p=>p.code==='UNJOURNALED_SQL'));
  assert.ok(report.problems.some(p=>p.code==='NON_CANONICAL_JOURNAL_SEQUENCE'));
  assert.equal(runMigrationAudit(['--gate']).exitCode,2);
  const tags=loadMigrationCatalog().migrations.map(m=>m.tag);
  assert.equal(new Set(tags).size,tags.length);
 });
 it('recusa drift desconhecido e detecta hash divergente e inventário incompleto',()=>{
  assert.equal(analyzeMigrationCatalog(cleanCatalog(),inventory()).ready_for_deploy,true);
  const changed=inventory();
  changed.migration_records[0].hash='b'.repeat(64);
  assert.ok(analyzeMigrationCatalog(cleanCatalog(),changed).problems
   .some(p=>p.code==='DB_MIGRATION_HASH_MISMATCH'));
  const missing=inventory();
  missing.objects['public.campaign_time_operations']=false;
  assert.ok(analyzeMigrationCatalog(cleanCatalog(),missing).problems
   .some(p=>p.code==='MISSING_TEMPORAL_OBJECT'));
  const extra=inventory();
  extra.migration_records.push({hash:sha,created_at:'not-registered'});
  assert.ok(analyzeMigrationCatalog(cleanCatalog(),extra).problems
   .some(p=>p.code==='UNRECOGNIZED_DB_MIGRATION'));
  const noTable=inventory();
  noTable.migration_registry_present=false;noTable.migration_records=[];
  assert.ok(analyzeMigrationCatalog(cleanCatalog(),noTable).problems
   .some(p=>p.code==='MISSING_DB_MIGRATION_REGISTRY'));
 });
 it('impede inventário implícito e aceita apenas argumentos declarados',async()=>{
  assert.deepEqual(parseMigrationAuditArgs(['--gate','--inventory','x.json']),
   {mode:'gate',inventoryPath:'x.json'});
  assert.throws(()=>parseMigrationAuditArgs(['--apply']),/Argumento inválido/);
  await assert.rejects(()=>runTemporalInventory([],'postgres://example/test'),/--read-only/);
  await assert.rejects(()=>runTemporalInventory(['--read-only'],''),/CORMYR_AUDIT_DATABASE_URL/);
 });
 it('consulta apenas catálogo e registry, sem SELECT em Casas ou textos privados',async()=>{
  const statements=[];
  const fake={
   unsafe:async(query,parameters=[])=>{
    statements.push({query,parameters});
    if(query.includes("SELECT id, hash, created_at FROM drizzle.__drizzle_migrations"))
     return [{id:1,hash:sha,created_at:100000}];
    return [{present:true}];
   },
  };
  const result=await inspectTemporalSchema(fake);
  assert.equal(result.migration_registry_present,true);
  assert.equal(result.migration_records.length,1);
  assert.ok(Object.values(result.objects).every(Boolean));
  assert.ok(statements.every(s=>/^\s*SELECT /i.test(s.query)));
  assert.ok(statements.every(s=>!/noble_house_sheets|campaign_letters|campaign_players|auth\.users/.test(s.query)));
  assert.ok(statements.every(s=>!/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(s.query)));
  const withoutTable={unsafe:async(query)=>query.includes('drizzle.__drizzle_migrations')
   ?[{present:false}]:[{present:true}]};
  const noReg=await inspectTemporalSchema(withoutTable);
  assert.equal(noReg.migration_records.length,0);
  assert.equal(noReg.migration_registry_present,false);
 });
 it('não autoriza deploy com histórico canônico porém sem prova real de aplicação',()=>{
  const partial=inventory();partial.migration_records=[];
  const report=analyzeMigrationCatalog(cleanCatalog(),partial);
  assert.equal(report.ready_for_deploy,false);
  assert.ok(report.problems.some(p=>p.code==='JOURNAL_RECORDS_NOT_PROVEN'));
 });
});
