import test from 'node:test';
import assert from 'node:assert/strict';
import {projectWorkspaceSpies,readWorkspaceSpies,WorkspaceSpyError}
from './workspace-spies.mjs';
const player={uid:'user-1',profile:'jogador',memberHouseIds:['ashkar']};
const narrator={uid:'narrator',profile:'narrador',memberHouseIds:[]};
const asset=(id,owner_house_id,extra={})=>({
 id,owner_house_id,codename:'Spy '+id,status:'available',
 version:2,mission_successes:3,current_location_id:null,...extra,
});
const operation=(id,owner_house_id,asset_id)=>({
 id,owner_house_id,asset_id,mission_kind:'resources',status:'operating',
 target_type:'house',target_id:'target-house',created_at:'2026-11-19T00:00:00Z',
});
const timeline=(operation_id,owner_house_id,agent_id)=>({
 operation_id,owner_house_id,agent_id,departure_key:'1522-01-01',
 arrival_key:'1522-01-11',investigation_end_key:'1522-01-21',
 origin_region:'ferlin',destination_region:'swordmark',
 travel_rounds:1,travel_days:10,
});
const data=()=>({
 spy_assets:[asset('a1','ashkar'),asset('b1','fewmerry')],
 spy_operations:[operation('o1','ashkar','a1'),
  operation('o2','fewmerry','b1')],
 spy_mission_timeline:[timeline('o1','ashkar','a1'),
  timeline('o2','fewmerry','b1')],
 spy_agent_history:[
  {id:'h1',agent_id:'a1',owner_house_id:'ashkar',operation_id:'o1',
   event_type:'mission_success',event_date_key:'1522-01-10',agent_rank:'elite',
   cunning:6,total_successes:3,detail:'SEGREDO DO NARRADOR'},
  {id:'h2',agent_id:'b1',owner_house_id:'fewmerry',operation_id:'o2',
   event_type:'mission_failure',event_date_key:'1522-01-10',agent_rank:'trained',
   cunning:4,total_successes:0,detail:'SEGREDO OUTRA CASA'},
 ],
 spy_agent_removals:[
  {agent_id:'a1',owner_house_id:'ashkar',codename:'Spy a1',
   removed_at:'2026-11-19T00:00:00Z',refunded_wealth:1},
 ],
});
test('House member sees only own spies and missions, Narrator sees all',()=>{
 const view=projectWorkspaceSpies(data(),player);
 assert.deepEqual(view.agents.items.map(x=>x.id),['a1']);
 assert.deepEqual(view.missions.items.map(x=>x.id),['o1']);
 assert.equal(view.missions.items[0].timeline.travel_days,10);
 assert.equal(view.history.total,1);
 assert.equal(view.history.items[0].agent_rank,'elite');
 assert.equal(view.removals.total,1);
 assert.ok(!JSON.stringify(view).includes('SEGREDO DO NARRADOR'));
 assert.ok(!JSON.stringify(view).includes('SEGREDO OUTRA CASA'));
 assert.ok(!JSON.stringify(view).includes('fewmerry'));
 const gm=projectWorkspaceSpies(data(),narrator);
 assert.equal(gm.agents.total,2);
 assert.equal(gm.missions.total,2);
 assert.equal(gm.history.total,2);
 assert.equal(gm.removals.total,1);
 assert.equal(gm.operationalConnected,false);
});
test('no cross-house query can inspect immutable workspace even once',async()=>{
 const db={collection(){throw Error('PRIVATE_READ_OCCURRED');}};
 await assert.rejects(
   readWorkspaceSpies(db,'a'.repeat(64),player,{houseId:'fewmerry'}),
   e=>e instanceof WorkspaceSpyError&&e.status===403);
 await assert.rejects(
   readWorkspaceSpies(db,'a'.repeat(64),{...player,profile:'editor'}),
   e=>e instanceof WorkspaceSpyError&&e.status===403);
 await assert.rejects(
   readWorkspaceSpies(db,'a'.repeat(64),player,{extra:'secret'}),
   e=>e instanceof WorkspaceSpyError&&e.status===400);
});
test('fake linked assets and duplicated timeline abort all source projections',()=>{
 const rows=data();rows.spy_operations[0].asset_id='b1';
 assert.throws(()=>projectWorkspaceSpies(rows,player),
  e=>e instanceof WorkspaceSpyError&&e.code==='spy_archive_relationship_inconsistent');
 const dup=data();dup.spy_mission_timeline.push(timeline('o1','ashkar','a1'));
 assert.throws(()=>projectWorkspaceSpies(dup,narrator),WorkspaceSpyError);
});

test('forged history attached to a different House fails closed',()=>{
 const src=data();
 src.spy_agent_history[0].owner_house_id='fewmerry';
 assert.throws(()=>projectWorkspaceSpies(src,narrator),
  e=>e instanceof WorkspaceSpyError&&
    e.code==='spy_archive_relationship_inconsistent');
});
