import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {saveFirebaseStaffPhoto} from '@/lib/newspaper/firebase-newspaper-staff-photo.server';
import {NewspaperStaffError} from '@/lib/newspaper/firebase-newspaper-staff.server';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={'Cache-Control':'private, no-store','Vary':'Authorization',
 'X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>
 Response.json({error:code},{status,headers});
export async function handleFirebaseNewspaperStaffPhoto(request:Request):Promise<Response>{
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
    process.env['CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST']||
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'])
  return fail(503,'staff_photo_disabled');
 if(new URL(request.url).search||request.headers.has('cookie')||
    crossOriginRejected(request))return fail(403,'access_denied');
 const bearer=request.headers.get('authorization')??'';
 if(!/^Bearer [^\s]{10,10000}$/.test(bearer))return fail(401,'authentication_required');
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||
    request.headers.has('content-encoding'))return fail(415,'json_required');
 try{
  const reader=request.body?.getReader();
  if(!reader)return fail(400,'invalid_request');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>7_500_000){await reader.cancel();return fail(413,'body_too_large');}
   chunks.push(value);
  }
  let raw:unknown;
  try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{return fail(400,'invalid_json');}
  const {auth:adminAuth,db:adminDb,storage:adminStorage}=await getFirebaseAdminServices();
  const result=await saveFirebaseStaffPhoto({
   db:adminDb,auth:adminAuth,
   bucket:adminStorage.bucket('cormyr.firebasestorage.app'),
   snapshotId,token:bearer.slice(7),raw,
  });
  return Response.json({result},{headers});
 }catch(e){
  if(e instanceof NewspaperStaffError||e instanceof CloudAccessError)
   return fail(e.status,e instanceof NewspaperStaffError?e.code:e.code);
  return fail(503,'staff_photo_unavailable');
 }
}
export const Route=createFileRoute('/api/firebase-newspaper-staff-photo')({
 server:{handlers:{POST:async({request})=>handleFirebaseNewspaperStaffPhoto(request)}},
});
