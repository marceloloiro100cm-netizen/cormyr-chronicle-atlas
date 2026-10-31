import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTemporalReadiness,parseReleaseArgs,runReleaseReadiness}
 from './temporal-release-readiness.mjs';

const SHA='a'.repeat(40);
const NOW=new Date('2026-10-31T20:00:00.000Z');
const catalog={migrations:[
 {tag:'0000_baseline',number:0,sha256:'f'.repeat(64)},
 ],journal:{entries:[{idx:0,tag:'0000_baseline',when:1}]}};
const stack={
 format_version:1,repository:'marceloloiro100cm-netizen/cormyr-chronicle-atlas',
 excluded_alternative_prs:[129],sequence:[
 {pr:127,head:'a',base:'main'},
 {pr:128,head:'b',base:'a'},
 ]};
const reports={
 migration:{ready_for_deploy:true,inventory_verified:true,problems:[],
  summary:{unjournaled:0,repeated_sql_ordinals:0,sql_files:1,journal_entries:1}},
 contracts:{contract_ok:true,production_release_authorized:false,
  checks:Array.from({length:16},(_,i)=>({name:String(i),passed:true}))},
 stack:{chain_consistent:true,live_verified:true,all_merged:true,
  release_authorized:false,errors:[]},
 ci:{conclusion:'success',jobs:{validate:'success','mail-database':'success'}},
 operations:{backup_restored:true,representative_homologation:true,
  role_based_rls_test:true,migration_history_reconciled:true,
  rollback_rehearsed:true,window_authorized:true},
};
function input(){
 return {
  sourceSha:SHA,environment:'homologation',now:NOW,
  localCatalog:structuredClone(catalog),localStack:structuredClone(stack),
  evidence:Object.fromEntries(Object.entries(reports).map(([kind,report])=>[
   kind,{format_version:1,kind,environment:'homologation',source_sha:SHA,
    observed_at:'2026-10-31T19:00:00.000Z',report:structuredClone(report)},
  ])),
 };
}
describe('Lote 14 · controle Go/No-Go sem conceder acesso a produção',()=>{
 it('falha fechado na branch real, pois a migração continua irregular',()=>{
  const report=evaluateTemporalReadiness({now:NOW});
  assert.equal(report.go_no_go,'NO_GO');
  assert.equal(report.technical_evidence_complete,false);
  assert.equal(report.production_release_authorized,false);
  assert.equal(report.any_operation_performed,false);
  assert.ok(report.local_baseline.unjournaled>=27);
  assert.ok(report.blockers.some(b=>b.code==='LOCAL_MIGRATION_CATALOG'));
  assert.equal(runReleaseReadiness(['--gate'],NOW).exitCode,2);
  assert.equal(runReleaseReadiness(['--report'],NOW).exitCode,0);
 });
 it('não transforma evidências declaradas em autorização de produção',()=>{
  const report=evaluateTemporalReadiness(input());
  assert.equal(report.technical_evidence_complete,true);
  assert.equal(report.go_no_go,'MANUAL_APPROVAL_REQUIRED');
  assert.equal(report.production_release_authorized,false);
  assert.equal(report.merge_authorized,false);
  assert.equal(report.migration_execution_authorized,false);
  assert.equal(report.external_evidence_unverified,true);
  assert.equal(report.blockers.length,0);
 });
 it('recusa SHA diferente ou evidência de outro ambiente',()=>{
  const wrong=input();wrong.evidence.ci.source_sha='b'.repeat(40);
  const a=evaluateTemporalReadiness(wrong);
  assert.equal(a.go_no_go,'NO_GO');
  assert.ok(a.blockers.some(b=>b.code==='CI_EVIDENCE'));
  const bad=input();bad.evidence.operations.environment='production';
  assert.ok(evaluateTemporalReadiness(bad).blockers.some(b=>b.code==='OPERATIONS_EVIDENCE'));
 });
 it('rejeita relatório velho, futuro e sem data válida',()=>{
  for(const time of ['2026-10-29T19:00:00Z','2026-11-01T19:00:00Z','yesterday']){
   const args=input();args.evidence.migration.observed_at=time;
   assert.equal(evaluateTemporalReadiness(args).technical_evidence_complete,false);
  }
 });
 it('rejeita histórico ou testes incompletos e cadeia não integrada',()=>{
  const missing=input();missing.evidence.stack.report.all_merged=false;
  assert.ok(evaluateTemporalReadiness(missing).blockers.some(b=>b.code==='PR_CHAIN_INTEGRATED'));
  const noDb=input();noDb.evidence.migration.report.summary.unjournaled=1;
  assert.ok(evaluateTemporalReadiness(noDb).blockers.some(b=>b.code==='MIGRATION_RECONCILED'));
  const noRls=input();noRls.evidence.contracts.report.checks[5].passed=false;
  assert.ok(evaluateTemporalReadiness(noRls).blockers.some(b=>b.code==='CONTRACTS_APPROVED'));
  const ci=input();ci.evidence.ci.report.jobs.validate='failure';
  assert.ok(evaluateTemporalReadiness(ci).blockers.some(b=>b.code==='CI_GREEN'));
  const backup=input();backup.evidence.operations.report.backup_restored=false;
  assert.ok(evaluateTemporalReadiness(backup).blockers.some(b=>b.code==='OPERATOR_CHECKLIST'));
 });
 it('detecta divergência do catálogo mesmo com evidência externa artificialmente verde',()=>{
  const arg=input();
  arg.localCatalog.migrations.push({tag:'0001_extra',number:1,sha256:'f'.repeat(64)});
  assert.ok(evaluateTemporalReadiness(arg).blockers.some(b=>b.code==='LOCAL_MIGRATION_CATALOG'));
 });
 it('argumentos requerem valores explícitos e nunca oferecem comando deploy',()=>{
  assert.deepEqual(parseReleaseArgs(['--gate','--sha',SHA,'--environment','homologation']),
   {mode:'gate',sourceSha:SHA,environment:'homologation',paths:{}});
  assert.throws(()=>parseReleaseArgs(['--deploy']),/desconhecido/);
  assert.throws(()=>parseReleaseArgs(['--migration']),/sem valor/);
  assert.throws(()=>parseReleaseArgs(['--production']),/desconhecido/);
 });
});
