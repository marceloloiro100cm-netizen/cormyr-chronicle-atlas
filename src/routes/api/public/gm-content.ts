import {createFileRoute} from '@tanstack/react-router';
import {readFirebaseNarratorContent} from '@/lib/public/firebase-private-gm.server';
import {CloudAccessError} from '../../../../scripts/firebase/cloud-readonly-service.mjs';

const headers={
  'Content-Type':'application/json',
  'Cache-Control':'private, no-store, max-age=0',
  'Vary':'Authorization',
  'X-Content-Type-Options':'nosniff',
};
const fail=(status:number,code:string)=>
  Response.json({error:code},{status,headers});

/**
 * Narrator-only Firebase content. A Supabase JWT is never a Firebase token.
 * This is still disabled until the corresponding private stage and real-role
 * Firebase Cloud acceptance have been separately verified.
 */
export async function getFirebaseNarratorContent(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==url.origin))
    return fail(403,'access_denied');
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
    return fail(401,'authentication_required');

  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PRIVATE_GM_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'narrator_content_disabled');
  try{
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const appName='cormyr-private-narrator';
    const app=getApps().find(item=>item.name===appName)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },appName);
    const data=await readFirebaseNarratorContent({
      db:getFirestore(app),auth:getAuth(app),
      snapshotId,projectId:'cormyr',enabled:true,
    },bearer.slice(7));
    return Response.json(data,{status:200,headers});
  }catch(error){
    if(error instanceof CloudAccessError)return fail(error.status,error.code);
    return fail(503,'narrator_content_unavailable');
  }
}
export const Route=createFileRoute('/api/public/gm-content')({
  server:{handlers:{GET:async({request})=>getFirebaseNarratorContent(request)}},
});
