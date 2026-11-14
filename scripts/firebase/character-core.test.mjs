import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCharacterSave,validateRelation,applyReviewAction,characterAgeState,
  requireNarrator,CharacterError} from './character-core.mjs';

const U1='11111111-1111-4111-8111-111111111111',U2='22222222-2222-4222-8222-222222222222',
  U3='33333333-3333-4333-8333-333333333333';
const R='justificativa longa';
const he=h=>h==='h1';
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof CharacterError);return e.code;}return null;};
const save=(o={})=>applyCharacterSave({actorUid:'n',id:null,version:null,reason:R,current:null,
  houseExists:he,newId:U1,payload:{displayName:' Ana ',houseId:'h1',birthYear:1500,...(o.payload||{})},...o.rest});

test('narrator only',()=>{
  assert.equal(code(()=>requireNarrator({active:true,profile:'jogador',admin:false})),'denied');
  assert.doesNotThrow(()=>requireNarrator({active:true,profile:'narrador',admin:true}));
});
test('create normalizes, version 1, audit',()=>{
  const r=save();assert.equal(r.character.displayName,'Ana');assert.equal(r.character.version,1);
  assert.equal(r.audit.action,'create');
});
test('validations',()=>{
  assert.equal(code(()=>save({payload:{houseId:'nope'}})),'invalid');
  assert.equal(code(()=>save({rest:{reason:'curto'}})),'invalid');
  assert.equal(code(()=>save({payload:{visibility:'house',houseId:null}})),'invalid');
  assert.equal(code(()=>save({payload:{agePolicy:'manual_exception'}})),'invalid');
  assert.equal(code(()=>save({payload:{deathYear:1400}})),'invalid');
  assert.equal(code(()=>save({payload:{baselineAge:10}})),'invalid');
  assert.equal(code(()=>save({rest:{version:2}})),'invalid');
});
test('inconsistent age baseline flags conflict',()=>{
  const r=save({payload:{birthYear:1500,baselineAge:10,baselineYear:1520}});
  assert.equal(r.character.reviewStatus,'conflict');
});
test('update needs matching version and bumps it',()=>{
  const cur=save().character;
  assert.equal(code(()=>save({rest:{id:U1,version:5,current:cur}})),'conflict');
  const r=save({rest:{id:U1,version:1,current:cur}});assert.equal(r.character.version,2);
  assert.equal(r.audit.action,'update');
});
test('relations: cycle, duplicates, symmetric',()=>{
  const known=new Set([U1,U2,U3]);
  const parents=[{from:U1,to:U2},{from:U2,to:U3}];
  const base={reason:R,existing:[],parentEdges:parents,knownIds:known};
  assert.equal(code(()=>validateRelation({...base,from:U3,to:U1,relation:'parent'})),'conflict');
  assert.equal(code(()=>validateRelation({...base,from:U1,to:U1,relation:'parent'})),'invalid');
  assert.equal(code(()=>validateRelation({...base,from:U1,to:U2,relation:'spouse',
    existing:[{relation:'spouse',from:U2,to:U1}]})),'conflict');
  assert.equal(code(()=>validateRelation({...base,from:U1,to:U3,relation:'parent'})),null);
});
test('review actions',()=>{
  const q={status:'pending',houseId:'h1',sourceKind:'campaign_house',sourceKey:'k',sourceVisibility:'gm',evidence:{}};
  const ch={houseId:'h1'};
  const ok=applyReviewAction({queueItem:q,action:'link',characterId:U1,reason:R,character:ch,existingLink:null});
  assert.equal(ok.status,'linked');assert.ok(ok.link);
  assert.equal(code(()=>applyReviewAction({queueItem:q,action:'link',characterId:U1,reason:R,character:{houseId:'h2'},existingLink:null})),'conflict');
  assert.equal(code(()=>applyReviewAction({queueItem:q,action:'link',characterId:U1,reason:R,character:ch,existingLink:{characterId:U2}})),'conflict');
  assert.equal(code(()=>applyReviewAction({queueItem:{...q,status:'linked'},action:'ignore',reason:R})),'conflict');
  assert.equal(code(()=>applyReviewAction({queueItem:q,action:'ignore',characterId:U1,reason:R})),'invalid');
});
test('age state follows the SQL gates',()=>{
  const c={reviewStatus:'reviewed',confidence:'confirmed',agePolicy:'year_turn',birthYear:1500,
    aliveStatus:'alive',deathYear:null,baselineAge:null,baselineYear:null};
  assert.deepEqual(characterAgeState(c,1520,1),{as_of_year:1520,life:'alive',status:'ok',age:20,birth_year:1500,death_year:null});
  assert.equal(characterAgeState(c,1520,0).status,'pending_source');
  assert.equal(characterAgeState({...c,reviewStatus:'pending'},1520,1).status,'pending_review');
  assert.equal(characterAgeState(c,1490,1).status,'not_born');
  const d={...c,aliveStatus:'deceased',deathYear:1510};
  assert.equal(characterAgeState(d,1520,1).age,10);assert.equal(characterAgeState(d,1520,1).status,'deceased');
  assert.equal(characterAgeState(d,1505,1).life,'alive');
  assert.equal(characterAgeState({...c,aliveStatus:'alive',deathYear:1510},1520,1).status,'conflict');
});
