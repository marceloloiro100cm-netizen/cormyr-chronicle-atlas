import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {loadMigrationCatalog} from './temporal-migration-audit.mjs';
import {buildTemporalStatusTemplate,evaluateTemporalMigrationSequence,
 loadReplayRisks,parseSequenceArgs,runSequencePlan}
 from './temporal-migration-sequence.mjs';

const NOW=new Date('2026-10-31T23:30:00.000Z');
const SHA='a'.repeat(40);
const opts={sourceSha:SHA,environment:'homologation',now:NOW};
const actualCatalog=loadMigrationCatalog();
const recordedTags=new Set(actualCatalog.journal.entries.map(row=>row.tag));
const unjournaledCount=actualCatalog.migrations.filter(row=>!recordedTags.has(row.tag)).length;
const risks=loadReplayRisks();
const temporal=actualCatalog.migrations.filter(m=>/^006[0-7]_/.test(m.tag));

function cleanedCatalog(){
 const rows=structuredClone(temporal);
 return {migrations:rows,journal:{entries:rows.map((r,i)=>({
  idx:i,tag:r.tag,when:1000+i,
 }))}};
}
function proof(catalog=cleanedCatalog(),state='not_applied'){
 const e=buildTemporalStatusTemplate(catalog,opts);
 e.records=e.records.map(r=>({
  ...r,state,deployment_evidence_ref:'log-interno-verificado',
  schema_evidence_ref:'comparacao-ddl-interna',
 }));
 e.legacy_history_reconciled=true;
 e.historical_collision_0041_resolved=true;
 e.migration_strategy_reviewed=true;
 e.operator='operador-tecnico';
 e.independent_reviewer='auditor-independente';
 e.reviewed_at='2026-10-31T22:10:00Z';
 return e;
}
const codes=report=>report.blockers.map(b=>b.code);

