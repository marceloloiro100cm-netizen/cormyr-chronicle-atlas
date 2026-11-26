import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {
  isAuthorizedFirebaseDriveJob,inspectApprovedFirebaseDriveStage,
} from '@/lib/drive/firebase-cloud-drive-job.server';
import {crossOriginRejected} from '@/lib/server/request-origin';

const HEADERS={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const fail=(status:number,error:string)=>Response.json({error},
  {status,headers:HEADERS});

/**
 * Replaces the previous Supabase cron executor. The existing 'reconcile'
 * request fails explicitly until the Firebase Drive transactional service
 * and its Cloud Scheduler identity have been accepted. It NEVER returns
 * success for an unexecuted sync.
 */
export async function handleFirebaseDriveSync(request:Request):Promise<Response>{
  if(!isAuthorizedFirebaseDriveJob(request,
    process.env['CRON_SECRET'],process.env['CRON_SECRET_PREVIOUS']))
    return fail(401,'unauthorized');
  const u=new URL(request.url);
  if(request.method!=='POST'||u.search||
     request.headers.has('cookie')||
     crossOriginRejected(request))
    return fail(403,'forbidden');
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||
     request.headers.has('content-encoding'))
    return fail(415,'json_required');
  let raw='';
  try{
    const reader=request.body?.getReader();
    if(!reader)return fail(400,'invalid_request');
    const chunks:Uint8Array[]=[];let total=0;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>256){await reader.cancel();return fail(413,'request_too_large');}
      chunks.push(value);
    }
    raw=Buffer.concat(chunks).toString('utf8');
  }catch{return fail(400,'invalid_request');}
  let kind:unknown;
  try{
    const payload:unknown=JSON.parse(raw);
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       Object.keys(payload).length!==1||!Object.hasOwn(payload,'kind'))
      return fail(400,'invalid_request');
    kind=(payload as {kind:unknown}).kind;
  }catch{return fail(400,'invalid_request');}
  if(kind==='reconcile')return fail(503,'firebase_drive_write_not_authorized');
  if(kind!=='audit')return fail(400,'invalid_request');
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_DRIVE_AUDIT_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'firebase_drive_audit_disabled');
  try{
    const {db:adminDb}=await getFirebaseAdminServices();
    const status=await inspectApprovedFirebaseDriveStage({
      db:adminDb,projectId:'cormyr',snapshotId,enabled:true,
    });
    return Response.json(status,{headers:HEADERS});
  }catch{return fail(503,'firebase_drive_audit_unavailable');}
}
export const Route=createFileRoute('/api/public/jobs/drive-sync')({
  server:{handlers:{POST:async({request})=>handleFirebaseDriveSync(request)}},
});
