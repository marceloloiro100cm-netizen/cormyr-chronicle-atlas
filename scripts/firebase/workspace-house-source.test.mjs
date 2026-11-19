import test from 'node:test';
import assert from 'node:assert/strict';
import {listImportedHouseSheets,getImportedHouseSheet,
  loadImportedHouseSheets,HouseSourceError} from './workspace-house-source.mjs';
const player={uid:'firebase-u1',profile:'jogador',playerId:'p1',memberHouseIds:['h1']};
const gm={uid:'firebase-gm',profile:'narrador',playerId:null,memberHouseIds:[]};
const state=house=>({schemaVersion:1,houseId:house,phase:'active',
  base:{power:25,wealth:15},permanent:{power:2,wealth:1},
  units:[{id:house+'u',name:'Lanceiros',types:['infantry'],training:'trained',
    strength:100,casualties:7,health:8,xp:3,equipment:['lança']}],
  holdings:[{id:house+'b',name:'Forja',itemId:'forge',status:'active',
    category:'improvement',costs:[{resource:'wealth',amount:3,mode:'allocation'}]}],
  projects:[{id:house+'p',name:'Muralha',status:'building',start:10,duration:4}],
  domains:[{id:house+'d',name:'Vale',terrain:'hills',features:['river']}],
  court:[{id:house+'c',name:'Cortesão'}]});
const data=()=>({
 campaign_houses:[{id:'h1',name:'Ashkar'},{id:'h2',name:'Goldfin'}],
 noble_house_sheets:[{house_id:'h1',version:3,state:state('h1')},
   {house_id:'h2',version:6,state:state('h2')}],
 noble_house_ledger:[{id:'l1',house_id:'h1',version:3,action:'purchase',
   explanation:'Forja',rule:'wealth',campaign_month:18255},
   {id:'l2',house_id:'h2',version:6,action:'purchase',
   explanation:'OUTRA CASA',rule:'wealth',campaign_month:18255}],
});
test('House list exposes real counts only to authorized House or Narrator',()=>{
 const mine=listImportedHouseSheets(data(),player);
 assert.equal(mine.items.length,1);
 assert.equal(mine.items[0].houseName,'Ashkar');
 assert.equal(mine.items[0].units,1);
 assert.equal(mine.items[0].holdings,1);
 assert.equal(mine.items[0].ledgerEntries,1);
 assert.ok(!JSON.stringify(mine).includes('Goldfin'));
 const narrator=listImportedHouseSheets(data(),gm);
 assert.equal(narrator.items.length,2);
});
test('House details expose units, buildings, projects, resources and bounded ledger',()=>{
 const detail=getImportedHouseSheet(data(),player,'h1');
 assert.equal(detail.summary.version,3);
 assert.equal(detail.units[0].name,'Lanceiros');
 assert.equal(detail.holdings[0].name,'Forja');
 assert.equal(detail.projects[0].name,'Muralha');
 assert.equal(detail.summary.base.wealth,15);
 assert.equal(detail.ledger[0].action,'purchase');
 assert.ok(!JSON.stringify(detail).includes('OUTRA CASA'));
 assert.throws(()=>getImportedHouseSheet(data(),player,'h2'),
   e=>e instanceof HouseSourceError&&e.status===403);
});
test('cross-House and editor requests reject before touching Firestore',async()=>{
 const db={collection(){throw Error('UNAUTHORIZED_DB_ACCESS');}};
 await assert.rejects(loadImportedHouseSheets(db,'a'.repeat(64),player,'h2'),
   e=>e instanceof HouseSourceError&&e.status===403);
 await assert.rejects(loadImportedHouseSheets(db,'a'.repeat(64),{
   ...player,profile:'editor'
 },undefined),e=>e instanceof HouseSourceError&&e.status===403);
 await assert.rejects(loadImportedHouseSheets(db,'a'.repeat(64),player,'../h1'),
   e=>e instanceof HouseSourceError&&e.status===400);
});
test('corrupted linked House state and duplicates fail without leaking partial rows',()=>{
 const other=data();other.noble_house_sheets[0].state.houseId='h2';
 assert.throws(()=>listImportedHouseSheets(other,gm),HouseSourceError);
 const duplicate=data();duplicate.noble_house_sheets.push(duplicate.noble_house_sheets[0]);
 assert.throws(()=>listImportedHouseSheets(duplicate,gm),HouseSourceError);
});
