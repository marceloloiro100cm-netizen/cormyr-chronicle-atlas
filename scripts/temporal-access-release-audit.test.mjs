import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 ACCESS_CRITICAL_FILES,REQUIRED_TESTS,readAccessCriticalFiles,
 auditTemporalAccess,runAudit,
} from './temporal-access-release-audit.mjs';

const files=readAccessCriticalFiles();
const yes=()=>true;
const codes=report=>report.errors.map(x=>x.code);
describe('Lote 30 · gate de regressão de permissões temporais',()=>{
 it('contratos efetivos presentes, sem autorização implícita de produção',()=>{
  const {report,exitCode}=runAudit('--gate');
  assert.equal(exitCode,0,JSON.stringify(report.errors));
  assert.equal(report.static_contract_ok,true);
  assert.equal(report.go_no_go,'NO_GO');
  for(const key of ['real_database_tested','real_browser_sessions_tested',
   'execute_migrations','authorize_merge','production_release_authorized'])
    assert.equal(report[key],false,key);
  assert.equal(report.inspected_files,Object.keys(ACCESS_CRITICAL_FILES).length);
  assert.equal(report.regression_tests,REQUIRED_TESTS.length);
 });
 it('falha quando desaparece a limpeza do cache do logout',()=>{
  const mutated={...files,root:files.root.replace(
   'clearSessionQueryCache(queryClient)','void queryClient.invalidateQueries()')};
  assert.ok(codes(auditTemporalAccess(mutated,yes)).includes('MISSING_AUTHORIZATION_GUARD'));
 });
 it('falha com remoção da revalidação antes de salvar a Casa',()=>{
  const mutated={...files,houses:files.houses.replace('const [finalRole,finalMembership]',
   'const [oldRole,oldMembership]')};
  assert.ok(codes(auditTemporalAccess(mutated,yes)).includes('WRITE_AUTHORIZATION_ORDER_INVALID'));
 });
 it('falha quando o Conselho deixa de atualizar permissões em 15 segundos',()=>{
  const mutated={...files,council:files.council.replace(
   'refetchInterval:CAMPAIGN_ACCESS_SCOPE_POLL_MS','refetchInterval:false')};
  assert.ok(codes(auditTemporalAccess(mutated,yes)).includes('MISSING_AUTHORIZATION_GUARD'));
 });
 it('falha quando o painel retorna antes da segunda conferência',()=>{
  const mutated={...files,panel:files.panel.replace(
   'assertUnchangedAccessScope(before,after)','// checagem removida')};
  const failures=codes(auditTemporalAccess(mutated,yes));
  assert.ok(failures.includes('PRIVATE_READ_GUARD_ORDER_INVALID'));
 });
 it('bloqueia a supressão de teste SQL de revogação mesmo mantendo o código',()=>{
  const changed=REQUIRED_TESTS.find(x=>x.includes('inflight-revocation.sql'));
  const report=auditTemporalAccess(files,p=>p!==changed);
  assert.ok(codes(report).includes('MISSING_REGRESSION_TEST'));
  assert.equal(report.static_contract_ok,false);
 });
 it('não possui modo de deploy, atualização do banco ou aprovação de PR',()=>{
  assert.throws(()=>runAudit('--deploy'),/--report ou --gate/);
  assert.throws(()=>runAudit('--apply-migrations'),/--report ou --gate/);
 });
});
