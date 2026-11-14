import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCharacterPlan,parsePgArray} from './stage-characters-emulator.mjs';

const SNAP='b'.repeat(64);
const C1='11111111-1111-4111-8111-111111111111',C2='22222222-2222-4222-8222-222222222222';
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const ch=(id,o={})=>({id,display_name:'N'+id[0],aliases:'{}',house_id:'h1',noble_roles:'{lord}',race:null,
  is_noble:'t',birth_year:'1500',birth_date:null,baseline_age:null,baseline_year:null,age_policy:'year_turn',
  age_exception_note:null,apparent_age:null,alive_status:'alive',death_year:null,death_date:null,
  visibility:'gm',owner_user_id:null,confidence:'confirmed',review_status:'reviewed',review_note:'',
  version:'2',created_by:'u',updated_by:'u',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00',...o});
const base=()=>[
  tab('public.campaign_houses',[{id:'h1'}]),
  tab('public.campaign_characters',[ch(C1),ch(C2,{aliases:'{"Sir A","B\\"q"}'})]),
  tab('public.character_source_links',[{character_id:C1,source_kind:'campaign_house',source_key:'h1',source_visibility:'gm',source_reference:'{}',confirmed_by:'u',confirmed_at:'2026-01-01 00:00:00+00'}]),
  tab('public.character_review_queue',[]),
  tab('public.character_relations',[{from_character:C1,to_character:C2,relation:'parent',note:'',approved_by:'u',created_at:'2026-01-01 00:00:00+00'}]),
  tab('public.character_registry_audit',[]),tab('public.character_year_transitions',[]),
];
test('pg arrays',()=>{
  assert.deepEqual(parsePgArray('{}'),[]);
  assert.deepEqual(parsePgArray('{a,b}'),['a','b']);
  assert.deepEqual(parsePgArray('{"Sir A","B\\"q"}'),['Sir A','B"q']);
  assert.equal(parsePgArray('nope'),undefined);
});
test('valid plan, full coverage',()=>{
  const p=buildCharacterPlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.equal(p.summary.stagedCounts.characters,2);
  assert.deepEqual(p.docs.characters[1].payload.aliases,['Sir A','B"q']);
});
test('orphans and bad values block without leaking',()=>{
  const t=base();
  t[1].rows.push(ch('33333333-3333-4333-8333-333333333333',{house_id:'ghost'}));
  t[1].rows.push(ch('44444444-4444-4444-8444-444444444444',{birth_year:'abc'}));
  t[2].rows.push({character_id:'99999999-9999-4999-8999-999999999999',source_kind:'x',source_key:'y'});
  const p=buildCharacterPlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.orphanLinks,2);
  assert.equal(p.summary.issues.invalidValues,1);
  assert.ok(!JSON.stringify(p.summary).includes('ghost'));
});
test('missing required table',()=>{
  assert.equal(buildCharacterPlan(base().slice(0,1),SNAP).summary.planValid,false);
});
