import test from 'node:test';
import assert from 'node:assert/strict';
import {yearTransitions,planTimeChange,previewHouseTimeImpacts,reconcileSheetState,reconcileHouseMonths,TimeError} from './time-core.mjs';

const K='11111111-1111-4111-8111-111111111111';
const cal={year:1520,month:0,day:15,festival:null,autoAdvance:true,version:4,publishedWeek:9,publishedAt:null};
const base=12*1520; // absolute month of the calendar above
const sheet=(h,o={},v=1)=>({houseId:h,version:v,state:{houseId:h,schemaVersion:1,phase:'active',month:base,
  holdings:[],projects:[],...o}});
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof TimeError);return e.code;}return null;};
let n=0;const newKey=()=>'00000000-0000-4000-8000-'+String(++n).padStart(12,'0');
const plan=(o={})=>planTimeChange({calendar:cal,actorUid:'nar',houses:[],advanceLedger:new Set(),newKey,
  request:{version:4,key:K,mode:'set',date:'1520-03-10',...(o.request||{})},...(o.rest||{})});

test('invalid requests and version conflicts',()=>{
  assert.equal(code(()=>plan({request:{key:'x'}})),'invalid');
  assert.equal(code(()=>plan({request:{version:3}})),'conflict');
  assert.equal(code(()=>plan({request:{mode:'zz'}})),'invalid');
  assert.equal(code(()=>planTimeChange({calendar:cal,actorUid:null,houses:[],advanceLedger:new Set(),newKey,request:{}})),'invalid');
});
test('set forward: calendar bump, manual mode, audit, operation, idempotent replay',()=>{
  const p=plan();
  assert.equal(p.calendar.version,5);assert.equal(p.calendar.autoAdvance,false);
  assert.equal(p.calendar.month,2);assert.equal(p.calendar.day,10);assert.equal(p.calendar.festival,null);
  assert.equal(p.calendar.publishedWeek,9); // week is never changed by a time change
  assert.match(p.calendarAudit.reason,/^Hub Temporal · set · operação /);
  assert.equal(p.operation.fromDate,'1520-01-15');assert.equal(p.operation.toDate,'1520-03-10');
  const again=plan({rest:{existingOp:p.operation}});
  assert.equal(again.duplicate,true);assert.equal(again.result.duplicate,true);assert.equal(again.result.version,5);
  assert.equal(code(()=>plan({request:{date:'1520-04-10'},rest:{existingOp:p.operation}})),'conflict');
  assert.equal(code(()=>planTimeChange({calendar:cal,actorUid:'other',houses:[],advanceLedger:new Set(),newKey,
    request:{version:4,key:K,mode:'set',date:'1520-03-10'},existingOp:p.operation})),'conflict');
});
test('festival target stores day 30 and festival name',()=>{
  const p=plan({request:{date:'1520-F-midsummer'}});
  assert.equal(p.calendar.festival,'midsummer');assert.equal(p.calendar.day,30);assert.equal(p.calendar.month,6);
});
test('backdating needs authorization and a 10 char reason; never touches houses',()=>{
  const c2={...cal,year:1521,month:5};
  const go=(o)=>planTimeChange({calendar:c2,actorUid:'nar',houses:[sheet('a')],advanceLedger:new Set(),newKey,
    request:{version:4,key:K,mode:'set',date:'1520-03-10',...o}});
  assert.equal(code(()=>go({})),'invalid');
  assert.equal(code(()=>go({allowBackdate:true,reason:'curto'})),'invalid');
  const ok=go({allowBackdate:true,reason:'correção histórica autorizada'});
  assert.equal(ok.houseWrites.length,0);assert.equal(ok.calendar.year,1520);
});
test('advance of months reconciles active houses with ledger and bumps versions',()=>{
  const houses=[sheet('b'),sheet('a',{phase:'draft'}),sheet('c',{month:base+9})];
  const p=plan({rest:{houses},request:{date:'1520-03-10'}}); // +2 months
  assert.deepEqual(p.houseWrites.map(w=>w.houseId),['b']);
  const w=p.houseWrites[0];
  assert.equal(w.sheet.state.month,base+2);assert.equal(w.sheet.version,2);
  assert.equal(w.ledger.action,'calendar_advance');assert.equal(w.ledger.campaignMonth,base+2);
  assert.equal(w.ledger.beforeState.month,base);assert.equal(w.ledger.afterState.month,base+2);
});
test('malformed sheet aborts the whole operation; existing ledger for the month conflicts',()=>{
  assert.equal(code(()=>plan({rest:{houses:[sheet('a',{month:'x'})]}})),'invalid_sheet');
  assert.equal(code(()=>plan({rest:{houses:[sheet('a',{projects:[{status:'building',start:'x',duration:1,holdingId:'h'}]})]}})),'invalid_sheet');
  assert.equal(code(()=>plan({rest:{houses:[sheet('a')],advanceLedger:new Set(['a:'+(base+2)])}})),'conflict');
  assert.equal(plan({rest:{houses:[sheet('a')],advanceLedger:new Set(['a:'+(base+3)])}}).houseWrites.length,1);
});
test('projects: due buildings complete, orphan cancels, child waits for parent (fixed point)',()=>{
  const state={houseId:'h',schemaVersion:1,phase:'active',month:base,
    holdings:[{id:'child',status:'building',parentId:'parent'},{id:'parent',status:'building'},{id:'done',status:'active'}],
    projects:[{status:'building',start:base,duration:1,holdingId:'child'},
      {status:'building',start:base,duration:1,holdingId:'parent'},
      {status:'building',start:base,duration:1,holdingId:'done'},
      {status:'building',start:base,duration:1,holdingId:'ghost'},
      {status:'building',start:base,duration:9,holdingId:'parent'}]};
  const r=reconcileSheetState(state,base+2);
  assert.deepEqual(r.state.projects.map(p=>p.status),['completed','completed','completed','cancelled','building']);
  assert.deepEqual(r.state.holdings.map(h=>h.status),['active','active','active']);
  assert.equal(r.finished,3);assert.equal(r.cancelled,1);assert.equal(r.state.month,base+2);
  const late=reconcileSheetState(state,base);
  assert.equal(late.state.projects.every(p=>p.status==='building'),true);
});
test('modifier shifts the deadline',()=>{
  const st={houseId:'h',schemaVersion:1,phase:'active',month:base,
    holdings:[{id:'x',status:'building'}],projects:[{status:'building',start:base,duration:2,modifier:-1,holdingId:'x'}]};
  assert.equal(reconcileSheetState(st,base+1).state.projects[0].status,'completed');
  assert.equal(reconcileSheetState({...st,projects:[{...st.projects[0],modifier:'1'}]},base+2).state.projects[0].status,'building');
});
test('house impact preview classifies houses',()=>{
  const houses=[sheet('adv'),sheet('draft',{phase:'draft'}),sheet('ahead',{month:base+9}),sheet('aligned',{month:base+2}),
    {houseId:'bad',version:1,state:{houseId:'other',schemaVersion:1}},
    sheet('proj',{holdings:[{id:'x',status:'building'}],projects:[{status:'building',start:base,duration:1,holdingId:'x'}]})];
  const p=previewHouseTimeImpacts({calendar:cal,targetDate:'1520-03-10',houses});
  const by=Object.fromEntries(p.houses.map(h=>[h.house_id,h.status]));
  assert.deepEqual(by,{adv:'advance',ahead:'ahead',aligned:'ahead',bad:'invalid',draft:'draft',proj:'advance'});
  assert.equal(p.eligible,2);assert.equal(p.project_candidates,1);assert.equal(p.target_month,base+2);
  assert.equal(previewHouseTimeImpacts({calendar:cal,targetDate:'1520-01-15',houses:[sheet('a')]}).houses[0].status,'historical');
  assert.equal(code(()=>previewHouseTimeImpacts({calendar:cal,targetDate:'1531-01-01',houses})),'invalid');
});

test('year transitions: one per boundary, both directions, none inside a year',()=>{
  assert.deepEqual(yearTransitions({fromYear:1520,toYear:1520,calendarVersion:5}),[]);
  assert.deepEqual(yearTransitions({fromYear:1520,toYear:1522,calendarVersion:5}),
    [{calendarVersion:5,fromYear:1520,toYear:1521},{calendarVersion:5,fromYear:1521,toYear:1522}]);
  assert.deepEqual(yearTransitions({fromYear:1520,toYear:1519,calendarVersion:5}),[{calendarVersion:5,fromYear:1520,toYear:1519}]);
  assert.equal(plan({request:{date:'1521-02-10'}}).transitions.length,1);
  assert.equal(plan().transitions.length,0);
});
