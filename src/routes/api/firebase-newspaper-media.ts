import {createFileRoute} from '@tanstack/react-router';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Authorization',
 'X-Cormyr-Media-Handler':'v2',
 'X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({error:code},{status,headers});
// A Nitro runtime may materialize the same error class in different chunks.
// Only known fixed 503 codes can survive such a boundary; no arbitrary
// code/message from Firebase Admin, GCS or request payload is reflected.
const KNOWN_503=new Set([
 'cloud_read_disabled','migration_stage_not_ready','invalid_server_configuration',
 'media_not_ready','media_not_approved','media_integrity',
 'media_storage_permission_denied','media_storage_unavailable',
 'media_registry_unavailable','media_runtime_lookup_failed',
 'media_scope_backend_unavailable',
]);
export function safeMedia503Code(error:unknown):string|null{
 if(!error||typeof error!=='object')return null;
 const data=error as {status?:unknown;code?:unknown};
 return data.status===503&&typeof data.code==='string'&&KNOWN_503.has(data.code)
  ?data.code:null;
}
export async function handleFirebaseNewspaperMedia(request:Request):Promise<Response>{
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
    process.env['CORMYR_FIREBASE_CLOUD_NEWSPAPER_ENABLED']!=='true'||
    process.env['CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST']||
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'])
  return fail(503,'newspaper_media_disabled');
 if(new URL(request.url).search||request.headers.has('cookie')||
    crossOriginRejected(request))return fail(403,'access_denied');
 const bearer=request.headers.get('authorization')??'';
 if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
  return fail(401,'authentication_required');
 const binaryUpload=request.headers.get('x-cormyr-media-action')==='upload';
 const mime=request.headers.get('content-type')?.split(';')[0]?.trim();
 if(request.headers.has('content-encoding')||
    (binaryUpload?!['image/png','image/jpeg','image/webp','application/pdf'].includes(mime??''):
      mime!=='application/json'))return fail(415,'media_type_required');
 let phase:'parse'|'sdk'|'service'|'operation'='parse';
 // Loading this heavy server-only module at route registration can prevent
 // Nitro from ever entering this handler. Keep invalid-auth rejection cheap.
 let mediaErrorClass:typeof import('@/lib/newspaper/firebase-newspaper-media.server').NewspaperMediaError|undefined;
 let accessErrorClass:typeof import('../../../scripts/firebase/cloud-readonly-service.mjs').CloudAccessError|undefined;
 try{
  const reader=request.body?.getReader();
  if(!reader)return fail(400,'invalid_request');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>(binaryUpload?15*1024*1024:21_200_000)){
    await reader.cancel();return fail(413,'body_too_large');
   }
   chunks.push(value);
  }
  let payload:unknown;
  if(binaryUpload){
   const encodedName=request.headers.get('x-cormyr-media-name');
   let name:string|undefined;
   if(encodedName!==null){
    if(encodedName.length>600)return fail(400,'invalid_request');
    try{name=decodeURIComponent(encodedName);}catch{return fail(400,'invalid_request');}
   }
   const kind=request.headers.get('x-cormyr-media-kind');
   payload={action:'upload',kind,contentType:mime,dataBytes:Buffer.concat(chunks),
    ...(request.headers.get('x-cormyr-media-edition')?
     {editionId:request.headers.get('x-cormyr-media-edition')}:{}),
    ...(request.headers.get('x-cormyr-media-house')?
     {houseId:request.headers.get('x-cormyr-media-house')}:{}),
    ...(name!==undefined?{name}:{}),
    ...(request.headers.get('x-cormyr-media-request-key')?
     {requestKey:request.headers.get('x-cormyr-media-request-key')}:{}),
    ...(request.headers.get('x-cormyr-media-atomic-engraving')==='true'?
     {registerEngraving:true}:{})};
  }else{
   try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
   catch{return fail(400,'invalid_json');}
  }
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
   return fail(400,'invalid_request');
  const action=(payload as {action?:unknown}).action;
  if(!['upload','clone','read'].includes(String(action)))return fail(400,'invalid_action');
  phase='sdk';
  const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore},{getStorage}]=
    await Promise.all([
     import('firebase-admin/app'),import('firebase-admin/auth'),
     import('firebase-admin/firestore'),import('firebase-admin/storage'),
    ]);
  const name='cormyr-newspaper-media';
  const app=getApps().find(a=>a.name===name)??initializeApp({
   projectId:'cormyr',credential:applicationDefault(),
  },name);
  phase='service';
  const [mediaModule,accessModule]=await Promise.all([
   import('@/lib/newspaper/firebase-newspaper-media.server'),
   import('../../../scripts/firebase/cloud-readonly-service.mjs'),
  ]);
  mediaErrorClass=mediaModule.NewspaperMediaError;
  accessErrorClass=accessModule.CloudAccessError;
  const media=mediaModule.createNewspaperMediaService({
   db:getFirestore(app),auth:getAuth(app),snapshotId,
   bucket:getStorage(app).bucket('cormyr.firebasestorage.app'),
  });
  const token=bearer.slice(7);
  phase='operation';
  if(action==='read'){
   const result=await media.read(token,(payload as {path?:unknown}).path);
   return new Response(new Uint8Array(result.bytes),{status:200,
    headers:{...headers,'Content-Type':result.contentType,
     'Content-Length':String(result.bytes.length)}});
  }
  const result=action==='upload'?await media.upload(token,payload)
   :await media.clone(token,payload);
  return Response.json({result},{status:200,headers});
 }catch(e){
  if(mediaErrorClass&&e instanceof mediaErrorClass)
   return fail(e.status,e.code);
  if(accessErrorClass&&e instanceof accessErrorClass)
   return fail(e.status,e.code);
  const stable=safeMedia503Code(e);
  if(stable)return fail(503,stable);
  // Firebase Admin errors and worker failures are intentionally opaque.
  // Only a fixed phase label reaches the log, never a message, request
  // body, token, path, UID, provider stack or arbitrary Error property.
  const known={
   parse:'media_parse_backend_unavailable',
   sdk:'media_sdk_initialization_failed',
   service:'media_service_initialization_failed',
   operation:'media_operation_unavailable',
  } as const;
  console.warn('NEWSPAPER_MEDIA_UNCLASSIFIED_503',known[phase]);
  return fail(503,known[phase]);
 }
}
export const Route=createFileRoute('/api/firebase-newspaper-media')({
 server:{handlers:{POST:async({request})=>handleFirebaseNewspaperMedia(request)}},
});
