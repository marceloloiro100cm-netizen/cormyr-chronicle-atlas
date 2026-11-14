import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeEnginePlan} from './stage-time-engine-emulator.mjs';

const SNAP='e'.repeat(64);
const U='11111111-1111-4111-8111-111111111111';
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const cal={year:'1520',month:'2',day:'10',festival:'',auto_advance:'f',version:'5',last_round:'3',
  published_at:null,updated_at:'2026-01-01 00:00:00+00',updated_by:U};
const op={id:U,actor:U,request_hash:'h',expected_version:'4',mode:'set',from_date:'1520-01-15',to_date:'1520-03-10',
  before_state:'{"v":4}',after_state:'{"v":5}',reason:'r',created_at:'2026-01-01 00:00:00+00'};
const base=()=>[tab('public.campaign_calendar',[cal]),tab('public.campaign_time_operations',[op]),
  tab('public.campaign_calendar_audit',[{id:'a1',actor:U,before_state:'{}',after_state:'{}',reason:'x',created_at:'2026-01-01 00:00:00+00'}])];

test('valid plan stages calendar, operations and audit',()=>{
  const p=buildTimeEnginePlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{calendar:1,operations:1,audit:1});
  assert.equal(p.docs.calendar[0].payload.autoAdvance,false);
  assert.equal(p.docs.calendar[0].payload.festival,null);
});
test('invalid calendar, duplicate operation and bad date are counted without values',()=>{
  const t=base();
  t[0].rows[0]={...cal,month:'12'};
  t[1].rows.push(op,{...op,id:'2'.repeat(8)+'-2222-4222-8222-222222222222',to_date:'1520-99-99'});
  const p=buildTimeEnginePlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.invalidValues,2);
  assert.equal(p.summary.issues.duplicateIds,1);
});
test('missing calendar blocks; two calendars are rejected',()=>{
  assert.equal(buildTimeEnginePlan([],SNAP).summary.planValid,false);
  const t=base();t[0].rows.push(cal);
  assert.equal(buildTimeEnginePlan(t,SNAP).summary.issues.notExactlyOneCalendar,1);
});
