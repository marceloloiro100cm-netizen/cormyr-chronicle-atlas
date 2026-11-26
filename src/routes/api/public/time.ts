import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {cachedPublicRead} from '@/lib/server/public-cache.server';
import {readApprovedFirebasePublicTime}
  from '@/lib/calendar/firebase-public-time.server';

const ERROR_HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Accept',
};
const OK_HEADERS={
  'Cache-Control':'public, max-age=15, s-maxage=30, stale-while-revalidate=60',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Accept',
};

/**
 * Anonymous and Firebase-only. The Admin SDK is privileged and therefore
 * never serves historical/private snapshot data unless the Cloud runtime
 * explicitly approved the exact published version of the global calendar.
 * No Supabase fallback, client token, cookie or snapshot selector.
 */
async function getPublicTime():Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PUBLIC_TIME_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return Response.json({error:'Calendário público indisponível'},
      {status:503,headers:ERROR_HEADERS});

  try{
    const time=await cachedPublicRead('public-time:'+snapshotId,15_000,async()=>{
      const {db:adminDb}=await getFirebaseAdminServices();
      return readApprovedFirebasePublicTime({
        db:adminDb,projectId:'cormyr',
        snapshotId,enabled:true,
      });
    });
    return Response.json(time,{status:200,headers:OK_HEADERS});
  }catch{
    // Do not expose Firestore IAM errors, private paths or snapshot hashes.
    return Response.json({error:'Calendário público indisponível'},
      {status:503,headers:ERROR_HEADERS});
  }
}

export const Route=createFileRoute('/api/public/time')({
  server:{handlers:{GET:async()=>getPublicTime()}},
});
