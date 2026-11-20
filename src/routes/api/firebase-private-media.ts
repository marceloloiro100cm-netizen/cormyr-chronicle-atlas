import {createFileRoute} from '@tanstack/react-router';
import {createFirebasePrivateMedia}
 from '@/lib/firebase-workspace/private-media-service';
import {PrivateMediaError} from '@/lib/firebase-workspace/private-media-core';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={
 'Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff',
 'Vary':'Authorization',
 'Content-Security-Policy':"default-src 'none'",
};
const error=(status:number,code:string)=>
 Response.json({error:code},{status,headers});
export async function handleFirebasePrivateMedia(request:Request):Promise<Response>{
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_PRIVATE_MEDIA_ENABLED']!=='true'||
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST']||
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'])
  return error(503,'private_media_disabled');
 if(new URL(request.url).search||request.headers.has('cookie')||
    crossOriginRejected(request))
  return error(403,'access_denied');
 const authHeader=request.headers.get('authorization')??'';
 if(!/^Bearer [^\s]{10,10000}$/.test(authHeader))
  return error(401,'authentication_required');
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||
    request.headers.has('content-encoding'))
  return error(415,'json_required');
 try{
  const reader=request.body?.getReader();
  if(!reader)return error(400,'invalid_request');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>7_500_000){await reader.cancel();return error(413,'body_too_large');}
   chunks.push(value);
  }
  let data:unknown;
  try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{return error(400,'invalid_json');}
  if(!data||typeof data!=='object'||Array.isArray(data)||
     !('action' in data)||!['upload','sign','download'].includes(String(data.action)))
   return error(400,'invalid_request');
  const [{initializeApp,getApps,applicationDefault},{getAuth},
   {getFirestore},{getStorage}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/auth'),
    import('firebase-admin/firestore'),import('firebase-admin/storage'),
   ]);
  const name='cormyr-private-media';
  const app=getApps().find(a=>a.name===name)??initializeApp({
   projectId:'cormyr',credential:applicationDefault(),
  },name);
  const media=createFirebasePrivateMedia({
   db:getFirestore(app),auth:getAuth(app),
   bucket:getStorage(app).bucket(
    process.env['CORMYR_FIREBASE_PRIVATE_MEDIA_BUCKET']||
      'cormyr.firebasestorage.app'),
   snapshotId,
  });
  const token=authHeader.slice(7);
  if(data.action==='download'){
   const result=await media.download(token,data);
   return new Response(new Uint8Array(result.bytes),{status:200,
    headers:{...headers,'Content-Type':result.contentType,
     'Content-Length':String(result.bytes.length)}});
  }
  const result=data.action==='upload'?await media.upload(token,data)
   :await media.signed(token,data);
  return Response.json({result},{status:200,headers});
 }catch(e){
  if(e instanceof PrivateMediaError||e instanceof CloudAccessError)
   return error(e.status,e.code);
  return error(503,'private_media_unavailable');
 }
}
export const Route=createFileRoute('/api/firebase-private-media')({
 server:{handlers:{POST:async({request})=>handleFirebasePrivateMedia(request)}},
});
