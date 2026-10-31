import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {inspectTemporalContracts,runTemporalHomologation,
 TEMPORAL_ADMIN_FUNCTIONS,TEMPORAL_PRIVATE_TABLES}
 from './temporal-homologation-audit.mjs';

const clock={year:1524,month:6,day:30,festival:'shieldmeet',version:22};

function mockTx(overrides={}){
 const calls=[];
 const tx={unsafe:async (query,params=[])=>{
  calls.push({query,params});
  if(query.includes('relrowsecurity'))return [{
   rls_enabled:true,anon_read:false,player_read:false,
   anon_write:false,player_write:false,...overrides.table,
  }];
  if(query.includes('anon_can_execute'))
   return [{anon_can_execute:false,...overrides.rpc}];
  if(query.includes('AS security_definer'))
   return [{security_definer:true,volatility:'s',...overrides.preflight}];
  if(query.includes('AS total'))return [{total:1,...overrides.count}];
  if(query.includes('AS accessible'))return [{accessible:true}];
  if(query.includes('AS clock'))return [{clock:overrides.clock??clock}];
  throw new Error('Unexpected SQL read');
 }};
 return {tx,calls};
}

describe('Lote 13 · homologação operacional sem mutações',()=>{
 it('verifica todos os contratos sem ler registros de Casas ou missivas',async()=>{
  const {tx,calls}=mockTx();
  const report=await inspectTemporalContracts(tx);
  assert.equal(report.contract_ok,true);
  assert.equal(report.production_release_authorized,false);
  assert.equal(report.requires_migration_reconciliation,true);
  assert.equal(report.requires_real_homologation,true);
  assert.equal(report.checks.length,
   TEMPORAL_ADMIN_FUNCTIONS.length+TEMPORAL_PRIVATE_TABLES.length+5);
  assert.equal(calls.length,report.checks.length);
  assert.ok(calls.every(c=>c.query.startsWith('SELECT ')));
  assert.ok(calls.every(c=>!/noble_house_sheets|campaign_letters|auth\.users|ledger/.test(c.query)));
  assert.ok(calls.every(c=>!/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i.test(c.query)));
  assert.ok(calls.filter(c=>c.params.length).every(c=>c.params.length===1));
 });
 it('bloqueia homologação quando perde RLS ou concessões ao jogador e anônimo',async()=>{
  for(const table of [{rls_enabled:false},{player_read:true},{anon_write:true}]){
   const {tx}=mockTx({table});
   const report=await inspectTemporalContracts(tx);
   assert.equal(report.contract_ok,false);
   assert.ok(report.checks.some(c=>c.name.startsWith('private:')&&!c.passed));
  }
  const {tx}=mockTx({rpc:{anon_can_execute:true}});
  assert.equal((await inspectTemporalContracts(tx)).contract_ok,false);
 });
 it('bloqueia relógio com dados extras, versão inválida ou falha de leitura',async()=>{
  const {tx}=mockTx({clock:{...clock,player_id:'segredo'}});
  assert.equal((await inspectTemporalContracts(tx)).contract_ok,false);
  const {tx:bad}=mockTx({clock:{...clock,version:0}});
  assert.equal((await inspectTemporalContracts(bad)).contract_ok,false);
  const broken=mockTx();
  const orig=broken.tx.unsafe;
  broken.tx.unsafe=async(query,params)=>{
   if(query.includes('AS clock'))throw Error('Permission denied');
   return orig(query,params);
  };
  assert.equal((await inspectTemporalContracts(broken.tx)).contract_ok,false);
 });
 it('recusa executar inspeção sem opção explícita ou URL definida',async()=>{
  await assert.rejects(()=>runTemporalHomologation([],'postgres://example/test'),/--read-only/);
  await assert.rejects(()=>runTemporalHomologation(['--read-only'],''),/CORMYR_AUDIT_DATABASE_URL/);
 });
});
