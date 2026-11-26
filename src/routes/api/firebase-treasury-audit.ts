import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {createFirebaseTreasuryAudit,CloudTreasuryAuditError}
  from '../../../scripts/firebase/cloud-treasury-audit-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Vary':'Authorization',
};
const fail=(status:number,code:string)=>
  Response.json({error:code},{status,headers});
async function parseBody(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new CloudTreasuryAuditError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new CloudTreasuryAuditError('json_required',415);
  const stream=request.body?.getReader();
  if(!stream)throw new CloudTreasuryAuditError('invalid_request',400);
  const parts:Uint8Array[]=[];let size=0;
  while(true){
    const {value,done}=await stream.read();
    if(done)break;
    size+=value.length;
    if(size>1000){await stream.cancel();
      throw new CloudTreasuryAuditError('body_too_large',413);}
    parts.push(value);
  }
  try{
    const v:unknown=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(v===null||typeof v!=='object'||Array.isArray(v))
      throw Error('invalid');
    return v as Record<string,unknown>;
  }catch{throw new CloudTreasuryAuditError('invalid_json',400);}
}
async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const enabled=process.env['CORMYR_FIREBASE_CLOUD_TREASURY_AUDIT_ENABLED']==='true'&&
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']==='true';
  if(!enabled||!/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503,'firebase_treasury_audit_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     crossOriginRejected(request))
    return fail(403,'access_denied');
  const header=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(header))
    return fail(401,'authentication_required');
  try{
    const body=await parseBody(request);
    if(body['action']!=='history'||Object.keys(body).length!==2||
       !Object.hasOwn(body,'houseId'))
      return fail(400,'invalid_request');
    const {auth:adminAuth,db:adminDb}=await getFirebaseAdminServices();
    const service=createFirebaseTreasuryAudit({
      db:adminDb,auth:adminAuth,snapshotId,
      projectId:'cormyr',enabled:true,
    });
    const result=await service.list(header.slice(7),body['houseId']);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudTreasuryAuditError)return fail(e.status,e.code);
    return fail(503,'firebase_treasury_audit_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-treasury-audit')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
