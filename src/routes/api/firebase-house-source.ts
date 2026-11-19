import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseCloudReadonly,CloudAccessError}
  from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {loadImportedHouseSheets,HouseSourceError}
  from '../../../scripts/firebase/workspace-house-source.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';
import {cloudReadFailureCategory} from '@/lib/server/cloud-read-error-category';

/** Firebase-only read of the immutable official House sheet, Army and Holdings. */
const headers={'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Vary':'Authorization'};
const err=(status:number,error:string)=>Response.json({error},{status,headers});
async function inputOf(request:Request):Promise<{houseId?:string}>{
  if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||
    request.headers.has('content-encoding'))
    throw new HouseSourceError('json_required',415);
  const reader=request.body?.getReader();
  if(!reader)throw new HouseSourceError('invalid_request',400);
  const parts:Uint8Array[]=[];let n=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    n+=value.byteLength;
    if(n>1024){await reader.cancel();throw new HouseSourceError('body_too_large',413);}
    parts.push(value);
  }
  let parsed:unknown;
  try{parsed=JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch{throw new HouseSourceError('invalid_json',400);}
  if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed)||
    Object.keys(parsed).some(k=>k!=='houseId')||
    ('houseId' in parsed&&typeof parsed.houseId!=='string'))
    throw new HouseSourceError('invalid_request',400);
  return parsed as {houseId?:string};
}
async function handle(request:Request):Promise<Response>{
  const id=process.env['CORMYR_FIREBASE_SNAPSHOT_ID'];
  if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     !id||!/^[a-f0-9]{64}$/.test(id)||
     process.env['FIRESTORE_EMULATOR_HOST']||process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return err(503,'firebase_cloud_read_disabled');
  if(new URL(request.url).search||request.headers.has('cookie')||
     crossOriginRejected(request))return err(403,'access_denied');
  const bearer=request.headers.get('authorization');
  if(!bearer||!/^Bearer [^\s]{10,10000}$/.test(bearer))
    return err(401,'authentication_required');
  try{
    const input=await inputOf(request);
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=await Promise.all([
      import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/firestore'),
    ]);
    const app=getApps().find(a=>a.name==='cormyr-house-archive')??
      initializeApp({projectId:'cormyr',credential:applicationDefault()},'cormyr-house-archive');
    const db=getFirestore(app);
    const service=createFirebaseCloudReadonly({
      auth:getAuth(app),db,snapshotId:id,projectId:'cormyr',enabled:true,
    });
    const scope=await service.workspaceMailScope(bearer.slice(7));
    const result=await loadImportedHouseSheets(db,id,scope,input.houseId);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof CloudAccessError)return err(e.status,e.code);
    if(e instanceof HouseSourceError)return err(e.status,e.code);
    console.error('[firebase-house-source] unavailable',cloudReadFailureCategory(e));
    return err(503,'firebase_house_source_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-house-source')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});
