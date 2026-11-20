import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {imagePaths,verifyMediaReferences,MediaReferenceError}
 from './private-media-references.mjs';
const snapshot='a'.repeat(64),uid='alice',path='private/'+snapshot+
 '/alice/11111111-1111-4111-8111-111111111111.png';
const token='[cormyr-image:'+path+'|Arquivo da campanha]';
const hash=s=>createHash('sha256').update(s).digest('hex');
const root={collection:name=>({doc:id=>({path:name+'/'+id})})};
const tx={get:async ref=>({exists:ref.path==='privateMedia/'+
 hash('private-media:'+path),data:()=>({
 path,ownerUid:'alice',sourceSnapshotId:snapshot,status:'ready',
 })})};
test('tokens são únicos e não interpretam URLs ou HTML',()=>{
 assert.deepEqual(imagePaths(token+'\n'+token),[path]);
 assert.deepEqual(imagePaths('[cormyr-image:https://evil.test|x]'),[]);
});
test('recusa imagens de outra conta e aceita apenas arquivo READY',async()=>{
 await verifyMediaReferences({tx,root,snapshotId:snapshot,uid,content:token});
 await assert.rejects(()=>verifyMediaReferences({tx,root,
  snapshotId:snapshot,uid:'bob',content:token}),e=>
  e instanceof MediaReferenceError&&e.code==='private_media_reference_denied');
 const broken={get:async()=>({exists:false,data:()=>null})};
 await assert.rejects(()=>verifyMediaReferences({tx:broken,root,
  snapshotId:snapshot,uid,content:token}),e=>e.code==='private_media_reference_denied');
});
test('edição de registro legado preserva token anterior sem novo acesso',async()=>{
 await verifyMediaReferences({tx:{get:()=>{throw Error('não reler');}},
  root,snapshotId:snapshot,uid,content:token,previous:token});
});
