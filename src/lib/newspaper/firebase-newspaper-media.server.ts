/* Firebase-only newsroom media boundary. No legacy bucket writes.
 * Auth and runtime approval are checked before Storage is touched; each
 * immutable object has a Firestore registry row used by editorial publication.
 */
import {createHash,randomUUID} from 'node:crypto';
import {createFirebaseCloudReadonly,CloudAccessError}
 from '../../../scripts/firebase/cloud-readonly-service.mjs';

const SNAP=/^[a-f0-9]{64}$/;
const EDITION=/^cloud-[a-f0-9]{64}$/;
const IMAGE=['image/png','image/jpeg','image/webp'];
const SIZE=15*1024*1024;
const KINDS=['editionImage','editionPdf','commission','engraving'] as const;
type Kind=typeof KINDS[number];
type Scope={uid:string;profile:string;editHouseIds:string[];memberHouseIds:string[]};
type Entry={path:string;kind:Kind;contentType:string;bytes:number;sha256:string;
 sourceSnapshotId:string;createdBy:string;createdAt:string;editionId:string|null;houseId:string|null};
export class NewspaperMediaError extends Error{
 constructor(readonly code:string,readonly status:number=400){super(code);}
}
const fail=(code:string,status=400):never=>{throw new NewspaperMediaError(code,status);};
/** A Cloud error is untrusted. Classify only the denied status, without
 * leaking provider diagnostics or any bucket/object metadata. */
export function classifyNewspaperStorageError(error:unknown):
 'media_storage_permission_denied'|'media_storage_unavailable'{
 if(error&&typeof error==='object'){
  const e=error as {code?:unknown;statusCode?:unknown;status?:unknown};
  if([e.code,e.statusCode,e.status].some(v=>v===403||v===7||
     v==='403'||v==='PERMISSION_DENIED'))
   return 'media_storage_permission_denied';
 }
 return 'media_storage_unavailable';
}
export const newspaperMediaDocId=(path:string)=>createHash('sha256').update('newspaper-media:'+path).digest('hex');
export const newspaperMediaPath=(snapshot:string,kind:Kind,ext:string)=>`newspaper-media/${snapshot}/${kind}/${randomUUID()}.${ext}`;
const detected=(b:Buffer):string|null=>{
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(b.length>=5&&b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 return null;
};
export const isNewspaperMediaPath=(path:unknown,snapshot:string,kind?:Kind):path is string=>
 typeof path==='string'&&SNAP.test(snapshot)&&
 new RegExp('^newspaper-media/'+snapshot+'/'+(kind??'(?:editionImage|editionPdf|commission|engraving)')+
 '/[0-9a-f]{8}-[0-9a-f-]{27,36}\\.(?:png|jpe?g|webp|pdf)$').test(path)&&
 !path.includes('..');
export const validateNewspaperMediaUpload=(raw:unknown)=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('invalid_media');
 const v=raw as Record<string,unknown>;
 if(v['action']!=='upload'||!KINDS.includes(v['kind'] as Kind)||
    typeof v['dataBase64']!=='string'||v['dataBase64'].length>21_000_000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v['dataBase64'])||
    (v['editionId']!==undefined&&typeof v['editionId']!=='string')||
    (v['houseId']!==undefined&&typeof v['houseId']!=='string')||
    Object.keys(v).some(k=>!['action','kind','editionId','houseId','dataBase64','contentType'].includes(k)))
   fail('invalid_media');
 const bytes=Buffer.from(v['dataBase64'] as string,'base64');
 if(bytes.length<1||bytes.length>SIZE||bytes.toString('base64')!==v['dataBase64'])fail('invalid_media_size',413);
 const type=detected(bytes);
 if(!type||type!==v['contentType']||
    (v['kind']==='editionPdf'?type!=='application/pdf':!IMAGE.includes(type)))
   fail('invalid_media_type',415);
 return {kind:v['kind'] as Kind,editionId:v['editionId'] as string|undefined,
  houseId:v['houseId'] as string|undefined,bytes,contentType:type as string};
};
const extension=(type:string)=>type==='image/png'?'png':type==='image/webp'?'webp':
 type==='image/jpeg'?'jpg':'pdf';