describe('Lote 17 · planejamento bloqueado por estado e ordem de migration',()=>{
 it('mantém cenário real em NO_GO, mesmo com fatos do ensaio anteriores',()=>{
  const r=evaluateTemporalMigrationSequence(actualCatalog,null,opts);
  assert.equal(r.go_no_go,'NO_GO');
  assert.equal(r.candidate_status,'BLOCKED');
  assert.equal(r.reviewed_candidate_suffix.length,0);
  assert.equal(r.historical_sql_without_journal,unjournaledCount);
  assert.ok(unjournaledCount>=29);
  assert.equal(r.chronological_temporal_order.length,8);
  assert.ok(codes(r).includes('LOCAL_CATALOG_UNJOURNALED_SQL'));
  assert.ok(codes(r).includes('LOCAL_CATALOG_AMBIGUOUS_SQL_ORDINAL'));
  assert.ok(codes(r).includes('STATUS_EVIDENCE_MISSING'));
  assert.equal(r.production_release_authorized,false);
  assert.equal(r.execute_migrations,false);
  assert.equal(r.updates_drizzle_journal,false);
  assert.equal(runSequencePlan(['--report']).exitCode,0);
 });
 it('consome manifest de CI com oito blobs reais sem divergência',()=>{
  const c=cleanedCatalog();
  const r=evaluateTemporalMigrationSequence(c,proof(c),opts);
  assert.equal(r.candidate_status,'REVIEW_ONLY_NOT_EXECUTABLE');
  assert.equal(r.reviewed_candidate_suffix.length,8);
  assert.ok(!codes(r).some(x=>x.startsWith('REPLAY_')));
  assert.equal(r.go_no_go,'NO_GO');
  assert.equal(r.execute_migrations,false);
  assert.equal(r.external_evidence_is_authenticated,false);
  assert.equal(r.replay_risk_facts.ci_run_id,41241607317);
  assert.equal(r.replay_risk_facts.downgrade_if_0066_replayed_after_0067,true);
 });
 it('não sugere reaplicar scripts que o operador declara aplicados',()=>{
  const c=cleanedCatalog(),e=proof(c);
  e.records.slice(0,6).forEach(x=>{x.state='applied';});
  const r=evaluateTemporalMigrationSequence(c,e,opts);
  assert.equal(r.candidate_status,'REVIEW_ONLY_NOT_EXECUTABLE');
  assert.deepEqual(r.reviewed_candidate_suffix,[
   '0066_temporal_consumer_outbox','0067_temporal_release_preflight',
  ]);
  assert.equal(r.execute_migrations,false);
 });
 it('bloqueia lacuna cronológica, sobretudo 0066 pendente após 0067',()=>{
  const c=cleanedCatalog(),e=proof(c,'applied');
  e.records[6].state='not_applied';
  const r=evaluateTemporalMigrationSequence(c,e,opts);
  assert.equal(r.candidate_status,'BLOCKED');
  assert.deepEqual(r.reviewed_candidate_suffix,[]);
  assert.ok(codes(r).includes('NON_PREFIX_APPLICATION'));
 });
 it('bloqueia estado desconhecido, referências falsas e hashes divergentes',()=>{
  const c=cleanedCatalog(),e=proof(c);
  e.records[2].state='unknown';
  e.records[1].file_sha256='b'.repeat(64);
  e.records[7].schema_evidence_ref='';
  const r=evaluateTemporalMigrationSequence(c,e,opts);
  assert.ok(codes(r).includes('UNKNOWN_APPLICATION_STATE'));
  assert.ok(codes(r).includes('FILE_HASH_MISMATCH'));
  assert.ok(codes(r).includes('SCHEMA_NOT_VERIFIED'));
  assert.equal(r.reviewed_candidate_suffix.length,0);
 });
 it('evidências de outro commit ou ambiente não sustentam a análise',()=>{
  const c=cleanedCatalog(),e=proof(c);
  e.source_sha='b'.repeat(40);
  assert.ok(codes(evaluateTemporalMigrationSequence(c,e,opts))
   .includes('STATUS_EVIDENCE_MISSING'));
  e.source_sha=SHA;e.environment='production';
  assert.ok(codes(evaluateTemporalMigrationSequence(c,e,opts))
   .includes('STATUS_EVIDENCE_MISSING'));
 });
 it('exige resolução legada, independência de revisão e data válida',()=>{
  const c=cleanedCatalog(),e=proof(c);
  e.legacy_history_reconciled=false;
  e.independent_reviewer=e.operator;
  e.reviewed_at='2030-01-01T00:00:00Z';
  const r=evaluateTemporalMigrationSequence(c,e,opts);
  assert.ok(codes(r).includes('HISTORICAL_APPROVAL_REQUIRED'));
  assert.ok(codes(r).includes('INDEPENDENT_REVIEW_REQUIRED'));
  assert.ok(codes(r).includes('REVIEW_DATE_INVALID'));
  assert.equal(r.candidate_status,'BLOCKED');
 });
 it('rejeita registros duplicados e estranhos',()=>{
  const c=cleanedCatalog(),e=proof(c);
  e.records.push({...e.records[0]},{...e.records[0],tag:'0070_nonexistent'});
  const r=evaluateTemporalMigrationSequence(c,e,opts);
  assert.ok(codes(r).includes('STATUS_DUPLICATE'));
  assert.ok(codes(r).includes('STATUS_UNEXPECTED_TAG'));
  assert.equal(r.candidate_status,'BLOCKED');
 });
 it('detecta mudança no manifesto fixado da execução do CI',()=>{
  const c=cleanedCatalog(),e=proof(c),m=structuredClone(risks);
  m.results[0].file_git_blob_sha='b'.repeat(40);
  const r=evaluateTemporalMigrationSequence(c,e,{...opts,replayRisks:m});
  assert.ok(codes(r).includes('REPLAY_RECORD_DRIFT'));
  assert.equal(r.candidate_status,'BLOCKED');
  const bad=structuredClone(risks);
  bad.results.find(x=>x.tag==='0066_temporal_consumer_outbox')
   .season_fix_regressed_in_clone=false;
  const x=evaluateTemporalMigrationSequence(c,e,{...opts,replayRisks:bad});
  assert.ok(codes(x).includes('REPLAY_RISK_MISMATCH'));
 });
 it('o template inicia tudo desconhecido e nenhum modo executa migrations',()=>{
  const template=buildTemporalStatusTemplate(cleanedCatalog(),opts);
  assert.equal(template.records.length,8);
  assert.ok(template.records.every(r=>r.state==='unknown'));
  assert.equal(template.legacy_history_reconciled,false);
  assert.throws(()=>parseSequenceArgs(['--apply']),/desconhecido/);
  assert.throws(()=>parseSequenceArgs(['--force']),/desconhecido/);
  assert.throws(()=>parseSequenceArgs(['--check']),/exige --evidence/);
  assert.throws(()=>parseSequenceArgs(['--template']),/exige --sha/);
 });
});
