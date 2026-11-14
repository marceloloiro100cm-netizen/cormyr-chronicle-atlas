import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readableHouseScope,safeHouseCatalog} from './house-view-service.mjs';
const a={userId:'u1',active:true,admin:false,profile:'jogador',
  memberHouseIds:['house-a'],editHouseIds:[],rosterHouseId:'house-b'};
test('roster never creates authority; memberships and active profile do',()=>{
 assert.equal(readableHouseScope('u1',a,'house-a'),true);
 assert.equal(readableHouseScope('u1',a,'house-b'),false);
 assert.equal(readableHouseScope('u2',a,'house-a'),false);
 assert.equal(readableHouseScope('u1',{...a,active:false},'house-a'),false);
 assert.equal(readableHouseScope('u1',{...a,requirePasswordChange:true},'house-a'),false);
 assert.equal(readableHouseScope('u1',{...a,profile:'editor'},'house-a'),false);
 assert.equal(readableHouseScope('u1',{...a,profile:'narrador',admin:true},'house-b'),true);
});
test('public house catalog never exposes extra fields and remains authenticated',()=>{
 const input=[{sourceId:'a',name:'B',active:true,season:2,secret:'x'},
 {sourceId:'b',name:'A',active:true,season:2,secret:'y'},
 {sourceId:'c',name:'C',active:false,season:2}];
 assert.deepEqual(safeHouseCatalog('u1',a,input),[{id:'b',name:'A'},{id:'a',name:'B'}]);
 assert.deepEqual(safeHouseCatalog('u2',a,input),[]);
 assert.deepEqual(safeHouseCatalog('u1',{...a,active:false},input),[]);
});
