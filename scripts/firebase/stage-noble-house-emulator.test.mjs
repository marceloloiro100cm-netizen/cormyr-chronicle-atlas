import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNobleHousePlan,sheetDocId} from './stage-noble-house-emulator.mjs';

const SNAP='a'.repeat(64),K1='11111111-1111-4111-8111-111111111111';
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const base=()=>[
  tab('public.campaign_houses',[{id:'h1'},{id:'h2'}]),
  tab('public.noble_house_sheets',[
    {house_id:'h1',state:JSON.stringify({houseId:'h1',schemaVersion:1}),version:'3',updated_by:'u',updated_at:'2026-01-01 10:00:00+00',sync_state:'ok'}]),
  tab('public.noble_house_ledger',[
    {house_id:'h1',operation_key:K1,actor:'u',action:'sheet',explanation:'x',rule:'',campaign_month:'2',before_state:'{}',after_state:'{"houseId":"h1"}',version:'3',created_at:'2026-01-01 10:00:00+00'}]),
  tab('public.noble_house_rule_overrides',[{id:'r1',definition:'{"a":1}',version:'1',updated_by:'u',updated_at:'2026-01-01 10:00:00+00'}]),
  tab('public.noble_house_gm_notes',[{house_id:'h2',notes:'secret',secret_state:'{}',updated_at:'2026-01-01 10:00:00+00'}]),
];
test('valid snapshot stages everything with full coverage',()=>{
  const p=buildNobleHousePlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{sheets:1,ledger:1,ruleOverrides:1,gmNotes:1});
  assert.equal(p.docs.sheets[0].id,sheetDocId('h1'));
  assert.equal(p.docs.sheets[0].payload.version,3);
});
test('orphans, bad state and duplicates block the plan without leaking values',()=>{
  const t=base();
  t[1].rows.push({house_id:'ghost',state:'{}',version:'1'});
  t[1].rows.push({house_id:'h2',state:'{"houseId":"other"}',version:'1'});
  t[2].rows.push({...t[2].rows[0]});
  const p=buildNobleHousePlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.orphanLinks,1);
  assert.equal(p.summary.issues.invalidValues,1);
  assert.equal(p.summary.issues.duplicateIds,1);
  assert.ok(!JSON.stringify(p.summary).includes('ghost'));
});
test('missing required table blocks the plan',()=>{
  const p=buildNobleHousePlan(base().slice(0,2),SNAP);
  assert.equal(p.summary.planValid,false);
});
