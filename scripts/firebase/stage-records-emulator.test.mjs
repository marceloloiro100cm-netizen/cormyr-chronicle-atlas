import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordPlan} from './stage-records-emulator.mjs';

const SNAP='c'.repeat(64);
const R1='11111111-1111-4111-8111-111111111111',R2='22222222-2222-4222-8222-222222222222';
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const rec=(id,o={})=>({id,house_id:'h1',player_id:null,visibility:'house',kind:'document',title:'T',content:'C',
  version:'1',created_by:'u',updated_by:'u',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00',
  sync_state:'synced',last_synced_at:null,source_file_id:null,source_modified_at:null,...o});
const base=()=>[
  tab('public.campaign_houses',[{id:'h1'}]),tab('public.campaign_players',[{id:'p1'}]),
  tab('public.campaign_records',[rec(R1),rec(R2,{visibility:'player',player_id:'p1',house_id:null})]),
  tab('public.record_versions',[{id:'v1',record_id:R1,version:'1',snapshot:'{"id":"x"}',author:'u',created_at:'2026-01-01 00:00:00+00'}]),
];
test('valid plan with denormalized version access fields',()=>{
  const p=buildRecordPlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.equal(p.docs.versions[0].payload.visibility,'house');
  assert.equal(p.docs.versions[0].payload.houseId,'h1');
});
test('bad visibility links, orphans and duplicate source files are reported',()=>{
  const t=base();
  t[2].rows.push(rec('33333333-3333-4333-8333-333333333333',{visibility:'player',player_id:null}));
  t[2].rows.push(rec('44444444-4444-4444-8444-444444444444',{house_id:'ghost'}));
  t[2].rows.push(rec('55555555-5555-4555-8555-555555555555',{source_file_id:'f',player_id:'p1'}));
  t[2].rows.push(rec('66666666-6666-4666-8666-666666666666',{source_file_id:'f',player_id:'p1'}));
  t[3].rows.push({id:'v9',record_id:'99999999-9999-4999-8999-999999999999',version:'1',snapshot:'{}'});
  const p=buildRecordPlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.invalidValues,1);
  assert.equal(p.summary.issues.orphanLinks,2);
  assert.equal(p.summary.issues.duplicateIds,1);
  assert.ok(!JSON.stringify(p.summary).includes('ghost'));
});
test('missing table blocks',()=>{
  assert.equal(buildRecordPlan(base().slice(0,2),SNAP).summary.planValid,false);
});
