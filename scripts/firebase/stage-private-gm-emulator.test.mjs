import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateGmPlan} from './stage-private-gm-emulator.mjs';
const SNAP='f'.repeat(64);
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const base=()=>[
  tab('public.campaign_private_gm_content',[{id:'c1',payload:'{"x":1}',updated_at:'2026-01-01 00:00:00+00'}]),
  tab('public.campaign_private_vassal_workbooks',[{parent_house_id:'a',vassal_house_id:'b',payload:'{}',updated_at:null}]),
  tab('public.campaign_admin_audit',[{id:'u1',actor:'n',target_player:null,action:'representation_start',details:'{}',created_at:'2026-01-01 00:00:00+00'}]),
];
test('valid plan',()=>{
  const p=buildPrivateGmPlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{content:1,vassal:1,audit:1});
});
test('empty source is valid; duplicates and bad payloads are counted without values',()=>{
  assert.equal(buildPrivateGmPlan([],SNAP).summary.planValid,true);
  const t=base();
  t[0].rows.push({id:'c1',payload:'{}'},{id:'c2',payload:'not json'});
  t[1].rows.push({parent_house_id:'a',vassal_house_id:'',payload:'{}'});
  const p=buildPrivateGmPlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.duplicateIds,1);
  assert.equal(p.summary.issues.invalidValues,2);
});
