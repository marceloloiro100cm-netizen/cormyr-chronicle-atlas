/* eslint-disable @typescript-eslint/no-explicit-any -- Firebase Admin boundary. */
import {createFirebaseCloudReadonly} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {createWorkspaceService} from './service';
import {PRIVATE_MEDIA_LIMIT,PRIVATE_MEDIA_UUID,privateMediaType,
 privateMediaHash,privateMediaRef,privateMediaFail,privateMediaReferenced,
 validatePrivateMediaSource} from './private-media-core';

const SHA=/^[a-f0-9]{64}$/;
const b64=/^[A-Za-z0-9+/]+={0,2}$/;
const safe=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128&&
 !/[\/\u0000-\u001f\u007f]/.test(v);
const isObj=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v);

export function createFirebasePrivateMedia({db,auth,bucket,snapshotId}:{
 db:any;auth:any;bucket:any;snapshotId:string;
}){
 if(process.env['CORMYR_FIREBASE_PRIVATE_MEDIA_ENABLED']!=='true')
  privateMediaFail('private_media_disabled',501);
 if(!SHA.test(snapshotId)||!db||typeof db.runTransaction!=='function'||
  typeof bucket?.file!=='function'||process.env['FIRESTORE_EMULATOR_HOST']||
  process.env['FIREBASE_STORAGE_EMULATOR_HOST']||
  process.env['FIREBASE_AUTH_EMULATOR_HOST'])
  privateMediaFail('private_media_unavailable',503);
 const cloud=createFirebaseCloudReadonly({
  db,auth,snapshotId,projectId:'cormyr',enabled:true,
 });
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const scope=async(token:string)=>{
  const viewer=await cloud.workspaceScope(token);
  if(viewer.profile==='editor'||!safe(viewer.uid))
   privateMediaFail('private_media_denied');
  return viewer;
 };
 const approved=async(write=false)=>{
  const doc=await root.get(),value=doc.data();
  if(!doc.exists||value?.status!=='active'||value.private!==true||
     value.sourceSnapshotId!==snapshotId||value.sourceSnapshotReconciled!==true||
     value.applicationEnabled!==true||
     value.privateMediaReadApproved!==true||
     (write&&value.privateMediaWriteApproved!==true))
   privateMediaFail('private_media_not_approved',503);
 };
 const visibleReference=async(token:string,path:string)=>{
  const service=createWorkspaceService({db,auth,snapshotId,cacheImportedTables:true});
  for(const table of ['campaign_records','campaign_letters','letter_replies']){
   const result=await service.execute(token,{kind:'query',table,steps:[]});
   const rows=result?.data;
   if(!Array.isArray(rows))privateMediaFail('private_media_source_unavailable',503);
   if(rows.some((r:any)=>typeof r?.content==='string'&&
      privateMediaReferenced(r.content,path)))return true;
  }
  return false;
 };
 const authorize=async(token:string,path:string)=>{
  if(typeof path!=='string')privateMediaFail('private_media_path_invalid',400);
  validatePrivateMediaSource(path,snapshotId);
  await approved(false);
  const viewer=await scope(token);
  const reference=privateMediaRef(root,path);
  const doc=await reference.get(),meta=doc.data();
  if(!doc.exists||meta?.path!==path||meta?.sourceSnapshotId!==snapshotId||
     !safe(meta.ownerUid)||meta?.status!=='ready'||
     !privateMediaType(meta.contentType)||
     !Number.isSafeInteger(meta.size)||meta.size>PRIVATE_MEDIA_LIMIT)
   privateMediaFail('private_media_not_found',404);
  if(viewer.uid!==meta.ownerUid&&
     !(await visibleReference(token,path)))
   privateMediaFail('private_media_denied');
  const after=await scope(token);
  if(JSON.stringify(after)!==JSON.stringify(viewer))
   privateMediaFail('private_media_denied');
  return {meta,file:bucket.file(path)};
 };
 return {
  async upload(token:string,request:unknown){
   if(!isObj(request)||Object.keys(request).some(k=>
       !['action','id','contentType','dataBase64'].includes(k))||
      request['action']!=='upload'||!PRIVATE_MEDIA_UUID.test(String(request['id']))||
      typeof request['contentType']!=='string'||
      typeof request['dataBase64']!=='string'||
      request['dataBase64'].length>Math.ceil(PRIVATE_MEDIA_LIMIT*4/3)+8||
      !b64.test(request['dataBase64']))
    privateMediaFail('private_media_upload_invalid',400);
   const typed=privateMediaType(request['contentType']);
   if(!typed)privateMediaFail('private_media_type_invalid',415);
   const data=Buffer.from(request['dataBase64'],'base64');
   if(!data.length||data.length>PRIVATE_MEDIA_LIMIT||
      data.toString('base64')!==request['dataBase64']||
      !typed.magic(data))privateMediaFail('private_media_upload_invalid',400);
   await approved(true);
   const viewer=await scope(token),at=new Date().toISOString();
   if(viewer.profile!=='narrador'&&
      (viewer.profile!=='jogador'||!viewer.memberHouseIds.length))
    privateMediaFail('private_media_denied');
   const path='private/'+snapshotId+'/'+viewer.uid+'/'+request['id']+'.'+typed.ext;
   const key=privateMediaRef(root,path),file=bucket.file(path);
   const digest=privateMediaHash(data.toString('base64'));
   const reserve=await db.runTransaction(async(tx:any)=>{
    const [runtime,existing]=await Promise.all([tx.get(root),tx.get(key)]);
    const rt=runtime.data();
    if(!runtime.exists||rt?.privateMediaReadApproved!==true||
       rt?.privateMediaWriteApproved!==true||rt.sourceSnapshotId!==snapshotId||
       rt.sourceSnapshotReconciled!==true||rt.applicationEnabled!==true)
     privateMediaFail('private_media_not_approved',503);
    if(existing.exists){
     const prev=existing.data();
     if(prev?.ownerUid!==viewer.uid||prev?.path!==path||
        prev?.digest!==digest||prev?.contentType!==request['contentType'])
      privateMediaFail('private_media_request_conflict',409);
     if(prev?.status==='ready')return {duplicate:true,path};
     privateMediaFail('private_media_incomplete',409);
    }
    tx.create(key,{path,ownerUid:viewer.uid,sourceSnapshotId:snapshotId,
     status:'pending',contentType:request['contentType'],size:data.length,
     digest,createdAt:at,updatedAt:at});
    return {duplicate:false,path};
   });
   if(reserve.duplicate)return {path,duplicate:true};
   try{
    await file.save(data,{resumable:false,
      preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:request['contentType'],
       cacheControl:'private,max-age=0,no-store'},
    });
    const again=await scope(token);
    if(JSON.stringify(viewer)!==JSON.stringify(again))
     privateMediaFail('private_media_denied');
    await db.runTransaction(async(tx:any)=>{
     const [runtime,current]=await Promise.all([tx.get(root),tx.get(key)]);
     const r=runtime.data(),m=current.data();
     if(!runtime.exists||r?.privateMediaReadApproved!==true||
        r?.privateMediaWriteApproved!==true||
        m?.status!=='pending'||m?.ownerUid!==viewer.uid||
        m?.digest!==digest||m?.path!==path)
      privateMediaFail('private_media_upload_revoked',403);
     const now=new Date().toISOString();
     tx.update(key,{status:'ready',updatedAt:now});
     tx.create(root.collection('privateMediaAudits').doc(privateMediaHash('upload:'+path)),{
      action:'private_media_upload',ownerUid:viewer.uid,path,
      contentType:request['contentType'],size:data.length,occurredAt:now,
      sourceSnapshotId:snapshotId,
     });
    });
    return {path,duplicate:false};
   }catch(error){
    try{await file.delete();}catch{/* cleanup best effort */}
    throw error;
   }
  },
  async signed(token:string,request:unknown){
   if(!isObj(request)||Object.keys(request).some(k=>!['action','path'].includes(k))||
      request['action']!=='sign'||typeof request['path']!=='string')
    privateMediaFail('private_media_request_invalid',400);
   const {file}=await authorize(token,request['path']);
   const expires=Date.now()+60_000;
   const [url]=await file.getSignedUrl({version:'v4',action:'read',expires});
   if(typeof url!=='string'||!url.startsWith('https://'))
    privateMediaFail('private_media_sign_unavailable',503);
   return {signedUrl:url,expiresAt:new Date(expires).toISOString()};
  },
  async download(token:string,request:unknown){
   if(!isObj(request)||Object.keys(request).some(k=>!['action','path'].includes(k))||
      request['action']!=='download'||typeof request['path']!=='string')
    privateMediaFail('private_media_request_invalid',400);
   const {file,meta}=await authorize(token,request['path']);
   const [bytes]=await file.download();
   if(bytes.length!==meta.size||
      privateMediaHash(bytes.toString('base64'))!==meta.digest)
    privateMediaFail('private_media_integrity_failed',503);
   return {bytes,contentType:meta.contentType as string};
  },
 };
}
