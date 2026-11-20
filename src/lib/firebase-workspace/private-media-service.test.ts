import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({
 viewer:{uid:'alice',profile:'jogador',playerId:'p1',
  memberHouseIds:['h1'],editHouseIds:['h1']} as any,
 rows:{} as Record<string,any[]>,
}));
vi.mock('../../../scripts/firebase/cloud-readonly-service.mjs',()=>({
 createFirebaseCloudReadonly:()=>({workspaceScope:async()=>state.viewer}),
}));
vi.mock('./service',()=>({
 createWorkspaceService:()=>({execute:async(_token:string,input:any)=>({
  data:state.rows[input.table]??[],
 })}),
}));
import {createFirebasePrivateMedia} from './private-media-service';
import {privateMediaHash} from './private-media-core';

const snap='a'.repeat(64),root='campaignCloudRuntime/'+snap;
const image=Buffer.from('89504e470d0a1a0a0000000000','hex');
const body={action:'upload',id:'11111111-1111-4111-8111-111111111111',
 contentType:'image/png',dataBase64:image.toString('base64')};
function fixture(afterSave?:(docs:Map<string,any>,blobs:Map<string,Buffer>,path:string)=>void){
 const docs=new Map<string,any>([[root,{
  status:'active',private:true,sourceSnapshotId:snap,
  sourceSnapshotReconciled:true,applicationEnabled:true,
  privateMediaReadApproved:true,privateMediaWriteApproved:true,
 }]]);
 const blobs=new Map<string,Buffer>();
 const reference=(path:string):any=>({
  path,
  collection:(k:string)=>reference(path+'/'+k),
  doc:(id:string)=>reference(path+'/'+id),
  get:async()=>({exists:docs.has(path),data:()=>docs.get(path)}),
 });
 const db={
  collection:(name:string)=>reference(name),
  runTransaction:async<T,>(work:(tx:any)=>Promise<T>)=>{
   const writes:{op:string;path:string;value?:any}[]=[];
   const tx={
    get:(r:any)=>r.get(),
    create:(r:any,value:any)=>writes.push({op:'create',path:r.path,value}),
    update:(r:any,value:any)=>writes.push({op:'update',path:r.path,value}),
   };
   const result=await work(tx);
   for(const w of writes){
    if(w.op==='create'&&docs.has(w.path))throw Error('duplicate');
    docs.set(w.path,w.op==='update'?{...docs.get(w.path),...w.value}:w.value);
   }
   return result;
  },
 };
 const bucket={file:(path:string)=>({
  save:async(data:Buffer)=>{if(blobs.has(path))throw Error('duplicate');
   blobs.set(path,Buffer.from(data));afterSave?.(docs,blobs,path);},
  delete:async()=>{blobs.delete(path);},
  getSignedUrl:async()=>['https://storage.example/signed?exp=60'],
  download:async()=>[blobs.get(path)??Buffer.from('')],
 })};
 return {docs,blobs,api:createFirebasePrivateMedia({
  db,auth:{},bucket,snapshotId:snap,
 })};
}
beforeEach(()=>{
 vi.stubEnv('CORMYR_FIREBASE_PRIVATE_MEDIA_ENABLED','true');
 state.viewer={uid:'alice',profile:'jogador',playerId:'p1',
  memberHouseIds:['h1'],editHouseIds:['h1']};
 state.rows={};
});
afterEach(()=>vi.unstubAllEnvs());
describe('Item 11, gateway privado do Storage',()=>{
 it('verifica bytes, guarda metadata e devolve caminho determinístico',async()=>{
  const f=fixture(),first=await f.api.upload('valid-token',body);
  const path='private/'+snap+'/alice/'+body.id+'.png';
  expect(first).toMatchObject({path,duplicate:false});
  expect(f.blobs.get(path)).toEqual(image);
  expect(f.docs.get(root+'/privateMedia/'+privateMediaHash('private-media:'+path)))
   .toMatchObject({ownerUid:'alice',status:'ready',size:image.length});
  expect(await f.api.upload('valid-token',body))
   .toMatchObject({path,duplicate:true});
  const data=await f.api.download('valid-token',{action:'download',path});
  expect(data.bytes).toEqual(image);
  expect((await f.api.signed('valid-token',{action:'sign',path})).signedUrl)
   .toMatch(/^https:/);
 });
 it('um jogador não lê imagem alheia sem referência autorizada',async()=>{
  const f=fixture(),{path}=await f.api.upload('valid-token',body);
  state.viewer={uid:'bob',profile:'jogador',playerId:'p2',
   memberHouseIds:['h2'],editHouseIds:['h2']};
  await expect(f.api.signed('valid-token',{action:'sign',path}))
   .rejects.toThrow('private_media_denied');
  state.rows['campaign_letters']=[{content:'[cormyr-image:'+path+'|Leitura]'}];
  expect((await f.api.signed('valid-token',{action:'sign',path})).signedUrl)
   .toContain('signed');
 });

 it('brasão da Casa fica visível aos membros autorizados e ao Narrador',async()=>{
  const f=fixture(),{path}=await f.api.upload('valid-token',body);
  f.docs.set(root+'/privateMediaHouseLinks/'+
   privateMediaHash('house-crest:'+path),{
   path,sourceSnapshotId:snap,houseId:'h1',ownerUid:'alice',version:1,
  });
  f.docs.set(root+'/houseEconomies/'+privateMediaHash('house:h1'),{
   houseId:'h1',sourceSnapshotId:snap,sourceReconciled:true,status:'active',
   state:{houseId:'h1',identity:{crestPath:path}},
  });
  state.viewer={uid:'bob',profile:'jogador',playerId:'p2',
   memberHouseIds:['h2'],editHouseIds:['h2']};
  await expect(f.api.signed('valid-token',{action:'sign',path}))
   .rejects.toThrow('private_media_denied');
  state.viewer={uid:'clara',profile:'jogador',playerId:'p3',
   memberHouseIds:['h1'],editHouseIds:['h1']};
  expect((await f.api.signed('valid-token',{action:'sign',path})).signedUrl)
   .toContain('signed');
  state.viewer={uid:'narrator',profile:'narrador',playerId:null,
   memberHouseIds:[],editHouseIds:[]};
  expect((await f.api.signed('valid-token',{action:'sign',path})).signedUrl)
   .toContain('signed');
  f.docs.set(root+'/houseEconomies/'+privateMediaHash('house:h1'),{
   houseId:'h1',sourceSnapshotId:snap,sourceReconciled:true,status:'active',
   state:{houseId:'h1',identity:{crestPath:'arquivo-substituido'}},
  });
  await expect(f.api.signed('valid-token',{action:'sign',path}))
   .rejects.toThrow('private_media_denied');
 });
 it('não publica nem conserva bytes corrompidos durante o upload',async()=>{
  const f=fixture((_docs,blobs,path)=>blobs.set(path,Buffer.alloc(image.length)));
  await expect(f.api.upload('valid-token',body))
   .rejects.toThrow('private_media_integrity_failed');
  const path='private/'+snap+'/alice/'+body.id+'.png';
  expect(f.blobs.has(path)).toBe(false);
  expect(f.docs.get(root+'/privateMedia/'+privateMediaHash('private-media:'+path)))
   .toMatchObject({status:'pending'});
  expect(f.docs.has(root+'/privateMediaAudits/'+privateMediaHash('upload:'+path)))
   .toBe(false);
 });
 it.each([
  ['status','inactive'],['private',false],['sourceSnapshotId','b'.repeat(64)],
  ['sourceSnapshotReconciled',false],['applicationEnabled',false],
  ['privateMediaReadApproved',false],['privateMediaWriteApproved',false],
 ] as const)('nega confirmação se %s for revogado durante o envio',async(field,value)=>{
  const f=fixture(docs=>docs.set(root,{...docs.get(root),[field]:value}));
  await expect(f.api.upload('valid-token',body))
   .rejects.toThrow('private_media_upload_revoked');
  const path='private/'+snap+'/alice/'+body.id+'.png';
  expect(f.blobs.has(path)).toBe(false);
  expect(f.docs.get(root+'/privateMedia/'+privateMediaHash('private-media:'+path)))
   .toMatchObject({status:'pending'});
  expect(f.docs.has(root+'/privateMediaAudits/'+privateMediaHash('upload:'+path)))
   .toBe(false);
 });
 it('não apaga objeto já existente após falha por geração duplicada',async()=>{
  const f=fixture(),path='private/'+snap+'/alice/'+body.id+'.png';
  const original=Buffer.from(image);
  f.blobs.set(path,original);
  await expect(f.api.upload('valid-token',body)).rejects.toThrow('duplicate');
  expect(f.blobs.get(path)).toEqual(original);
  const meta=f.docs.get(root+'/privateMedia/'+privateMediaHash('private-media:'+path));
  expect(meta).toMatchObject({status:'pending',ownerUid:'alice'});
 });
 it('rejeita MIME forjado, flag de homologação e conta editorial',async()=>{
  const f=fixture(),docs=f.docs;
  await expect(f.api.upload('valid-token',{...body,dataBase64:Buffer.from('fake').toString('base64')}))
   .rejects.toThrow('private_media_upload_invalid');
  docs.set(root,{...docs.get(root),privateMediaWriteApproved:false});
  await expect(f.api.upload('valid-token',body))
   .rejects.toThrow('private_media_not_approved');
  docs.set(root,{...docs.get(root),privateMediaWriteApproved:true});
  state.viewer={uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  await expect(f.api.upload('valid-token',body)).rejects.toThrow('private_media_denied');
 });
});
