import test from 'node:test';
import assert from 'node:assert/strict';
import {filterWorkspaceRecords,mayReadWorkspaceRecord,listWorkspaceRecords,WorkspaceRecordError}
  from './workspace-records.mjs';
const player={uid:'u1',profile:'jogador',playerId:'p1',memberHouseIds:['h1']};
const narrator={uid:'gm',profile:'narrador',playerId:null,memberHouseIds:[]};
const row=(id,house_id,visibility,player_id=null,kind='document')=>({
 id,house_id,visibility,player_id,kind,title:'Documento '+id,
 content:'CONTEUDO PRIVADO '+id,version:1,updated_at:'2026-11-19T00:00:00Z',
});
const input=[
 row('a','h1','house'),row('b','h2','house'),
 row('c',null,'player','p1'),row('d',null,'player','p2'),
 row('e',null,'gm'),row('f','h1','player','p2'),
];
test('reuses original SQL record visibility and current Firebase membership',()=>{
 const items=filterWorkspaceRecords(input,player);
 assert.deepEqual(items.map(x=>x.id).sort(),['a','c']);
 assert.deepEqual(filterWorkspaceRecords(input,player,{houseId:'h1'})
   .map(x=>x.id).sort(),['a','c']);
 assert.deepEqual(filterWorkspaceRecords(input,narrator)
   .map(x=>x.id).sort(),['a','b','c','d','e','f']);
 assert.equal(mayReadWorkspaceRecord(player,input[4]),false);
 assert.equal(mayReadWorkspaceRecord(narrator,input[4]),true);
 assert.deepEqual(filterWorkspaceRecords(input,player,{kind:'character'}),[]);
});
test('an unauthorized House query never falls back to real records',()=>{
 for(const inputArg of [{houseId:'h2'},{houseId:'../h1'},{kind:'@'}])
  assert.throws(()=>filterWorkspaceRecords(input,player,inputArg),WorkspaceRecordError);
 assert.throws(()=>filterWorkspaceRecords(input,{...player,memberHouseIds:[]},
   {houseId:'h1'}),WorkspaceRecordError);
 assert.throws(()=>filterWorkspaceRecords(input,{...player,profile:'editor'}),WorkspaceRecordError);
});
test('unexpected malformed imported rows fail before any projection',()=>{
 const bad=input.map(x=>({...x}));bad[0].version='1';
 assert.throws(()=>filterWorkspaceRecords(bad,player),/workspace_record_invalid/);
 assert.ok(!JSON.stringify(filterWorkspaceRecords(input,player)).includes('CONTEUDO DE OUTRA CASA'));
});

test('denied House and invalid query do not touch the imported Firestore rows',async()=>{
 const db={collection(){throw Error('SHOULD_NOT_READ_PRIVATE_SOURCE');}};
 await assert.rejects(
   listWorkspaceRecords(db,'a'.repeat(64),player,{houseId:'h2'}),
   e=>e instanceof WorkspaceRecordError&&e.code==='access_denied'&&e.status===403);
 await assert.rejects(
   listWorkspaceRecords(db,'a'.repeat(64),player,{kind:'bad/query'}),
   e=>e instanceof WorkspaceRecordError&&e.code==='invalid_record_request');
});
