import test from 'node:test';
import assert from 'node:assert/strict';
import {houseCharacterAges} from './house-ages-core.mjs';

const nar={userId:'n',active:true,profile:'narrador',admin:true,requirePasswordChange:false};
const jog=(o={})=>({userId:'u',active:true,profile:'jogador',admin:false,requirePasswordChange:false,playerId:'p1',
  memberHouseIds:['h1'],editHouseIds:[],...o});
const ch=(id,o={})=>({id,visibility:'house',ownerUserId:null,reviewStatus:'reviewed',confidence:'confirmed',birthYear:1500,
  baselineAge:null,baselineYear:null,agePolicy:'derived',aliveStatus:'alive',deathYear:null,...o});
const rec=(id,o={})=>({id,houseId:'h1',kind:'character',visibility:'house',playerId:null,...o});
const link=(c,r,o={})=>({characterId:c,sourceKind:'campaign_record',sourceKey:r,sourceVisibility:'house',...o});
const data={characters:[ch('c1'),ch('c2',{visibility:'player',ownerUserId:'u'}),ch('c3',{visibility:'gm'})],
  links:[link('c1','r2'),link('c1','x1',{sourceKind:'drive'}),link('c2','r1',{sourceVisibility:'player'}),link('c3','r3',{sourceVisibility:'gm'})],
  records:[rec('r1',{visibility:'player',playerId:'p1'}),rec('r2'),rec('r3',{visibility:'gm'}),rec('r9',{houseId:'h2'})]};
const code=fn=>{try{fn();}catch(e){return e.code;}return null;};

test('narrator sees every linked record of the house, sorted, with derived ages',()=>{
  const r=houseCharacterAges({uid:'n',raw:nar,houseId:'h1',year:1520,...data});
  assert.deepEqual(r.map(x=>x.record_id),['r1','r2','r3']);
  assert.equal(r.find(x=>x.record_id==='r2').age,20);
  assert.equal(r.find(x=>x.record_id==='r2').status,'ok');
});
test('player sees house-visible and own player-visible links only',()=>{
  const r=houseCharacterAges({uid:'u',raw:jog(),houseId:'h1',year:1520,...data});
  assert.deepEqual(r.map(x=>x.record_id),['r1','r2']);
  const other=houseCharacterAges({uid:'u',raw:jog({playerId:'p2'}),houseId:'h1',year:1520,...data});
  assert.deepEqual(other.map(x=>x.record_id),['r2']);
  const notOwner=houseCharacterAges({uid:'u',raw:jog(),houseId:'h1',year:1520,...data,
    characters:data.characters.map(c=>c.id==='c2'?{...c,ownerUserId:'zz'}:c)});
  assert.deepEqual(notOwner.map(x=>x.record_id),['r2']);
});
test('access rules: member of the house, active access, valid year',()=>{
  assert.equal(code(()=>houseCharacterAges({uid:'u',raw:jog({memberHouseIds:['h9']}),houseId:'h1',year:1520,...data})),'denied');
  assert.equal(code(()=>houseCharacterAges({uid:'u',raw:jog({active:false}),houseId:'h1',year:1520,...data})),'denied');
  assert.equal(code(()=>houseCharacterAges({uid:'x',raw:jog(),houseId:'h1',year:1520,...data})),'denied');
  assert.equal(code(()=>houseCharacterAges({uid:'n',raw:nar,houseId:'h1',year:0,...data})),'invalid');
});
test('a person without a linked source is pending, not aged',()=>{
  const r=houseCharacterAges({uid:'n',raw:nar,houseId:'h1',year:1520,characters:[ch('c1')],
    links:[link('c1','r2')],records:[rec('r2')]});
  assert.equal(r[0].status,'ok');
  const dead=houseCharacterAges({uid:'n',raw:nar,houseId:'h1',year:1530,characters:[ch('c1',{aliveStatus:'deceased',deathYear:1525})],
    links:[link('c1','r2')],records:[rec('r2')]});
  assert.equal(dead[0].status,'deceased');assert.equal(dead[0].age,25);assert.equal(dead[0].death_year,1525);
});
