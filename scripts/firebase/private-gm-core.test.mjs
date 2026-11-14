import test from 'node:test';
import assert from 'node:assert/strict';
import {startRepresentation,stopRepresentation,requireSession,readAs,requireNarrator,auditFor,SESSION_MS,PrivateGmError} from './private-gm-core.mjs';

const player={id:'p1',userId:'u1',active:true,requirePasswordChange:false};
const pa={userId:'u1',active:true,profile:'jogador',admin:false,requirePasswordChange:false,playerId:'p1',
  memberHouseIds:['h1'],editHouseIds:['h1']};
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof PrivateGmError||e.code);return e.code;}return null;};
const t0=new Date('2026-01-01T00:00:00Z');

test('narrator guard',()=>{
  requireNarrator({active:true,profile:'narrador',admin:true,requirePasswordChange:false});
  for(const raw of [null,{active:false,profile:'narrador',admin:true},{active:true,profile:'jogador',admin:false},
    {active:true,profile:'narrador',admin:true,requirePasswordChange:true}])
    assert.equal(code(()=>requireNarrator(raw)),'denied');
});
test('start: 30 minute session, audited; refuses inactive players and admin accounts',()=>{
  const r=startRepresentation({actorUid:'n',player,playerAccess:pa,now:t0});
  assert.equal(Date.parse(r.session.expiresAt)-t0.getTime(),SESSION_MS);
  assert.equal(r.audit.action,'representation_start');
  assert.equal(code(()=>startRepresentation({actorUid:'n',player:{...player,active:false},playerAccess:pa})),'invalid');
  assert.equal(code(()=>startRepresentation({actorUid:'n',player:{...player,userId:null},playerAccess:pa})),'invalid');
  assert.equal(code(()=>startRepresentation({actorUid:'n',player:{...player,requirePasswordChange:true},playerAccess:pa})),'invalid');
  assert.equal(code(()=>startRepresentation({actorUid:'n',player,playerAccess:{...pa,admin:true}})),'denied');
});
test('stop audits only when a session exists',()=>{
  assert.equal(stopRepresentation({actorUid:'n',session:null}).audit,null);
  assert.equal(stopRepresentation({actorUid:'n',session:{playerId:'p1'}}).audit.action,'representation_stop');
});
test('session validity: expiry, inactive player and stale access',()=>{
  const s=startRepresentation({actorUid:'n',player,playerAccess:pa,now:t0}).session;
  const ok=requireSession({session:s,player,playerAccess:pa,now:new Date(t0.getTime()+1000)});
  assert.equal(ok.playerId,'p1');
  assert.equal(code(()=>requireSession({session:s,player,playerAccess:pa,now:new Date(t0.getTime()+SESSION_MS)})),'denied');
  assert.equal(code(()=>requireSession({session:null,player,playerAccess:pa})),'denied');
  assert.equal(code(()=>requireSession({session:s,player:{...player,active:false},playerAccess:pa,now:t0})),'denied');
  assert.equal(code(()=>requireSession({session:s,player,playerAccess:{...pa,active:false},now:t0})),'denied');
});
test('read as player sees only the player scope',()=>{
  const scope=requireSession({session:startRepresentation({actorUid:'n',player,playerAccess:pa,now:t0}).session,player,playerAccess:pa,now:t0});
  const houses=[{sourceId:'h1'},{sourceId:'h2'}];
  const records=[{id:'a',visibility:'player',playerId:'p1',houseId:null},{id:'b',visibility:'player',playerId:'p2',houseId:null},
    {id:'c',visibility:'narrator',playerId:null,houseId:null}];
  const out=readAs({scope,player,houses,records});
  assert.deepEqual(out.houses.map(h=>h.sourceId),['h1']);
  assert.deepEqual(out.records.map(r=>r.id),['a']);
});
test('audit entry names the represented entity',()=>{
  assert.equal(auditFor({actorUid:'n',player,action:'save_record',args:{id:'r1'}}).details.entity,'r1');
  assert.equal(auditFor({actorUid:'n',player,action:'send',args:{},resultId:'x'}).action,'representation_send');
});
