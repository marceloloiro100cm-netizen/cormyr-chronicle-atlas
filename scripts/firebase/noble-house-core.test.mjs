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
  assert.equal(code(run({month:1.5})),'invalid');
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
test('unit actions fail closed until records exist',()=>{
  assert.equal(code(()=>applyNobleHouseOperation({actor:alice,request:req({action:'unit'}),currentSheet:null,existingLedger:null})),'unsupported');
});
