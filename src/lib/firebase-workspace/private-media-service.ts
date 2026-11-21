/* eslint-disable @typescript-eslint/no-explicit-any -- Firebase Admin boundary. */
import {createFirebaseCloudReadonly} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {createWorkspaceService} from './service';
import {PRIVATE_MEDIA_LIMIT,PRIVATE_MEDIA_UUID,privateMediaType,
 privateMediaHash,privateMediaRef,privateMediaFail,privateMediaReferenced,
 validatePrivateMediaSource,privateMediaTokens} from './private-media-core';

const SHA=/^[a-f0-9]{64}$/;
const b64=/^[A-Za-z0-9+/]+={0,2}$/;
const safe=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128&&
 !/[\/\u0000-\u001f\u007f]/.test(v);
const isObj=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v);

/** Cópia do bucket antigo de imagens da campanha (Lovable), no mesmo bucket do Firebase. */
const LEGACY_PREFIX='migration-staging/campaign-images/';
const LEGACY_PATH=/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,299}$/;
const LEGACY_LIMIT=20*1024*1024;
/**
 * The original version-one Storage manifest is keyed by the verified
 * snapshot document ID but historically omitted sourceSnapshotId. New
 * manifests must explicitly match the snapshot; an explicitly mismatched
 * value is never accepted. Object authorization and dual-bucket checksum
 * checks remain mandatory in either case.
 */
