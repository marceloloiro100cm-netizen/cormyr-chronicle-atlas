import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudMail} from '../../../scripts/firebase/cloud-mail-service.mjs';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';

/**
 * Firebase-only, server-side operational mail. No client Firestore access,
 * no legacy Supabase APIs, no emulator. This endpoint fails closed until
 * both the App Hosting flag and the independent runtime document are enabled.
 */
const HEADERS={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  Vary:'Authorization',
};
const fail=(status:number,error:string)=>Response.json({error},{status,headers:HEADERS});

async function limitedBody(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))throw new CloudAccessError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudAccessError('json_required',415);
  if(!request.body)throw new CloudAccessError('invalid_request',400);
  let bytes=0;
  const chunks:Uint8Array[]=[];
  const reader=request.body.getReader();
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>16*1024){
      await reader.cancel();
      throw new CloudAccessError('body_too_large',413);
    }
    chunks.push(value);
  }
  try{
    const o:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!o||typeof o!=='object'||Array.isArray(o))throw Error('invalid');
    return o as Record<string,unknown>;
  }catch{throw new CloudAccessError('invalid_json',400);}
}

async function handler(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'firebase_mail_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==url.origin))
    return fail(403,'access_denied');
  const header=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(header))
    return fail(401,'authentication_required');
  try{
    const body=await limitedBody(request);
    if(!['status','send'].includes(String(body['action'])))
      return fail(400,'invalid_action');
    const [{getApps,initializeApp,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-cloud-reads';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseCloudMail({
      auth:getAuth(app),db:getFirestore(app),snapshotId,
      projectId:'cormyr',enabled:true,
    });
    const idToken=header.slice(7);
    let result:unknown;
    if(body['action']==='status'){
      if(Object.keys(body).length!==1)return fail(400,'invalid_request');
      result=await service.status(idToken);
    }else{
      const {action:unused,...input}=body;
      result=await service.send(idToken,input);
    }
    return Response.json({result},{status:200,headers:HEADERS});
  }catch(err){
    if(err instanceof CloudAccessError)return fail(err.status,err.code);
    return fail(503,'firebase_mail_unavailable');
  }
}

export const Route=createFileRoute('/api/firebase-cloud-mail')({
  server:{handlers:{POST:async({request})=>handler(request)}},
});
