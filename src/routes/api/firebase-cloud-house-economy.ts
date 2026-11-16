import {createFileRoute} from '@tanstack/react-router';
import {
  createFirebaseOperationalHouseRead,CloudEconomyReadError,
} from '@/lib/house/firebase-operational-house-read';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';

const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  Vary:'Authorization',
};
const failure=(status:number,code:string)=>
  Response.json({error:code},{status,headers});

async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_HOUSE_ECONOMY_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return failure(503,'firebase_operational_economy_read_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&request.headers.get('origin')!==url.origin))
    return failure(403,'access_denied');
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(authorization))
    return failure(401,'authentication_required');
  if(request.headers.has('content-encoding')||
     request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return failure(415,'json_required');
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>900))
    return failure(413,'body_too_large');
  try{
    const reader=request.body?.getReader();
    if(!reader)return failure(400,'invalid_request');
    const chunks:Uint8Array[]=[];let total=0;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.length;
      if(total>900){await reader.cancel();return failure(413,'body_too_large');}
      chunks.push(value);
    }
    const input:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!input||typeof input!=='object'||Array.isArray(input)||
       Object.keys(input).some(k=>!['action','houseId'].includes(k))||
       (input as Record<string,unknown>)['action']!=='summary')
      return failure(400,'invalid_request');
    const houseId=(input as Record<string,unknown>)['houseId'];
    if(typeof houseId!=='string'||houseId.length<1||houseId.length>128||
       /[/\u0000-\u001f\u007f]/.test(houseId))
      return failure(400,'invalid_house');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-house-economy-read';
    const app=getApps().find(x=>x.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseOperationalHouseRead({
      db:getFirestore(app),auth:getAuth(app),snapshotId,projectId:'cormyr',
      enabled:true,
    });
    const result=await service.summary(authorization.slice(7),houseId);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudAccessError)return failure(e.status,e.code);
    if(e instanceof CloudEconomyReadError)return failure(e.status,e.code);
    if(e instanceof SyntaxError)return failure(400,'invalid_json');
    return failure(503,'firebase_operational_economy_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-cloud-house-economy')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
