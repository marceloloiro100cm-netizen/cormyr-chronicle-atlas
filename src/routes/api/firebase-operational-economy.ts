import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {createFirebaseOperationalEconomyRead,CloudEconomyReadError}
  from '@/lib/house/firebase-operational-economy-read';
import {crossOriginRejected} from '@/lib/server/request-origin';

/** Gated read-only projection; does not enable purchase operations. */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const failure=(status:number,code:string)=>
  Response.json({error:code},{status,headers});
async function body(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new CloudEconomyReadError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudEconomyReadError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new CloudEconomyReadError('invalid_request',400);
  const pieces:Uint8Array[]=[];let length=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.length;
    if(length>800){
      await reader.cancel();
      throw new CloudEconomyReadError('body_too_large',413);
    }
    pieces.push(value);
  }
  try{
    const raw:unknown=JSON.parse(Buffer.concat(pieces).toString('utf8'));
    if(!raw||typeof raw!=='object'||Array.isArray(raw))
      throw Error('bad request');
    return raw as Record<string,unknown>;
  }catch{throw new CloudEconomyReadError('invalid_json',400);}
}
async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_CONSTRUCTION_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return failure(503,'operational_economy_read_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return failure(403,'access_denied');
  const bearer=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
    return failure(401,'authentication_required');
  try{
    const req=await body(request);
    if(req['action']!=='getHouse'||Object.keys(req).some(k=>
      !['action','houseId'].includes(k)))
      return failure(400,'invalid_request');
    const {auth:adminAuth,db:adminDb}=await getFirebaseAdminServices();
    const service=createFirebaseOperationalEconomyRead({
      db:adminDb,auth:adminAuth,
      snapshotId,projectId:'cormyr',enabled:true,
    });
    const result=await service.getHouse(bearer.slice(7),req['houseId']);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudEconomyReadError)
      return failure(e.status,e.code);
    return failure(503,'operational_economy_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-operational-economy')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
