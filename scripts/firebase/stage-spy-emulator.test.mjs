import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpyAgentsPlan,textArray} from './stage-spy-emulator.mjs';

const SNAP='b'.repeat(64);
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const base=()=>[
  tab('public.spy_portrait_catalog',[{id:'p1',label:'A',image_url:'https://x/y.png',sort_order:'1',active:'t',created_at:'2026-01-01 00:00:00+00'}]),
  tab('public.spy_locations',[{id:'loc1',kind:'domain',ref_id:'d1',region_id:'r1',name:'N',approved:'t',source:'s',version:'1',visibility:'public'}]),
  tab('public.spy_assets',[{id:U(1),owner_house_id:'hA',kind:'network_cell',codename:'Sombra',source_holding_id:'h1',source_ref:'x',
    current_location_id:'loc1',status:'available',rules_version:'',mission_successes:'3',portrait_id:'p1',version:'2',created_at:'2026-01-01 00:00:00+00'}]),
  tab('public.spy_operations',[{id:U(2),asset_id:U(1),owner_house_id:'hA',mission_kind:'k',target_type:'house',target_id:'t',status:'completed',
    operation_key:U(3),requested_fields:'{a,b}',rules_version:'v',source_calendar_version:'1',version:'1',created_by:U(9),created_at:'2026-01-02 00:00:00+00'}]),
  tab('public.spy_operation_segments',[{id:U(4),operation_id:U(2),ordinal:'1',edge_id:U(5),edge_version:'1',from_location_id:'loc1',to_location_id:'loc1',
    departure_key:'1522-01-01',arrival_key:'1522-01-03',duration_days:'2',status:'arrived'}]),
  tab('public.spy_agent_history',[{id:U(6),owner_house_id:'hA',agent_id:U(1),operation_id:U(2),event_type:'mission_success',event_date_key:'1522-01-03',
    calendar_version:'1',target_house_id:'t',target_name:'T',target_region:'',agent_rank:'Treinada',cunning:'4',total_successes:'3',roll_total:'12',
    modifier:'',target_difficulty:'9',failure_degrees:'0',law_snapshot:'10',guard_present:'t',prison_present:'f',detail:'ok',request_key:U(7),
    actor:U(9),created_at:'2026-01-03 00:00:00+00'}]),
  tab('public.spy_agent_upgrades',[{agent_id:U(1),owner_house_id:'hA',upgrade_code:'ace_in_the_hole',cost_wealth:'1',purchased_at:'2026-01-01 00:00:00+00',request_key:U(8),purchased_by:U(9)}]),
  tab('public.spy_agent_removals',[]),
  tab('public.spy_operation_events',[{id:U(10),operation_id:U(2),request_key:U(11),actor:U(9),event_type:'e',old_state:'a',new_state:'b',reason:'r',calendar_version:'1',occurred_at:'2026-01-03 00:00:00+00'}]),
];
const withRows=(table,rows)=>base().map(t=>t.table===table?{...t,rows}:t);

test('imports the whole agents slice with full coverage', () => {
  const p=buildSpyAgentsPlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{assets:1,history:1,upgrades:1,removals:0,portraits:1,locations:1,operations:1,segments:1,events:1});
  assert.deepEqual(p.docs.operations[0].payload.requestedFields,['a','b']);
  assert.equal(p.docs.assets[0].payload.rulesVersion,'cormyr-agent-tiers-v1');
  assert.equal(p.docs.upgrades[0].id,U(1)+':ace_in_the_hole');
  assert.equal(p.docs.history[0].payload.guardPresent,true);assert.equal(p.docs.history[0].payload.modifier,null);
});

test('blocks on invalid, duplicate and orphan rows', () => {
  const a=base()[2].rows[0];
  assert.equal(buildSpyAgentsPlan(withRows('public.spy_assets',[{...a,status:'weird'}]),SNAP).summary.planValid,false);
  assert.equal(buildSpyAgentsPlan(withRows('public.spy_assets',[a,a]),SNAP).summary.planValid,false);
  assert.equal(buildSpyAgentsPlan(withRows('public.spy_assets',[{...a,portrait_id:'nope'}]),SNAP).summary.issues.orphanLinks>0,true);
  const h=base()[5].rows[0];
  assert.equal(buildSpyAgentsPlan(withRows('public.spy_agent_history',[{...h,agent_id:U(50)}]),SNAP).summary.planValid,false);
  assert.equal(buildSpyAgentsPlan(withRows('public.spy_agent_history',[{...h,event_type:'x'}]),SNAP).summary.planValid,false);
  assert.equal(buildSpyAgentsPlan(withRows('public.spy_agent_upgrades',[{...base()[6].rows[0],cost_wealth:'2'}]),SNAP).summary.planValid,false);
  assert.equal(buildSpyAgentsPlan([],SNAP).summary.missingRequiredTables,1);
  assert.throws(()=>buildSpyAgentsPlan([],'bad'));
});

test('text[] parsing and count-only summary', () => {
  assert.deepEqual(textArray('["a","b"]'),['a','b']);assert.deepEqual(textArray('{"a",b}'),['a','b']);
  assert.deepEqual(textArray(''),[]);assert.equal(textArray('x'),undefined);
  const s=JSON.stringify(buildSpyAgentsPlan(base(),SNAP).summary);
  assert.ok(!s.includes('Sombra'));
});
