import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {readApprovedFirebasePrivateGmContent,PrivateGmCloudError}
  from '@/lib/private-gm/firebase-private-gm-cloud.server';
import {crossOriginRejected} from '@/lib/server/request-origin';

const HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  'Vary':'Authorization',
  'X-Content-Type-Options':'nosniff',
};
const fail=(status:401|403|503)=>Response.json({
  error:status===503?'unavailable':'forbidden',
},{status,headers:HEADERS});

/** Kept at the old path for compatibility; always Firebase-only. */
export async function getFirebasePrivateGmContent(request:Request):Promise<Response>{
  const id=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PRIVATE_GM_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(id)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503);
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return fail(403);
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(bearer))return fail(401);
  try{
    const {auth:adminAuth,db:adminDb}=await getFirebaseAdminServices();
    const data=await readApprovedFirebasePrivateGmContent({
      auth:adminAuth,db:adminDb,snapshotId:id,projectId:'cormyr',
      enabled:true,
    },bearer.slice(7));
    return Response.json(data,{status:200,headers:HEADERS});
  }catch(e){
    if(e instanceof PrivateGmCloudError)return fail(e.status);
    return fail(503);
  }
}
export const Route=createFileRoute('/api/public/gm-content')({
  server:{handlers:{GET:async({request})=>getFirebasePrivateGmContent(request)}},
});
