import {createFileRoute} from '@tanstack/react-router';
import {readApprovedFirebasePublicTime}
  from '@/lib/calendar/firebase-public-time.server';

const HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Accept',
};

/**
 * Anonymous and Firebase-only. The Admin SDK is privileged and therefore
 * never serves historical/private snapshot data unless the Cloud runtime
 * explicitly approved the exact published version of the global calendar.
 * No Supabase fallback, client token, cookie, cache or snapshot selector.
 */
async function getPublicTime():Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_PUBLIC_TIME_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return Response.json({error:'Calendário público indisponível'},
      {status:503,headers:HEADERS});

  try{
    const [{initializeApp,getApps,applicationDefault},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),import('firebase-admin/firestore'),
      ]);
    const name='cormyr-public-campaign-time';
    const app=getApps().find(item=>item.name===name)??initializeApp({
      credential:applicationDefault(),projectId:'cormyr',
    },name);
    const time=await readApprovedFirebasePublicTime({
      db:getFirestore(app),projectId:'cormyr',
      snapshotId,enabled:true,
    });
    return Response.json(time,{status:200,headers:HEADERS});
  }catch{
    // Do not expose Firestore IAM errors, private paths or snapshot hashes.
    return Response.json({error:'Calendário público indisponível'},
      {status:503,headers:HEADERS});
  }
}

export const Route=createFileRoute('/api/public/time')({
  server:{handlers:{GET:async()=>getPublicTime()}},
});