export function createNewspaperMediaService({db,auth,bucket,snapshotId,env=process.env}:{
 db:any;auth:any;bucket:any;snapshotId:string;env?:NodeJS.ProcessEnv
}){
 if(!SNAP.test(snapshotId)||!db?.collection||!auth?.verifyIdToken||!bucket?.file)
  fail('media_not_ready',503);
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 const registry=runtime.collection('newspaperMedia');
 const root=db.collection('migrationNewspaperRuntimeStage').doc(snapshotId);
 const cloud=createFirebaseCloudReadonly({db,auth,snapshotId,projectId:'cormyr',enabled:true});
 const ready=async()=>{
  let stage,live;
  try{[stage,live]=await Promise.all([root.get(),runtime.get()]);}
  catch{fail('media_runtime_lookup_failed',503);}
  const v=live.data();
  if(!stage.exists||stage.data()?.status!=='complete'||stage.data()?.private!==true||
     !live.exists||v?.status!=='active'||v.private!==true||
     v.sourceSnapshotId!==snapshotId||v.sourceSnapshotReconciled!==true||
     v.applicationEnabled!==true||v.newspaperWriteApproved!==true)
   fail('media_not_approved',503);
 };
 const scope=async(token:string):Promise<Scope>=>{
  let s:Scope;
  try{s=await cloud.workspaceScope(token) as Scope;}
  catch(error){
   // Preserve explicit authentication, permission and migration-stage
   // denials. An unexpected SDK failure is not evidence of invalid access.
   if(error instanceof CloudAccessError)throw error;
   fail('media_scope_backend_unavailable',503);
  }
  if(!s||!s.uid||!['editor','narrador','jogador'].includes(s.profile))fail('media_denied',403);
  return s;
 };
 const canEdit=(s:Scope)=>s.profile==='editor'||s.profile==='narrador';
 const edition=async(id:string)=>{
  if(!EDITION.test(id))fail('invalid_media_edition');
  const doc=await runtime.collection('publishedNewspapers').doc(id).get();
  const v=doc.data();
  if(!doc.exists||v?.id!==id||v.source!=='firebase-cloud'||v.sourceSnapshotId!==snapshotId||
    v.state!=='draft')fail('media_edition_unavailable',409);
 };
 const registered=async(path:unknown):Promise<Entry>=>{
  if(!isNewspaperMediaPath(path,snapshotId))fail('invalid_media_path');
  const d=await registry.doc(newspaperMediaDocId(path as string)).get(),v=d.data();
  if(!d.exists||v?.path!==path||v.sourceSnapshotId!==snapshotId||
     v.state!=='ready'||!KINDS.includes(v.kind)||!v.contentType||
     !Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>SIZE)
   fail('media_unavailable',404);
  return v as Entry;
 };
 return {
  async upload(token:string,raw:unknown){
   const s=await scope(token);await ready();
   const v=validateNewspaperMediaUpload(raw);
   if(v.kind==='commission'){
    if(!v.houseId||v.editionId||!s.editHouseIds?.includes(v.houseId))
     fail('media_house_denied',403);
   }else{
    if(!canEdit(s))fail('media_editor_denied',403);
    if(v.kind==='engraving'){
     if(v.houseId||v.editionId)fail('invalid_media_scope');
    }else if(!v.editionId||v.houseId)fail('invalid_media_scope');
    else await edition(v.editionId!);
   }
   const path=newspaperMediaPath(snapshotId,v.kind,extension(v.contentType));
   const sha256=createHash('sha256').update(v.bytes).digest('hex');
   const doc:Entry&{state:'ready'}={path,kind:v.kind,contentType:v.contentType,
    bytes:v.bytes.length,sha256,sourceSnapshotId:snapshotId,createdBy:s.uid,
    createdAt:new Date().toISOString(),editionId:v.editionId??null,
    houseId:v.houseId??null,state:'ready'};
   try{
    await bucket.file(path).save(v.bytes,{resumable:false,validation:'crc32c',
     preconditionOpts:{ifGenerationMatch:0},
     metadata:{contentType:v.contentType,cacheControl:'private, no-store',
      metadata:{sourceSnapshotId:snapshotId,sha256,kind:v.kind}}});
   }catch(error){fail(classifyNewspaperStorageError(error),503);}
   // Never delete an object if the metadata write fails: it may have been
   // committed or another request may reference it. No successful upload
   // response is returned until the registry is committed.
   try{await registry.doc(newspaperMediaDocId(path)).create(doc);}
   catch{fail('media_registry_unavailable',503);}
   return {path};
  },
  async clone(token:string,raw:unknown){
   const s=await scope(token);await ready();
   if(!canEdit(s))fail('media_editor_denied',403);
   if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('invalid_media');
   const v=raw as Record<string,unknown>;
   if(Object.keys(v).some(k=>!['action','sourcePath','editionId','commissionId'].includes(k))||
      v['action']!=='clone'||typeof v['sourcePath']!=='string'||
      typeof v['editionId']!=='string')fail('invalid_media');
   await edition(v['editionId'] as string);
   const src=await registered(v['sourcePath']);
   if(!['commission','engraving'].includes(src.kind))fail('invalid_media_source',403);
   if(src.kind==='commission'){
    if(typeof v['commissionId']!=='string')fail('commission_required');
    const entry=await runtime.collection('newspaperCommissions').doc(v['commissionId']).get();
    if(!entry.exists||entry.data()?.imagePath!==src.path||
       !['pending','published'].includes(entry.data()?.state))
     fail('commission_media_unlinked',403);
   }else if(v['commissionId']!==undefined)fail('invalid_media');
   const [bytes]=await bucket.file(src.path).download();
   if(!Buffer.isBuffer(bytes)||bytes.length!==src.bytes||
      createHash('sha256').update(bytes).digest('hex')!==src.sha256)fail('media_integrity',503);
   const path=newspaperMediaPath(snapshotId,'editionImage',extension(src.contentType));
   await bucket.file(path).save(bytes,{resumable:false,validation:'crc32c',
    preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:src.contentType,cacheControl:'private, no-store'}});
   await registry.doc(newspaperMediaDocId(path)).create({
    ...src,path,kind:'editionImage',createdBy:s.uid,editionId:v['editionId'],
    houseId:null,createdAt:new Date().toISOString(),state:'ready',
   });
   return {path};
  },
  async read(token:string,path:unknown):Promise<{bytes:Buffer;contentType:string}>{
   const s=await scope(token);await ready();
   const entry=await registered(path);
   if(entry.kind==='commission'){
    if(!canEdit(s)&&!s.memberHouseIds?.includes(entry.houseId??''))fail('media_denied',403);
   }else if(!canEdit(s))fail('media_denied',403);
   const [bytes]=await bucket.file(entry.path).download();
   if(!Buffer.isBuffer(bytes)||bytes.length!==entry.bytes||
      createHash('sha256').update(bytes).digest('hex')!==entry.sha256)
    fail('media_integrity',503);
   return {bytes,contentType:entry.contentType};
  },
 };
}
