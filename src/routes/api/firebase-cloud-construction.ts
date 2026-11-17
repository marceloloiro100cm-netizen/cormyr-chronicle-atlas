import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudConstruction,CloudConstructionError}
  from '@/lib/house/firebase-construction-transaction';
import {crossOriginRejected} from '@/lib/server/request-origin';

/** Operational writes are disabled until two independent explicit gates:
 * server environment and reconciled Firestore runtime. No browser Firestore.
 */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const failure=(status:number,code:string)=>
  Response.json({error:code},{status,headers});

async function readBody(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new CloudConstructionError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudConstructionError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new CloudConstructionError('invalid_request',400);
  const chunks:Uint8Array[]=[];let total=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.length;
    if(total>2200){
      await reader.cancel();
      throw new CloudConstructionError('body_too_large',413);
    }
    chunks.push(value);
  }
  try{
    const v:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('shape');
    return v as Record<string,unknown>;
  }catch{throw new CloudConstructionError('invalid_json',400);}
}

async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_CONSTRUCTION_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return failure(503,'firebase_cloud_construction_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return failure(403,'access_denied');
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
    return failure(401,'authentication_required');
  try{
    const body=await readBody(request);
    if(body['action']!=='purchase'||Object.keys(body).some(k=>![
      'action','requestKey','houseId','expectedVersion',
      'itemId','domainId','name','parentId','supportId',
      'replaceId','weaponSpecialty',
    ].includes(k)))return failure(400,'invalid_construction_request');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-cloud-construction';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseCloudConstruction({
      db:getFirestore(app),auth:getAuth(app),snapshotId,projectId:'cormyr',
      enabled:true,
    });
    const result=await service.purchase(bearer.slice(7),{
      requestKey:body['requestKey'],houseId:body['houseId'],
      expectedVersion:body['expectedVersion'],itemId:body['itemId'],
      domainId:body['domainId'],name:body['name'],
      ...(body['parentId']!==undefined?{parentId:body['parentId']}:{}),
      ...(body['supportId']!==undefined?{supportId:body['supportId']}:{}),
      ...(body['replaceId']!==undefined?{replaceId:body['replaceId']}:{}),
      ...(body['weaponSpecialty']!==undefined?
        {weaponSpecialty:body['weaponSpecialty']}:{}),
    });
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudConstructionError)return failure(e.status,e.code);
    return failure(503,'firebase_cloud_construction_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-cloud-construction')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
