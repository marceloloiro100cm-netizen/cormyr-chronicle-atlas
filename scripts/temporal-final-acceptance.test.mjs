import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 auditTemporalFinalAcceptance,runFinalTemporalAcceptance,
 FINAL_REQUIRED_TESTS,FINAL_TEMPORAL_CONTRACTS,
} from './temporal-final-acceptance.mjs';
const valid=()=>Object.fromEntries(Object.entries(FINAL_TEMPORAL_CONTRACTS)
 .map(([area,{path,markers}])=>[path,markers.join(' ')]));

describe('Lote 37 · aceitação final fail-closed',()=>{
 it('exige todos os contratos e testes previstos',()=>{
  const source=valid();
  const out=auditTemporalFinalAcceptance(p=>source[p],p=>FINAL_REQUIRED_TESTS.includes(p));
  assert.equal(out.static_contract_ok,true);
  assert.equal(out.production_release_authorized,false);
  assert.equal(out.go_no_go,'NO_GO');
  assert.equal(out.real_backup_restoration_verified,false);
 });
 it('falha diante de lacuna temporal, permissão ou regressão',()=>{
  const source=valid();
  delete source[FINAL_TEMPORAL_CONTRACTS['bloqueio global'].path];
  const bad=auditTemporalFinalAcceptance(p=>{
   if(!(p in source))throw Error('missing');
   return source[p];
  },p=>p!==FINAL_REQUIRED_TESTS[0]);
  assert.equal(bad.static_contract_ok,false);
  assert.ok(bad.findings.some(e=>e.code==='MISSING_FILE'));
  assert.ok(bad.findings.some(e=>e.code==='MISSING_TEST'));
 });
 it('usa o repositório como prova estática, sem tentar autorizar produção',()=>{
  const {report,exitCode}=runFinalTemporalAcceptance('--gate');
  assert.equal(exitCode,0);
  assert.equal(report.static_contract_ok,true);
  assert.equal(report.production_release_authorized,false);
  assert.equal(report.sql_executed,false);
  assert.ok(report.pending_external_validation.length>=3);
 });
});