export function legacyStorageStageMatches(stage:any,snapshotId:string):boolean{
 return stage?.status==='complete'&&stage.private===true&&
  (stage.sourceSnapshotId===snapshotId||
   (stage.sourceSnapshotId===undefined&&stage.formatVersion===1));
}
/** Entre requisições (a rota cria o serviço a cada chamada). */
const legacyCache=new Map<string,{until:number;paths:Promise<Set<string>>}>();
export function createFirebasePrivateMedia({db,auth,bucket,verifiedBucket,snapshotId}:{
 db:any;auth:any;bucket:any;verifiedBucket?:any;snapshotId:string;
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
 const runtimeApproved=(doc:any,write=false)=>{
  const value=doc.data();
  return doc.exists&&value?.status==='active'&&value.private===true&&
   value.sourceSnapshotId===snapshotId&&value.sourceSnapshotReconciled===true&&
   value.applicationEnabled===true&&value.privateMediaReadApproved===true&&
   (!write||value.privateMediaWriteApproved===true);
 };
 const approved=async(write=false)=>{
  if(!runtimeApproved(await root.get(),write))
   privateMediaFail('private_media_not_approved',503);
 };
 /**
  * Read-only per-object migration gate, distinct from new media approvals.
  * Never expose a file merely because it exists: require current authorized
  * imported content, complete storage stage and two equal private GCS copies.
  */
 const approvedLegacy=async()=>{
  const [runtime,storage]=await Promise.all([
   root.get(),db.collection('migrationStorageStage').doc(snapshotId).get(),
  ]);
  const v=runtime.data(),stage=storage.data();
  if(!runtime.exists||v?.status!=='active'||v.private!==true||
     v.sourceSnapshotId!==snapshotId||
     v.sourceSnapshotReconciled!==true||v.applicationEnabled!==true||
     !storage.exists||!legacyStorageStageMatches(stage,snapshotId)||
     typeof verifiedBucket?.file!=='function')
    privateMediaFail('private_media_archive_not_approved',503);
 };
 const visibleReference=async(token:string,path:string)=>{
  // Um brasão importado pertence à Casa. Seus membros e o Narrador
  // podem lê-lo, sem transferir o acesso a jogadores de outra Casa.
  const link=await root.collection('privateMediaHouseLinks')
   .doc(privateMediaHash('house-crest:'+path)).get();
  if(link.exists){
   const value=link.data(),houseId=value?.houseId;
   if(value?.path===path&&value?.sourceSnapshotId===snapshotId&&
      safe(houseId)){
    const viewer=await scope(token);
    if(viewer.profile==='narrador'||
       viewer.profile==='jogador'&&viewer.memberHouseIds.includes(houseId)){
     const economy=await root.collection('houseEconomies')
      .doc(privateMediaHash('house:'+houseId)).get();
     const state=economy.data();
     if(economy.exists&&state?.houseId===houseId&&
        state?.sourceSnapshotId===snapshotId&&
        state?.sourceReconciled===true&&state?.status==='active'&&
        state?.state?.houseId===houseId&&
        state?.state?.identity?.crestPath===path)return true;
    }
   }
  }
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
/**
  * Imagens históricas (galeria, Corte, missivas): os arquivos do bucket antigo
  * foram copiados para migration-staging/campaign-images/ no mesmo bucket.
  * Só são entregues a quem pode ler hoje um registro, carta ou resposta que
  * contém o token da imagem (mesma regra das imagens privadas novas). A lista
  * de caminhos autorizados de cada leitor fica em memória por 60 segundos.
  */
 const legacyPaths=(token:string,viewer:{uid:string})=>{
  const key=snapshotId+':'+viewer.uid+':'+JSON.stringify(viewer);
  const hit=legacyCache.get(key);
  if(hit&&hit.until>Date.now())return hit.paths;
  const paths=(async()=>{
   const service=createWorkspaceService({db,auth,snapshotId,cacheImportedTables:true});
   const found=new Set<string>();
   for(const table of ['campaign_records','campaign_letters','letter_replies']){
    const result=await service.execute(token,{kind:'query',table,steps:[]});
    const rows=result?.data;
    if(!Array.isArray(rows))privateMediaFail('private_media_source_unavailable',503);
    for(const r of rows)if(typeof r?.content==='string')
     for(const p of privateMediaTokens(r.content))found.add(p);
   }
   return found;
  })();
  paths.catch(()=>legacyCache.delete(key));
  legacyCache.set(key,{until:Date.now()+60_000,paths});
  if(legacyCache.size>200)for(const [k,v] of legacyCache)if(v.until<=Date.now())legacyCache.delete(k);
  return paths;
 };
 const legacyDownload=async(token:string,path:string)=>{
  if(!LEGACY_PATH.test(path)||path.includes('..')||path.startsWith('private/'))
   privateMediaFail('private_media_path_invalid',400);
  await approvedLegacy();
  const viewer=await scope(token);
  if(!(await legacyPaths(token,viewer)).has(path))privateMediaFail('private_media_denied');
  const file=bucket.file(LEGACY_PREFIX+path);
  const checked=verifiedBucket.file('campaign-images/'+path);
  const [[exists],[mirrorExists]]=await Promise.all([file.exists(),checked.exists()]);
  if(!exists||!mirrorExists)privateMediaFail('private_media_not_found',404);
  const [[meta],[mirror]]=await Promise.all([file.getMetadata(),checked.getMetadata()]);
  const size=Number(meta?.size);
  if(!Number.isSafeInteger(size)||size<1||size>LEGACY_LIMIT||
     Number(mirror?.size)!==size||
     typeof meta?.crc32c!=='string'||!meta.crc32c||
     meta.crc32c!==mirror?.crc32c||
     (meta.md5Hash&&mirror?.md5Hash&&meta.md5Hash!==mirror.md5Hash))
   privateMediaFail('private_media_archive_integrity_failed',503);
  const [bytes]=await file.download();
  if(bytes.length!==size)privateMediaFail('private_media_archive_integrity_failed',503);
  const type=['image/png','image/jpeg','image/webp','image/gif'].find(t=>privateMediaType(t)?.magic(bytes));
  if(!type)privateMediaFail('private_media_type_invalid',415);
  if(JSON.stringify(await scope(token))!==JSON.stringify(viewer))
   privateMediaFail('private_media_denied');
  return {bytes,contentType:type as string};
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
   if(!isObj(request))return privateMediaFail('private_media_upload_invalid',400);
   const input=request as Record<string,string>;
   if(Object.keys(input).some(k=>
       !['action','id','contentType','dataBase64'].includes(k))||
      input['action']!=='upload'||!PRIVATE_MEDIA_UUID.test(String(input['id']))||
      typeof input['contentType']!=='string'||
      typeof input['dataBase64']!=='string'||
      input['dataBase64'].length>Math.ceil(PRIVATE_MEDIA_LIMIT*4/3)+8||
      !b64.test(input['dataBase64']))
    return privateMediaFail('private_media_upload_invalid',400);
   const typed=privateMediaType(input['contentType']);
   if(!typed)return privateMediaFail('private_media_type_invalid',415);
   const data=Buffer.from(input['dataBase64'],'base64');
   if(!data.length||data.length>PRIVATE_MEDIA_LIMIT||
      data.toString('base64')!==input['dataBase64']||
      !typed.magic(data))privateMediaFail('private_media_upload_invalid',400);
   await approved(true);
   const viewer=await scope(token),at=new Date().toISOString();
   if(viewer.profile!=='narrador'&&
      (viewer.profile!=='jogador'||!viewer.memberHouseIds.length))
    privateMediaFail('private_media_denied');
   const path='private/'+snapshotId+'/'+viewer.uid+'/'+input['id']+'.'+typed.ext;
   const key=privateMediaRef(root,path),file=bucket.file(path);
   const digest=privateMediaHash(data.toString('base64'));
   const reserve=await db.runTransaction(async(tx:any)=>{
    const [runtime,existing]=await Promise.all([tx.get(root),tx.get(key)]);
    if(!runtimeApproved(runtime,true))
     privateMediaFail('private_media_not_approved',503);
    if(existing.exists){
     const prev=existing.data();
     if(prev?.ownerUid!==viewer.uid||prev?.path!==path||
        prev?.digest!==digest||prev?.contentType!==input['contentType'])
      privateMediaFail('private_media_request_conflict',409);
     if(prev?.status==='ready')return {duplicate:true,path,resume:false};
     // Uma tentativa interrompida pode ser retomada apenas com o mesmo
     // arquivo, UID, tipo e identificador. Nunca sobrescrever um objeto.
     if(prev?.status==='pending'&&prev?.size===data.length&&
        prev?.sourceSnapshotId===snapshotId)
      return {duplicate:false,path,resume:true};
     privateMediaFail('private_media_incomplete',409);
    }
    tx.create(key,{path,ownerUid:viewer.uid,sourceSnapshotId:snapshotId,
     status:'pending',contentType:input['contentType'],size:data.length,
     digest,createdAt:at,updatedAt:at});
    return {duplicate:false,path,resume:false};
   });
   // A resposta idempotente nunca mascara perda ou corrupção do objeto.
   const verifyStored=async()=>{
    let persisted:Buffer|undefined;
    try{[persisted]=await file.download();}
    catch{privateMediaFail('private_media_integrity_failed',503);}
    if(!persisted||persisted.length!==data.length||
       privateMediaHash(persisted.toString('base64'))!==digest)
     privateMediaFail('private_media_integrity_failed',503);
   };
   if(reserve.duplicate){
    await verifyStored();
    return {path,duplicate:true};
   }
   if(reserve.resume){
    // 404 significa que a primeira tentativa caiu antes de salvar.
    // Outros erros do Storage não podem ser confundidos com objeto ausente.
    let exists=false;
    try{const [found]=await file.exists();exists=found;}
    catch{privateMediaFail('private_media_unavailable',503);}
    if(exists)await verifyStored();
    else await file.save(data,{resumable:false,
     preconditionOpts:{ifGenerationMatch:0},
     metadata:{contentType:input['contentType'],
      cacheControl:'private,max-age=0,no-store'},
    });
   }else{
    await file.save(data,{resumable:false,
     preconditionOpts:{ifGenerationMatch:0},
     metadata:{contentType:input['contentType'],
      cacheControl:'private,max-age=0,no-store'},
    });
   }
   await verifyStored();
   const again=await scope(token);
   if(JSON.stringify(viewer)!==JSON.stringify(again))
    privateMediaFail('private_media_denied');
   const committed=await db.runTransaction(async(tx:any)=>{
    const [runtime,current]=await Promise.all([tx.get(root),tx.get(key)]);
    const m=current.data();
    if(!runtimeApproved(runtime,true))
     privateMediaFail('private_media_upload_revoked',403);
    if(m?.status==='ready'&&m?.ownerUid===viewer.uid&&
       m?.digest===digest&&m?.path===path&&
       m?.sourceSnapshotId===snapshotId)return false;
    if(m?.status!=='pending'||m?.ownerUid!==viewer.uid||
       m?.digest!==digest||m?.path!==path||
       m?.sourceSnapshotId!==snapshotId)
     privateMediaFail('private_media_upload_revoked',403);
    const now=new Date().toISOString();
    tx.update(key,{status:'ready',updatedAt:now});
    tx.create(root.collection('privateMediaAudits').doc(privateMediaHash('upload:'+path)),{
     action:'private_media_upload',ownerUid:viewer.uid,path,
     contentType:input['contentType'],size:data.length,occurredAt:now,
     sourceSnapshotId:snapshotId,
    });
    return true;
   });
   // Não apagar bytes após falha transacional: outro envio pode ter
   // confirmado o mesmo objeto. O manifesto pending nunca autoriza leitura.
   return {path,duplicate:reserve.resume||!committed};
  },
  async signed(token:string,request:unknown){
   if(!isObj(request))return privateMediaFail('private_media_request_invalid',400);
   const input=request as Record<string,string>;
   if(Object.keys(request).some(k=>!['action','path'].includes(k))||
      input['action']!=='sign'||typeof input['path']!=='string')
    privateMediaFail('private_media_request_invalid',400);
   const {file}=await authorize(token,input['path'] as string);
   const expires=Date.now()+60_000;
   const [url]=await file.getSignedUrl({version:'v4',action:'read',expires});
   if(typeof url!=='string'||!url.startsWith('https://'))
    privateMediaFail('private_media_sign_unavailable',503);
   return {signedUrl:url,expiresAt:new Date(expires).toISOString()};
  },
  async download(token:string,request:unknown){
   if(!isObj(request))return privateMediaFail('private_media_request_invalid',400);
   const input=request as Record<string,string>;
   if(Object.keys(request).some(k=>!['action','path'].includes(k))||
      input['action']!=='download'||typeof input['path']!=='string')
    privateMediaFail('private_media_request_invalid',400);
   if(!(input['path'] as string).startsWith('private/'))
    return legacyDownload(token,input['path'] as string);
   const {file,meta}=await authorize(token,input['path'] as string);
   const [bytes]=await file.download();
   if(bytes.length!==meta.size||
      privateMediaHash(bytes.toString('base64'))!==meta.digest)
    privateMediaFail('private_media_integrity_failed',503);
   return {bytes,contentType:meta.contentType as string};
  },
 };
}
