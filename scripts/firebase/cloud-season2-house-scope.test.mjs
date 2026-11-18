import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSeason2HouseScopeValid as valid} from './cloud-season2-house-scope.mjs';

const doc=(id,overrides={})=>({exists:true,data:()=>({
  sourceId:id,active:true,season:2,...overrides,
})});
const base=()=>({memberHouseIds:['house-a','house-b'],
  editHouseIds:['house-a'],
  houseDocuments:[doc('house-a'),doc('house-b')]});
test('only active season-2 Houses in trusted order authorize private scope',()=>{
  assert.equal(valid(base()),true);
  for(const overrides of [
    {memberHouseIds:['house-a'],houseDocuments:[doc('house-a'),doc('house-b')]},
    {memberHouseIds:[],editHouseIds:[],houseDocuments:[]},
    {memberHouseIds:['house-a','house-a'],houseDocuments:[doc('house-a'),doc('house-a')]},
    {editHouseIds:['house-b','house-b']},
    {editHouseIds:['house-c']},
    {houseDocuments:[doc('house-b'),doc('house-a')]},
    {houseDocuments:[doc('house-a'),doc('house-b',{active:false})]},
    {houseDocuments:[doc('house-a'),doc('house-b',{season:1})]},
    {houseDocuments:[doc('house-a'),{exists:false,data:()=>undefined}]},
    {houseDocuments:[doc('house-a'),{exists:true,data:()=>{throw Error('PRIVATE_HOUSE');}}]},
    {memberHouseIds:['house-a','../private'],houseDocuments:[doc('house-a'),doc('../private')]},
    {memberHouseIds:['house-a','house/b'],houseDocuments:[doc('house-a'),doc('house/b')]},
  ]){
    assert.equal(valid({...base(),...overrides}),false,
      'invalid member or House state must be denied');
  }
});
test('no client can omit the independently read House data to gain access',()=>{
  assert.equal(valid({...base(),houseDocuments:null}),false);
  assert.equal(valid({...base(),houseDocuments:[]}),false);
  assert.equal(valid({memberHouseIds:['house-a'],
    editHouseIds:['house-a'],houseDocuments:[{exists:true,data:()=>({
      sourceId:'house-a',active:true,season:3,
    })}]}),false);
});
