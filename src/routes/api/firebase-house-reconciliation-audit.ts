import {createFileRoute} from '@tanstack/react-router';
import {
  createFirebaseHouseReconciliationAudit,HouseReconciliationAuditError,
} from '@/lib/house/firebase-house-reconciliation-audit';

/** Narrator-only diagnostic. Does not seed House operational state or grant
 * any approval. This read flag is independent of the economy's read gate.
 */
const headers={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  Vary:'Authorization',
};
const failure=(status:number,code:string)=>
  Response.json({error:code},{status,headers});

async function requestBody(request:Request):Promise<Record<string,unknown>>{
  if(request.headers.has('content-encoding'))
    throw new HouseReconciliationAuditError('unsupported_encoding',415);
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    throw new HouseReconciliationAuditError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new HouseReconciliationAuditError('invalid_request',400);
  const chunks:Uint8Array[]=[];let total=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.length;
    if(total>700){
      await reader.cancel();
      throw new HouseReconciliationAuditError('body_too_large',413);
    }
    chunks.push(value);
  }
  try{
    const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      throw Error('invalid');
    return parsed as Record<string,unknown>;
  }catch{throw new HouseReconciliationAuditError('invalid_json',400);}
}

async function handle(request:Request):Promise<Response>{
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_CLOUD_RECONCILIATION_AUDIT_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return failure(503,'house_reconciliation_audit_disabled');
  const url=new URL(request.url);
  if(url.search||request.headers.has('cookie')||
     request.headers.get('sec-fetch-site')==='cross-site'||
     (request.headers.has('origin')&&
      request.headers.get('origin')!==url.origin))
    return failure(403,'access_denied');
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(authorization))
    return failure(401,'authentication_required');
  try{
    const input=await requestBody(request);
    if(input['action']!=='inspect'||Object.keys(input).some(k=>
      !['action','houseId'].includes(k)))
      return failure(400,'invalid_request');
    if(typeof input['houseId']!=='string'||
       !/^[^/\u0000-\u001f\u007f]{1,128}$/.test(input['houseId']))
      return failure(400,'invalid_house');
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
        import('firebase-admin/firestore'),
      ]);
    const name='cormyr-house-reconciliation-audit';
    const app=getApps().find(a=>a.name===name)??initializeApp({
      projectId:'cormyr',credential:applicationDefault(),
    },name);
    const service=createFirebaseHouseReconciliationAudit({
      db:getFirestore(app),auth:getAuth(app),snapshotId,
      projectId:'cormyr',enabled:true,
    });
    const result=await service.inspect(authorization.slice(7),input['houseId']);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof HouseReconciliationAuditError)
      return failure(e.status,e.code);
    return failure(503,'house_reconciliation_audit_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-house-reconciliation-audit')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
