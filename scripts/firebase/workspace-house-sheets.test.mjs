import test from 'node:test';
import assert from 'node:assert/strict';
import {projectWorkspaceHouseSheets,listWorkspaceHouseSheets,
  WorkspaceHouseError} from './workspace-house-sheets.mjs';
const scope={uid:'u1',profile:'jogador',memberHouseIds:['house-one']};
const rows=()=>[
 {house_id:'house-one',version:5,state:{
   houseId:'house-one',phase:'active',units:[{
     id:'unit-1',name:'Cavaleiros',types:['cavalry'],
     strength:100,casualties:8,health:5,xp:20,
   }],holdings:[{id:'holding-1',name:'Fortaleza',
     itemId:'fortress',status:'active',domainId:'domain-one'}],
   projects:[],court:[],domains:[],
 }},
 {house_id:'house-two',version:3,state:{
   houseId:'house-two',phase:'active',units:[{
     id:'unit-2',name:'SECRET TROOP',types:['elite'],strength:80,
   }],holdings:[],projects:[],court:[],domains:[],
 }},
];
test('only verified House receives the real imported roster; narrator sees all',()=>{
 const result=projectWorkspaceHouseSheets(rows(),scope);
 assert.equal(result.total,1);
 assert.equal(result.units,1);
 assert.equal(result.holdings,1);
 assert.equal(result.items[0].units[0].casualties,8);
 assert.ok(!JSON.stringify(result).includes('SECRET TROOP'));
 const narrator=projectWorkspaceHouseSheets(rows(),
   {uid:'narrator',profile:'narrador',memberHouseIds:[]});
 assert.equal(narrator.total,2);
 assert.equal(narrator.units,2);
});
test('editor and unauthorized House requests are rejected before Firestore I/O',async()=>{
 const db={collection(){throw Error('PRIVATE_READ_CANNOT_OCCUR');}};
 await assert.rejects(listWorkspaceHouseSheets(db,'a'.repeat(64),
   {...scope,profile:'editor'},{}),e=>
   e instanceof WorkspaceHouseError&&e.status===403);
 await assert.rejects(listWorkspaceHouseSheets(db,'a'.repeat(64),scope,
   {houseId:'house-two'}),e=>
   e instanceof WorkspaceHouseError&&e.status===403);
});
test('duplicate or mismatched sheet history is blocked without disclosure',()=>{
 const data=rows();
 data[0].state.houseId='house-two';
 assert.throws(()=>projectWorkspaceHouseSheets(data,scope),
   WorkspaceHouseError);
 const duplicate=rows();
 duplicate.push(duplicate[0]);
 assert.throws(()=>projectWorkspaceHouseSheets(duplicate,scope),
   WorkspaceHouseError);
});
