import {createHash,timingSafeEqual} from 'node:crypto';
import {createFileRoute} from '@tanstack/react-router';
import {readDriveCloudPreflight,DriveCloudPreflightError}
  from '@/lib/drive-cloud-preflight.server';

const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};
const fail=(status:number,code:string)=>
  Response.json({error:code},{status,headers});
const compare=(token:string,secret:string)=>{
  const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest();
  return timingSafeEqual(hash(token),hash(secret));
};

/**
 * Firebase-only replacement of the legacy Cloud Scheduler callback.
 * Explicitly preflight only, never a Drive or Firestore mutation.
 */
export async function runFirebaseDrivePreflight(request:Request):Promise<Response>{
  const u=new URL(request.url);
  if(u.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==u.origin))
    return fail(403,'access_denied');
  const header=request.headers.get('authorization')??'';
  const match=/^Bearer ([^\s,]{10,256})$/.exec(header);
  if(!match)return fail(401,'unauthorized');
  const secret=process.env['CRON_SECRET']??'';
  const previous=process.env['CRON_SECRET_PREVIOUS']??'';
  if(secret.length<24||secret.length>1024)return fail(503,'cron_not_configured');
  if(!compare(match[1]??'',secret)&&
     !(previous.length>=24&&previous.length<=1024&&compare(match[1]??'',previous)))
    return fail(401,'unauthorized');
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||
     request.headers.has('content-encoding'))
    return fail(415,'json_required');
  if(!request.body)return fail(400,'invalid_request');
  const reader=request.body.getReader();
  let size=0;const chunks:Uint8Array[]=[];
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>512){await reader.cancel();return fail(413,'body_too_large');}
    chunks.push(value);
  }
  let body:unknown;
  try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{return fail(400,'invalid_json');}
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.keys(body).length!==1||!Object.hasOwn(body,'kind')||
     (body as {kind?:unknown}).kind!=='reconcile')
    return fail(400,'invalid_request');

  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_DRIVE_PREFLIGHT_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'drive_preflight_disabled');

  try{
    const [{initializeApp,getApps,applicationDefault},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),import('firebase-admin/firestore'),
      ]);
    const name='cormyr-drive-preflight';
    const app=getApps().find(item=>item.name===name)??initializeApp({
      credential:applicationDefault(),projectId:'cormyr',
    },name);
    const result=await readDriveCloudPreflight({
      db:getFirestore(app),snapshotId,projectId:'cormyr',enabled:true,
    });
    return Response.json(result,{status:200,headers});
  }catch(error){
    if(error instanceof DriveCloudPreflightError)
      return fail(error.status,error.code);
    return fail(503,'drive_preflight_unavailable');
  }
}
export const Route=createFileRoute('/api/public/jobs/drive-sync')({
  server:{handlers:{POST:async({request})=>runFirebaseDrivePreflight(request)}},
});
