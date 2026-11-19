import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudNewspaper,CloudNewspaperError}
  from '../../../scripts/firebase/cloud-newspaper-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

/** Strictly gated Cloud-only publication, never writes migration snapshots. */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const fail=(status:number,code:string)=>
  Response.json({error:code},{status,headers});
async function boundedJson(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new CloudNewspaperError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudNewspaperError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new CloudNewspaperError('invalid_request',400);
  const chunks:Uint8Array[]=[];let length=0;
  while(true){
    const {value,done}=await reader.read();
    if(done)break;
    length+=value.length;
    if(length>260_000){
      await reader.cancel();
      throw new CloudNewspaperError('body_too_large',413);
    }
    chunks.push(value);
  }
  try{
    const v:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!v||typeof v!=='object'||Array.isArray(v))
      throw Error('invalid shape');
    return v as Record<string,unknown>;
  }catch{throw new CloudNewspaperError('invalid_json',400);}
}

async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const enabled=process.env['CORMYR_FIREBASE_CLOUD_NEWSPAPER_ENABLED']==='true'&&
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true';
  if(!enabled||!/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'firebase_cloud_newspaper_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return fail(403,'access_denied');
  const token=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(token))
    return fail(401,'authentication_required');
  try{
    const payload=await boundedJson(request);
    if(!['status','publish','listEditorial','getEditorial','saveEdition',
      'getReceipts','markRead','markUnread'].includes(String(payload['action'])))
      return fail(400,'invalid_action');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-cloud-newspaper';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const paper=createFirebaseCloudNewspaper({
      db:getFirestore(app),auth:getAuth(app),snapshotId,projectId:'cormyr',
      enabled:true,
    });
    const idToken=token.slice(7);
    const result=payload['action']==='getReceipts'
      ?Object.keys(payload).length===1?await paper.listReaderReceipts(idToken):null
      :['markRead','markUnread'].includes(String(payload['action']))
      ?await paper.markReader(idToken,payload)
      :payload['action']==='getEditorial'?await paper.getEditorial(idToken,payload)
      :payload['action']==='saveEdition'?await paper.saveEdition(idToken,payload)
      :payload['action']==='listEditorial'?(Object.keys(payload).length===1?await paper.listEditorial(idToken):null)
      :payload['action']==='status'
      ?Object.keys(payload).length===1
        ?await paper.status(idToken)
        :null
      :await paper.publish(idToken,payload);
    if(result===null)return fail(400,'invalid_request');
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudNewspaperError)return fail(e.status,e.code);
    return fail(503,'firebase_cloud_newspaper_unavailable');
  }
}

export const Route=createFileRoute('/api/firebase-cloud-newspaper')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});

