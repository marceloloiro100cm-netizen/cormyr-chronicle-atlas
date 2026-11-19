import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCurrentAccountAccess} from './operational-account-access.mjs';

const root={status:'active',private:true,applicationEnabled:true,
 sourceSnapshotReconciled:true};
const source={userId:'uid-1',profile:'jogador',admin:false,active:true,
 requirePasswordChange:false,playerId:'p-1',memberHouseIds:['house-a'],editHouseIds:['house-a'],attrHouseIds:[],rosterHouseId:'house-a'};
const overlay={...source,memberHouseIds:['house-b'],editHouseIds:[],rosterHouseId:'house-b'};

test('overlay operacional substitui acesso histórico sem modificar o original',()=>{
 const next=chooseCurrentAccountAccess('uid-1',source,overlay,root);
 assert.deepEqual(next.memberHouseIds,['house-b']);
 assert.deepEqual(source.memberHouseIds,['house-a']);
});
test('sem runtime reconciliado a autorização nunca usa overlay',()=>{
 assert.throws(()=>chooseCurrentAccountAccess('uid-1',source,overlay,
   {...root,sourceSnapshotReconciled:false}),/invalid_access_scope/);
});
test('ninguém pode elevar papel de Narrador por overlay',()=>{
 assert.throws(()=>chooseCurrentAccountAccess('uid-1',{...source,profile:'narrador'},
   overlay,root),/invalid_access_scope/);
 assert.throws(()=>chooseCurrentAccountAccess('uid-1',source,
   {...overlay,profile:'narrador',admin:true},root),/invalid_access_scope/);
});
test('conta de Editor-Chefe não pode receber Casa',()=>{
 assert.throws(()=>chooseCurrentAccountAccess('uid-1',source,
  {...overlay,profile:'editor',playerId:null,memberHouseIds:['house-b']},root),
  /invalid_access_scope/);
});
test('sem overlay a leitura histórica permanece compatível',()=>{
 assert.deepEqual(chooseCurrentAccountAccess('uid-1',source,null,null),source);
});

test('atributos só podem abranger Casas editáveis e Casa principal deve pertencer à conta',()=>{
 assert.throws(()=>chooseCurrentAccountAccess('uid-1',source,{
   ...overlay,attrHouseIds:['house-a'],
 },root),/invalid_access_scope/);
 assert.throws(()=>chooseCurrentAccountAccess('uid-1',source,{
   ...overlay,rosterHouseId:'house-a',
 },root),/invalid_access_scope/);
 assert.deepEqual(chooseCurrentAccountAccess('uid-1',source,{
   ...overlay,editHouseIds:['house-b'],attrHouseIds:['house-b'],
 },root).attrHouseIds,['house-b']);
});
