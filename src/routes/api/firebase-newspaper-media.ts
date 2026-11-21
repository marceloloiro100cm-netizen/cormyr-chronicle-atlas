import {createFileRoute} from '@tanstack/react-router';
import {createNewspaperMediaService,NewspaperMediaError}
 from '@/lib/newspaper/firebase-newspaper-media.server';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Authorization',
 'X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({error:code},{status,headers});
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
 if(!/^Bearer [^\\s]{10,10000}$/.test(bearer))
  return fail(401,'authentication_required');
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||
    request.headers.has('content-encoding'))return fail(415,'json_required');
 try{
  const reader=request.body?.getReader();
  if(!reader)return fail(400,'invalid_request');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>21_200_000){await reader.cancel();return fail(413,'body_too_large');}
   chunks.push(value);
  }
  let payload:unknown;
  try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{return fail(400,'invalid_json');}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
   return fail(400,'invalid_request');
  const action=(payload as {action?:unknown}).action;
  if(!['upload','clone','read'].includes(String(action)))return fail(400,'invalid_action');
  const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore},{getStorage}]=
    await Promise.all([
     import('firebase-admin/app'),import('firebase-admin/auth'),
     import('firebase-admin/firestore'),import('firebase-admin/storage'),
    ]);
  const name='cormyr-newspaper-media';
  const app=getApps().find(a=>a.name===name)??initializeApp({
   projectId:'cormyr',credential:applicationDefault(),
  },name);
  const media=createNewspaperMediaService({
   db:getFirestore(app),auth:getAuth(app),snapshotId,
   bucket:getStorage(app).bucket('cormyr.firebasestorage.app'),
  });
  const token=bearer.slice(7);
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
  if(e instanceof NewspaperMediaError||e instanceof CloudAccessError)
   return fail(e.status,e.code);
  return fail(503,'newspaper_media_unavailable');
 }
}
export const Route=createFileRoute('/api/firebase-newspaper-media')({
 server:{handlers:{POST:async({request})=>handleFirebaseNewspaperMedia(request)}},
});
