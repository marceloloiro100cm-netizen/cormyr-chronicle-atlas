import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeOf,applyNobleHouseOperation,NobleHouseError} from './noble-house-core.mjs';

const KEY='11111111-1111-4111-8111-111111111111';
const narrator=scopeOf('n',{userId:'n',active:true,profile:'narrador',admin:true});
const alice=scopeOf('a',{userId:'a',active:true,profile:'jogador',admin:false,
  requirePasswordChange:false,memberHouseIds:['h1','h2'],editHouseIds:['h1']});
const req=(o={})=>({houseId:'h1',operationKey:KEY,action:'sheet',explanation:'e',rule:'r',
  month:3,version:0,state:{houseId:'h1',schemaVersion:1,x:1},...o});
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof NobleHouseError);return e.code;}return null;};

test('scope denies inactive, mismatched, forced-password and malformed',()=>{
  assert.equal(code(()=>scopeOf('a',null)),'denied');
  assert.equal(code(()=>scopeOf('a',{userId:'b',active:true,profile:'narrador',admin:true})),'denied');
  assert.equal(code(()=>scopeOf('a',{userId:'a',active:false,profile:'narrador',admin:true})),'denied');
  assert.equal(code(()=>scopeOf('a',{userId:'a',active:true,requirePasswordChange:true,profile:'narrador',admin:true})),'denied');
  assert.equal(code(()=>scopeOf('a',{userId:'a',active:true,profile:'editor',admin:false})),'denied');
});
test('editor of the house and narrator may commit; member-only and others may not',()=>{
  assert.equal(applyNobleHouseOperation({actor:alice,request:req(),currentSheet:null,existingLedger:null}).version,1);
  assert.equal(applyNobleHouseOperation({actor:narrator,request:req({houseId:'h9',state:{houseId:'h9',schemaVersion:1}}),currentSheet:null,existingLedger:null}).version,1);
  const r=req({houseId:'h2',state:{houseId:'h2',schemaVersion:1}});
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:r,currentSheet:null,existingLedger:null})),'denied');
});
test('state must match house, schema 1 (number or string), integer month',()=>{
  const run=o=>()=>applyNobleHouseOperation({actor:alice,request:req(o),currentSheet:null,existingLedger:null});
  assert.equal(code(run({state:{houseId:'h2',schemaVersion:1}})),'invalid');
  assert.equal(code(run({state:{houseId:'h1',schemaVersion:2}})),'invalid');
  assert.equal(code(run({state:{houseId:'h1',schemaVersion:1,month:1.5}})),'invalid');
  assert.equal(code(run({operationKey:'nope'})),'invalid');
  assert.doesNotThrow(run({state:{houseId:'h1',schemaVersion:'1'}}));
});
test('optimistic version check and ledger before/after',()=>{
  const cur={state:{houseId:'h1',schemaVersion:1,x:0},version:4};
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:req({version:3}),currentSheet:cur,existingLedger:null})),'conflict');
  const ok=applyNobleHouseOperation({actor:alice,request:req({version:4}),currentSheet:cur,existingLedger:null});
  assert.equal(ok.version,5);
  assert.deepEqual(ok.ledger.beforeState,cur.state);
  assert.equal(ok.ledger.afterState.x,1);
  const first=applyNobleHouseOperation({actor:alice,request:req(),currentSheet:null,existingLedger:null});
  assert.deepEqual(first.ledger.beforeState,{});
});
test('idempotency: same actor+action duplicates, otherwise key reuse conflicts',()=>{
  const led={actor:'a',action:'sheet',version:1};
  assert.deepEqual(applyNobleHouseOperation({actor:alice,request:req(),currentSheet:{state:{},version:1},existingLedger:led}),{duplicate:true,version:1});
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:req({action:'resource'}),currentSheet:{state:{},version:1},existingLedger:led})),'conflict');
});
test('ledger month comes from state; free-form actions are accepted',()=>{
  const r=applyNobleHouseOperation({actor:alice,request:req({action:'calendar_advance',state:{houseId:'h1',schemaVersion:1,month:'6100'}}),currentSheet:null,existingLedger:null});
  assert.equal(r.ledger.campaignMonth,6100);
  const n=applyNobleHouseOperation({actor:alice,request:req({action:'qualquer_acao'}),currentSheet:null,existingLedger:null});
  assert.equal(n.ledger.campaignMonth,null);
});
test('unit actions need the commander context',()=>{
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:req({action:'unit'}),currentSheet:null,existingLedger:null})),'unsupported');
});
const ids=(()=>{let n=0;return ()=>'cmd-'+(++n);})();
const unitReq=(units,court,action='unit')=>req({action,state:{houseId:'h1',schemaVersion:1,units,...(court?{court}:{})}});
const ctx=houseRecords=>({houseRecords,newId:ids});
const NPC={id:'npc-old',houseId:'h1',kind:'character',visibility:'house',title:'  Ser Álvaro ',createdAt:'2026-01-01T00:00:00.000Z'};
test('commander: reuses a house NPC (accent and case insensitive, oldest first) and adds a court member once',()=>{
  const dup={...NPC,id:'npc-new',createdAt:'2026-02-01T00:00:00.000Z'};
  const r=applyNobleHouseOperation({actor:alice,request:unitReq([{id:'u1',name:'Lanceiros',commanderName:'ser alvaro'}]),
    currentSheet:null,existingLedger:null,commanderContext:ctx([dup,NPC])});
  assert.equal(r.newRecords.length,0);
  const court=r.sheet.state.court;
  assert.equal(court.length,1);assert.equal(court[0].npcId,'npc-old');assert.equal(court[0].role,'Comandante de Exército');
  assert.equal(r.sheet.state.units[0].commanderId,court[0].id);
  assert.equal(r.ledger.afterState.units[0].commanderId,court[0].id);
});
test('commander: creates a house NPC once for repeated names; ficha records and other visibility are never reused',()=>{
  const pool=[{...NPC,title:'Ficha Ser Álvaro',id:'f'},{...NPC,id:'p',visibility:'player'},{...NPC,id:'o',houseId:'h2'},{...NPC,id:'k',kind:'document'}];
  const r=applyNobleHouseOperation({actor:alice,request:unitReq([{id:'u1',name:'A',commanderName:'Ser Álvaro'},
    {id:'u2',name:'B',commanderName:'SER ALVARO'}]),currentSheet:null,existingLedger:null,commanderContext:ctx(pool)});
  assert.equal(r.newRecords.length,1);
  const n=r.newRecords[0];
  assert.equal(n.visibility,'house');assert.equal(n.kind,'character');assert.equal(n.houseId,'h1');
  assert.equal(n.title,'Ser Álvaro');assert.equal(n.content,'Comandante da unidade A');assert.equal(n.createdBy,alice.uid);
  assert.equal(r.sheet.state.court.length,1);
  assert.equal(r.sheet.state.units[1].commanderId,r.sheet.state.court[0].id);
});
test('commander: unchanged commander or empty name does not touch records or court',()=>{
  const current={state:{houseId:'h1',schemaVersion:1,units:[{id:'u1',commanderName:'Ser Álvaro',commanderId:'m1'}]},version:1};
  const r=applyNobleHouseOperation({actor:alice,request:{...unitReq([{id:'u1',name:'A',commanderName:'Ser Álvaro',commanderId:'m1'},
    {id:'u2',name:'B',commanderName:'  '}],null,'unit_state'),version:1},currentSheet:current,existingLedger:null,commanderContext:ctx([])});
  assert.equal(r.newRecords.length,0);
  assert.equal('court' in r.sheet.state,false);
  assert.equal(r.sheet.state.units[0].commanderId,'m1');
});
test('commander: invalid units and the version check come first',()=>{
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:unitReq('x'),currentSheet:null,existingLedger:null,commanderContext:ctx([])})),'invalid');
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:{...unitReq([{id:'u',commanderName:'X'}]),version:3},
    currentSheet:{state:{},version:1},existingLedger:null,commanderContext:ctx([])})),'conflict');
});
