import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudMail,CloudMailError}
  from '../../../scripts/firebase/cloud-mail-service.mjs';

/**
 * Firebase CLOUD-only mail commands.
 * Explicitly disabled until Cloud Auth, source reconciliation, permissions
 * and reconciled runtime are approved. No Supabase fallback; no emulator.
 */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const error=(status:number,code:string)=>
  Response.json({error:code},{status,headers});

async function parseBoundedJson(request:Request){
  if(request.headers.has('content-encoding'))
    throw new CloudMailError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudMailError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new CloudMailError('invalid_request',400);
  let length=0;
  const parts:Uint8Array[]=[];
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.length;
    if(length>22000){
      await reader.cancel();
      throw new CloudMailError('body_too_large',413);
    }
    parts.push(value);
  }
  try{
    const body:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))
      throw Error('shape');
    return body as Record<string,unknown>;
  }catch{throw new CloudMailError('invalid_json',400);}
}

async function handle(request:Request){
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const enabled=process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']==='true'&&
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true';
  if(!enabled||!/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return error(503,'firebase_cloud_mail_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==url.origin))
    return error(403,'access_denied');
  const authHeader=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(authHeader))
    return error(401,'authentication_required');
  try{
    const payload=await parseBoundedJson(request);
    if(!['status','send'].includes(String(payload.action)))
      return error(400,'invalid_action');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-cloud-mail';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const mail=createFirebaseCloudMail({
      db:getFirestore(app),auth:getAuth(app),snapshotId,projectId:'cormyr',
      enabled:true,
    });
    const token=authHeader.slice(7);
    const result=payload.action==='status'
      ?await mail.status(token)
      :await mail.send(token,payload);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudMailError)return error(e.status,e.code);
    // No IAM details, UIDs or private campaign data in the response.
    return error(503,'firebase_cloud_mail_unavailable');
  }
}

export const Route=createFileRoute('/api/firebase-cloud-mail')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
