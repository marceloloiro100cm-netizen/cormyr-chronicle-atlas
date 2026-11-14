import test from 'node:test';
import assert from 'node:assert/strict';
import {recordScopeOf,canReadRecord,canEditRecord,applyRecordCreate,applyRecordSave,
  applyImportedSource,RecordError} from './record-core.mjs';

const mk=(uid,o)=>recordScopeOf(uid,{userId:uid,active:true,requirePasswordChange:false,...o});
const narrator=mk('n',{profile:'narrador',admin:true});
const alice=mk('a',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['h1','h2'],editHouseIds:['h1']});
const bob=mk('b',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['h2'],editHouseIds:['h2']});
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof RecordError);return e.code;}return null;};
const rec=(o={})=>({id:'r1',houseId:'h1',playerId:null,visibility:'house',kind:'document',title:'T',content:'C',
  version:1,createdBy:'a',updatedBy:'a',syncState:'synced',sourceFileId:null,...o});

test('scope: editor, inactive and malformed are denied',()=>{
  assert.equal(code(()=>recordScopeOf('e',{userId:'e',active:true,profile:'editor',admin:false})),'denied');
  assert.equal(code(()=>recordScopeOf('a',{userId:'a',active:false,profile:'narrador',admin:true})),'denied');
  assert.equal(code(()=>recordScopeOf('a',null)),'denied');
});
test('read: narrator all, house members, player owner; gm only narrator',()=>{
  assert.equal(canReadRecord(narrator,rec({visibility:'gm'})),true);
  assert.equal(canReadRecord(alice,rec({visibility:'gm'})),false);
  assert.equal(canReadRecord(alice,rec()),true);
  assert.equal(canReadRecord(bob,rec()),false);
  assert.equal(canReadRecord(alice,rec({visibility:'player',playerId:'pA'})),true);
  assert.equal(canReadRecord(bob,rec({visibility:'player',playerId:'pA',houseId:'h2'})),false);
});
test('edit: needs edit rights on the house; member-only cannot; player record needs ownership+house edit',()=>{
  assert.equal(canEditRecord(alice,rec()),true);
  assert.equal(canEditRecord(alice,rec({houseId:'h2'})),false);
  assert.equal(canEditRecord(alice,rec({visibility:'player',playerId:'pA'})),true);
  assert.equal(canEditRecord(alice,rec({visibility:'player',playerId:'pB'})),false);
  assert.equal(canEditRecord(alice,rec({visibility:'player',playerId:'pA',houseId:null})),false);
  assert.equal(canEditRecord(alice,rec({visibility:'gm'})),false);
});
test('save: version guard, bump, pending sync, version row',()=>{
  const r=rec();
  assert.equal(code(()=>applyRecordSave({actor:alice,record:r,version:2,title:'x',content:'y'})),'conflict');
  assert.equal(code(()=>applyRecordSave({actor:bob,record:r,version:1,title:'x',content:'y'})),'denied');
  const ok=applyRecordSave({actor:alice,record:r,version:1,title:'Novo',content:'Texto'});
  assert.equal(ok.record.version,2);assert.equal(ok.record.syncState,'pending');
  assert.equal(ok.version.version,2);assert.equal(ok.version.houseId,'h1');
  assert.equal(code(()=>applyRecordSave({actor:alice,record:r,version:1,title:'',content:''})),'invalid');
});
test('create: validates links and permissions',()=>{
  const base={actor:alice,newId:'n1',houseExists:h=>['h1','h2'].includes(h),playerExists:p=>p==='pA'};
  const input={visibility:'house',kind:'document',houseId:'h1',title:'T',content:''};
  assert.equal(applyRecordCreate({...base,input}).record.version,1);
  assert.equal(code(()=>applyRecordCreate({...base,input:{...input,houseId:'h2'}})),'denied');
  assert.equal(code(()=>applyRecordCreate({...base,input:{...input,houseId:null}})),'invalid');
  assert.equal(code(()=>applyRecordCreate({...base,input:{...input,houseId:'zz'}})),'invalid');
  assert.equal(code(()=>applyRecordCreate({...base,input:{...input,visibility:'gm'}})),'denied');
  assert.equal(applyRecordCreate({...base,actor:narrator,input:{...input,visibility:'gm',houseId:null}}).record.visibility,'gm');
});
test('imported source only when untouched',()=>{
  assert.equal(applyImportedSource({record:rec({sourceFileId:'f',version:1}),content:'n',modifiedAt:'x'}).record.version,2);
  assert.equal(code(()=>applyImportedSource({record:rec({sourceFileId:'f',version:2}),content:'n'})),'conflict');
  assert.equal(code(()=>applyImportedSource({record:rec(),content:'n'})),'conflict');
});
