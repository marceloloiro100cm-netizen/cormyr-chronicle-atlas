import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseHouseOperation,HouseOperationError}
 from '@/lib/house/firebase-house-operation-transaction';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={'Cache-Control':'private, no-store, max-age=0',
 'Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const error=(status:number,code:string)=>Response.json({error:code},{status,headers});
async function handle(request:Request):Promise<Response>{
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
   process.env['CORMYR_FIREBASE_HOUSE_OPS_ENABLED']!=='true'||
   !/^[a-f0-9]{64}$/.test(snapshotId)||
   process.env['FIREBASE_AUTH_EMULATOR_HOST']||
   process.env['FIRESTORE_EMULATOR_HOST'])
  return error(503,'house_operations_disabled');
 if(new URL(request.url).search||request.headers.has('cookie')||
    crossOriginRejected(request))return error(403,'access_denied');
 const bearer=request.headers.get('authorization')??'';
 if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
  return error(401,'authentication_required');
 if(request.headers.has('content-encoding')||
    request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
  return error(415,'json_required');
 try{
  const stream=request.body?.getReader();
  if(!stream)return error(400,'invalid_json');
  const chunks:Uint8Array[]=[];let bytes=0;
  while(true){
   const {done,value}=await stream.read();
   if(done)break;
   bytes+=value.length;
   if(bytes>16000){await stream.cancel();return error(413,'body_too_large');}
   chunks.push(value);
  }
  let data:unknown;
  try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{return error(400,'invalid_json');}
  const [{getApps,initializeApp,applicationDefault},{getAuth},{getFirestore}]=
   await Promise.all([import('firebase-admin/app'),
    import('firebase-admin/auth'),import('firebase-admin/firestore')]);
  const name='cormyr-house-operations';
  const app=getApps().find(x=>x.name===name)??initializeApp({
   projectId:'cormyr',credential:applicationDefault(),
  },name);
  const service=createFirebaseHouseOperation({db:getFirestore(app),
   auth:getAuth(app),snapshotId,projectId:'cormyr',enabled:true});
  const result=await service.execute(bearer.slice(7),data);
  return Response.json({result},{headers});
 }catch(e){
  if(e instanceof HouseOperationError)return error(e.status,e.code);
  return error(503,'house_operation_unavailable');
 }
}
export const Route=createFileRoute('/api/firebase-house-operation')({
 server:{handlers:{POST:({request})=>handle(request)}},
});
