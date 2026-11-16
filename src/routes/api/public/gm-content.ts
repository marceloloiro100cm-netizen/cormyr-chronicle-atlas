import {createFileRoute} from '@tanstack/react-router';
import {readApprovedFirebasePrivateGmContent,PrivateGmCloudError}
  from '@/lib/private-gm/firebase-private-gm-cloud.server';

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
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==url.origin))
    return fail(403);
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(bearer))return fail(401);
  try{
    const [{applicationDefault,getApps,initializeApp},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-private-gm-content';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      credential:applicationDefault(),projectId:'cormyr',
    },name);
    const data=await readApprovedFirebasePrivateGmContent({
      auth:getAuth(app),db:getFirestore(app),snapshotId:id,projectId:'cormyr',
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
