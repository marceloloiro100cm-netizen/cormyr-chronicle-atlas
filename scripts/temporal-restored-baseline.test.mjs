import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 SNAPSHOT_TABLES,JSON_ARRAY_METRICS,
 validateRestoredTarget,inspectRestoredBaseline,compareRestoredBaselines,
 parseBaselineArgs,runRestoredBaseline
} from './temporal-restored-baseline.mjs';

const SHA='a'.repeat(40);
const CLOCK={year:1520,month:8,day:10,festival:null,version:12};
function mockTx(overrides={}){
 const calls=[];
 const tx={unsafe:async (query,params=[])=>{
  calls.push({query,params});
  if(query.includes('to_regclass'))return [{exists:overrides.exists??true}];
  if(query.includes('public.get_public_campaign_time()'))
   return [{clock:overrides.clock??CLOCK}];
  return [{total:overrides.total??'2'}];
 }};
 return {tx,calls};
}
const safe=async()=>inspectRestoredBaseline(mockTx().tx,{sourceSha:SHA,
 now:new Date('2026-10-31T20:00:00.000Z')});

describe('Lote 19 · inventário de cópia restaurada sem conteúdos privados',()=>{
 it('permite somente ambiente/hostname/banco e commit explicitamente autorizados',()=>{
  const url='postgres://reader:isolated@localhost:5432/cormyr_temporal_restore_18';
  const got=validateRestoredTarget(url,'localhost','cormyr_temporal_restore_18',SHA);
  assert.equal(got.database,'cormyr_temporal_restore_18');
  for(const [connection,host,db,sha] of [
   [url,'production.example','cormyr_temporal_restore_18',SHA],
   [url,'localhost','production',SHA],
   [url,'localhost','cormyr_temporal_restore_18','bad'],
   ['postgres://reader:isolated@localhost/production','localhost','production',SHA],
   [url+'?sslmode=require','localhost','cormyr_temporal_restore_18',SHA],
  ])assert.throws(()=>validateRestoredTarget(connection,host,db,sha));
  assert.throws(()=>validateRestoredTarget('',null,null,null));
 });
 it('somente executa SELECT de agregados, metadados de tabela e relógio público',async()=>{
  const {tx,calls}=mockTx();
  const report=await inspectRestoredBaseline(tx,{sourceSha:SHA});
  assert.equal(report.source_database_verified,false);
  assert.equal(report.production_backup_restored,false);
  assert.equal(report.production_release_authorized,false);
  assert.equal(report.data_contents_collected,false);
  assert.equal(Object.keys(report.totals).length,
   SNAPSHOT_TABLES.length+JSON_ARRAY_METRICS.length);
  assert.equal(report.totals.rows_campaign_houses,'2');
  assert.equal(report.totals.house_units,'2');
  assert.deepEqual(report.public_clock,CLOCK);
  assert.equal(calls.length,SNAPSHOT_TABLES.length*2+JSON_ARRAY_METRICS.length+1);
  assert.ok(calls.every(c=>c.query.startsWith('SELECT ')));
  assert.ok(calls.every(c=>!/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(INTO|TABLE|SCHEMA|POLICY|FROM|public)/i.test(c.query)));
  assert.ok(calls.every(c=>!/name|content|subject|email|sender|owner_user|SELECT \*/i.test(c.query)));
  assert.ok(calls.some(c=>c.query.includes("state->'units'")));
  assert.ok(calls.some(c=>c.query.includes("state->'holdings'")));
 });
 it('falha fechado se uma tabela esperada está ausente ou relógio expõe campo extra',async()=>{
  const missing=mockTx({exists:false});
  await assert.rejects(()=>inspectRestoredBaseline(missing.tx,{sourceSha:SHA}),/Objeto esperado ausente/);
  const wrong=mockTx({clock:{...CLOCK,private_player_id:'not-allowed'}});
  await assert.rejects(()=>inspectRestoredBaseline(wrong.tx,{sourceSha:SHA}),/Relógio público/);
  const invalid=mockTx({total:'2;DROP TABLE foo'});
  await assert.rejects(()=>inspectRestoredBaseline(invalid.tx,{sourceSha:SHA}),/Contagem inválida/);
 });
 it('compara somente métricas e relógio, sem divulgar números ou fichas',async()=>{
  const first=await safe();
  const second=structuredClone(first);
  const clean=compareRestoredBaselines(first,second);
  assert.equal(clean.snapshot_comparison_ok,true);
  assert.equal(clean.evaluated_metrics,SNAPSHOT_TABLES.length+JSON_ARRAY_METRICS.length);
  assert.equal(clean.production_release_authorized,false);
  assert.equal(clean.source_database_verified,false);
  second.totals.house_units='4';
  const failure=compareRestoredBaselines(first,second);
  assert.deepEqual(failure.blockers,['COUNT_MISMATCH:house_units']);
  assert.equal(JSON.stringify(failure).includes('"4"'),false);
  second.totals.house_units='2';
  second.public_clock.version++;
  assert.ok(compareRestoredBaselines(first,second).blockers.includes('CLOCK_MISMATCH'));
 });
 it('recusa formatos, métricas extras, SHA divergente, estado de produção e ausência de informação',async()=>{
  const baseline=await safe();
  for(const mutate of [
   x=>{x.totals.secret='1';},
   x=>{delete x.totals.rows_campaign_letters;},
   x=>{x.source_sha='b'.repeat(40);},
   x=>{x.production_release_authorized=true;},
   x=>{x.environment='production';},
   x=>{x.public_clock={year:1520};},
   x=>{x.totals.house_holdings='-1';},
   x=>{x.copy_identity_operator_asserted=false;},
  ]){
   const wrong=structuredClone(baseline);mutate(wrong);
   assert.equal(compareRestoredBaselines(baseline,wrong).snapshot_comparison_ok,false);
  }
 });
 it('CLI recusa snapshot implícito, URL ausente e opções de escrita',async()=>{
  assert.deepEqual(parseBaselineArgs(['--snapshot','--read-only','--restored-copy']),
   {mode:'snapshot'});
  assert.equal(parseBaselineArgs(['--compare','a.json','b.json']).mode,'compare');
  assert.throws(()=>parseBaselineArgs(['--apply']),/Use --snapshot/);
  assert.throws(()=>parseBaselineArgs(['--snapshot']),/Use --snapshot/);
  assert.throws(()=>parseBaselineArgs(['--compare','x']),/Use --snapshot/);
  await assert.rejects(()=>runRestoredBaseline(['--snapshot','--read-only','--restored-copy'],{}));
 });
});
