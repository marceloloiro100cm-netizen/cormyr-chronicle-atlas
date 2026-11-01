import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {loadMigrationCatalog} from './temporal-migration-audit.mjs';
import {
 scanSqlReviewHints,buildReconciliationTemplate,
 reconcileMigrationEvidence,parseReconciliationArgs,runReconciliationPlan,
} from './temporal-reconciliation-plan.mjs';

const SHA='a'.repeat(40);
const NOW=new Date('2026-10-31T21:30:00Z');
const OPTIONS={sourceSha:SHA,environment:'homologation',now:NOW};
const catalog=loadMigrationCatalog();
const completeFile=(e)=>({
 ...e,
 disposition:'applied',
 deployment_log_ref:'internal-log-reference',
 schema_comparison_ref:'internal-ddl-comparison',
 operator:'technical-operator',
 reviewer:'independent-reviewer',
 reviewed_at:'2026-10-31T20:00:00Z',
});

function oneUntracked(tag='0067_temporal_release_preflight'){
 // This fixture verifies the proof contract without reclassifying the real journal.
 const clone=structuredClone(catalog);
 clone.journal.entries=clone.migrations
  .filter(x=>x.tag!==tag)
  .map((x,i)=>({idx:i,tag:x.tag,when:i+1}));
 return clone;
}

describe('Lote 15 · reconciliação por SQL com prova individual',()=>{
 it('mostra 28 arquivos ausentes, colisão 0041 e status de execução desconhecido',()=>{
  const report=reconcileMigrationEvidence(catalog,null,OPTIONS);
  assert.equal(report.total_sql,70);
  assert.equal(report.journal_entries,42);
  assert.equal(report.unjournaled_total,28);
  assert.equal(report.awaiting_evidence_total,28);
  assert.equal(report.evidenced_total,0);
  assert.deepEqual(report.duplicate_ordinals,['0041']);
  assert.equal(report.ready_for_deploy,false);
  assert.equal(report.journal_modified,false);
  assert.equal(report.migrations_applied_by_this_tool,0);
  assert.equal(report.production_release_authorized,false);
  assert.ok(report.files.some(f=>f.tag==='0041_campaign_translations'&&
   f.issues.includes('DUPLICATE_SQL_ORDINAL')));
  assert.ok(report.files.some(f=>f.tag==='0067_temporal_release_preflight'&&
   f.claimed_disposition==='unknown'));
  assert.equal(runReconciliationPlan(['--report']).exitCode,0);
  assert.equal(parseReconciliationArgs(['--report']).mode,'report');
 });
 it('gera folha com tags e SHA-256 exatos sem assumir status aplicado',()=>{
  const form=buildReconciliationTemplate(catalog,OPTIONS);
  assert.equal(form.files.length,28);
  assert.equal(form.files[0].disposition,'unknown');
  assert.ok(form.files.every(x=>/^[a-f0-9]{64}$/.test(x.file_sha256)));
  assert.ok(form.files.every(x=>x.operator===null&&x.reviewer===null));
  const {output}=runReconciliationPlan(['--template','--sha',SHA,
   '--environment','homologation']);
  assert.deepEqual(output.files,form.files);
 });
 it('verificação documental de arquivo isolado não libera o deploy',()=>{
  const c=oneUntracked();
  const evidence=buildReconciliationTemplate(c,OPTIONS);
  evidence.files=evidence.files.map(completeFile);
  const report=reconcileMigrationEvidence(c,evidence,OPTIONS);
  assert.equal(report.unjournaled_total,1);
  assert.equal(report.evidenced_total,1);
  assert.equal(report.evidence_complete,true);
  assert.equal(report.ready_for_deploy,false);
  assert.equal(report.requires_manual_reconciliation,true);
  assert.equal(report.evidence_is_self_declared,true);
  assert.equal(report.production_release_authorized,false);
 });
 it('detecta hash alterado, revisão por mesma pessoa e prova incompleta',()=>{
  const c=oneUntracked(),e=buildReconciliationTemplate(c,OPTIONS);
  e.files[0]=completeFile(e.files[0]);
  e.files[0].file_sha256='b'.repeat(64);
  e.files[0].reviewer=e.files[0].operator;
  e.files[0].schema_comparison_ref='';
  e.files[0].reviewed_at='2030-01-01T00:00:00Z';
  const report=reconcileMigrationEvidence(c,e,OPTIONS);
  for(const issue of ['SQL_HASH_MISMATCH','INDEPENDENT_REVIEW_MISSING',
   'SCHEMA_COMPARISON_MISSING','REVIEW_TIMESTAMP_INVALID'])
   assert.ok(report.files[0].issues.includes(issue),issue);
  assert.equal(report.evidence_complete,false);
 });
 it('rejeita provas misturadas, duplicadas e inesperadas',()=>{
  const c=oneUntracked(),e=buildReconciliationTemplate(c,OPTIONS);
  e.source_sha='c'.repeat(40);
  assert.ok(reconcileMigrationEvidence(c,e,OPTIONS).global_issues
   .includes('EVIDENCE_ENVELOPE_MISSING_OR_INVALID'));
  e.source_sha=SHA;
  e.files.push({...e.files[0]});
  e.files.push({...e.files[0],tag:'0010_not_in_review'});
  const bad=reconcileMigrationEvidence(c,e,OPTIONS);
  assert.ok(bad.global_issues.some(x=>x.startsWith('DUPLICATE_EVIDENCE_TAG:')));
  assert.ok(bad.global_issues.some(x=>x.startsWith('UNEXPECTED_EVIDENCE_TAG:')));
 });
 it('mesmo prova autodeclarada completa não resolve prefixo 0041 repetido',()=>{
  const evidence=buildReconciliationTemplate(catalog,OPTIONS);
  evidence.files=evidence.files.map(completeFile);
  const report=reconcileMigrationEvidence(catalog,evidence,OPTIONS);
  assert.equal(report.evidence_complete,false);
  assert.ok(report.files.some(f=>f.issues.includes('DUPLICATE_SQL_ORDINAL')));
  assert.equal(report.ready_for_deploy,false);
 });
 it('indícios léxicos são informativos e ignoram comentários SQL',()=>{
  assert.deepEqual(scanSqlReviewHints('-- DROP TABLE t\nSELECT 1;'),[]);
  const hints=scanSqlReviewHints('CREATE FUNCTION f() RETURNS void SECURITY DEFINER AS $$ SELECT 1 $$ LANGUAGE sql; REVOKE ALL ON TABLE t FROM PUBLIC;');
  assert.ok(hints.includes('security-definer'));
  assert.ok(hints.includes('permissions'));
  assert.ok(hints.includes('function'));
 });
 it('não fornece comando SQL, apply, repair, merge ou override',()=>{
  assert.throws(()=>parseReconciliationArgs(['--apply']),/Unknown argument/);
  assert.throws(()=>parseReconciliationArgs(['--force']),/Unknown argument/);
  assert.throws(()=>parseReconciliationArgs(['--template']),/requires a full/);
  assert.throws(()=>parseReconciliationArgs(['--check']),/requires --evidence/);
  assert.throws(()=>parseReconciliationArgs(['--check','--evidence']),/Missing value/);
 });
});
