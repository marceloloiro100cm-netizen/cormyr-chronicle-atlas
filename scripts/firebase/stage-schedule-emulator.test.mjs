import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchedulePlan} from './stage-schedule-emulator.mjs';

const SNAP='d'.repeat(64);
const E1='11111111-1111-4111-8111-111111111111',E2='22222222-2222-4222-8222-222222222222';
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const ev=(id,o={})=>({id,draft_date:'1520-03-10',draft_title:'T',draft_description:'',draft_deleted:'f',
  published_date:null,published_title:null,published_description:null,version:'1',
  updated_at:'2026-01-01 00:00:00+00',updated_by:'u',...o});
const base=()=>[
  tab('public.campaign_schedule_events',[ev(E1),ev(E2,{published_date:'1520-F-midwinter',published_title:'P'})]),
  tab('public.campaign_schedule_event_audit',[{id:'a1',event_id:E1,actor:'u',changed_at:'2026-01-01 00:00:00+00',
    reason:'Edição',before_state:null,after_state:'{"x":1}'}]),
];
test('valid plan',()=>{
  const p=buildSchedulePlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{events:2,audit:1});
});
test('invalid dates, orphan audit and duplicates are reported without values',()=>{
  const t=base();
  t[0].rows.push(ev('33333333-3333-4333-8333-333333333333',{draft_date:'1520-99-99'}));
  t[0].rows.push(ev(E1));
  t[1].rows.push({id:'a2',event_id:'99999999-9999-4999-8999-999999999999',reason:'x',before_state:null,after_state:null});
  const p=buildSchedulePlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.invalidValues,1);
  assert.equal(p.summary.issues.duplicateIds,1);
  assert.equal(p.summary.issues.orphanLinks,1);
});
test('missing table blocks',()=>{
  assert.equal(buildSchedulePlan([],SNAP).summary.planValid,false);
});
