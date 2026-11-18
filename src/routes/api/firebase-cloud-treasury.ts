import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudTreasury,CloudTreasuryError}
  from '../../../scripts/firebase/cloud-house-treasury-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

/** Firestore Admin only. This endpoint never changes imported migration
 * snapshots or auto-provisions operational balances. */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const failure=(status:number,code:string)=>
  Response.json({error:code},{status,headers});
async function jsonInput(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new CloudTreasuryError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudTreasuryError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new CloudTreasuryError('invalid_request',400);
  const parts:Uint8Array[]=[];let bytes=0;
  while(true){
    const {value,done}=await reader.read();
    if(done)break;
    bytes+=value.length;
    if(bytes>2400){
      await reader.cancel();
      throw new CloudTreasuryError('body_too_large',413);
    }
    parts.push(value);
  }
  try{
    const v:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('shape');
    return v as Record<string,unknown>;
  }catch{throw new CloudTreasuryError('invalid_json',400);}
}
async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const cloudReadEnabled=process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true';
  const writeEnabled=cloudReadEnabled&&
    process.env['CORMYR_FIREBASE_CLOUD_TREASURY_ENABLED']==='true';
  const readEnabled=cloudReadEnabled&&
    process.env['CORMYR_FIREBASE_CLOUD_TREASURY_READ_ENABLED']==='true';
  if((!writeEnabled&&!readEnabled)||!/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return failure(503,'firebase_cloud_treasury_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return failure(403,'access_denied');
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(authorization))
    return failure(401,'authentication_required');
  try{
    const body=await jsonInput(request);
    if(body['action']!=='status'&&body['action']!=='adjust'&&
       body['action']!=='summary')
      return failure(400,'invalid_action');
    // A read-only deployment cannot route even a legitimate narrator write.
    if(body['action']==='summary'&&!readEnabled)
      return failure(503,'firebase_cloud_treasury_read_disabled');
    if(body['action']!=='summary'&&!writeEnabled)
      return failure(503,'firebase_cloud_treasury_write_disabled');
    if((body['action']==='status'||body['action']==='summary')&&
       Object.keys(body).some(k=>!['action','houseId'].includes(k)))
      return failure(400,'invalid_request');
    if(body['action']==='adjust'&&
       Object.keys(body).some(k=>![
         'action','requestKey','houseId','expectedVersion','delta','reason',
       ].includes(k)))
      return failure(400,'invalid_request');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-cloud-treasury';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseCloudTreasury({
      db:getFirestore(app),auth:getAuth(app),snapshotId,projectId:'cormyr',
      enabled:true,
    });
    const token=authorization.slice(7);
    const result=body['action']==='status'
      ?await service.status(token,body['houseId'])
      :body['action']==='summary'
        ?await service.summary(token,body['houseId'])
        :await service.adjust(token,{
        requestKey:body['requestKey'],houseId:body['houseId'],
        expectedVersion:body['expectedVersion'],delta:body['delta'],
        reason:body['reason'],
      });
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudTreasuryError)return failure(e.status,e.code);
    return failure(503,'firebase_cloud_treasury_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-cloud-treasury')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
