import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseAccountService} from '../../../scripts/firebase/cloud-account-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={'Cache-Control':'private, no-store, max-age=0',
  'Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({error:code},{status,headers});
const ACTIONS=new Set(['status','list','submit','completePassword']);
async function handle(request:Request):Promise<Response>{
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_ACCOUNTS_ENABLED']!=='true'||
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST'])
   return fail(503,'account_service_disabled');
 if(new URL(request.url).search||request.headers.has('cookie')||
    crossOriginRejected(request))return fail(403,'access_denied');
 const bearer=request.headers.get('authorization')??'';
 if(!/^Bearer [^\s]{10,10000}$/.test(bearer))
   return fail(401,'authentication_required');
 if(request.headers.has('content-encoding')||
    request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
   return fail(415,'json_required');
 try{
  const reader=request.body?.getReader();
  if(!reader)return fail(400,'invalid_request');
  let bytes=0;const chunks:Uint8Array[]=[];
  while(true){
    const {value,done}=await reader.read();
    if(done)break;
    bytes+=value.length;
    if(bytes>6400){await reader.cancel();return fail(413,'body_too_large');}
    chunks.push(value);
  }
  let input:Record<string,unknown>;
  try{
    const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
      return fail(400,'invalid_request');
    input=parsed as Record<string,unknown>;
  }catch{return fail(400,'invalid_json');}
  const action=input['action'];
  if(typeof action!=='string'||!ACTIONS.has(action))
    return fail(400,'invalid_action');
  if(action==='list'||action==='status'){
    if(Object.keys(input).length!==1)return fail(400,'invalid_request');
  }else if(action==='completePassword'){
    if(Object.keys(input).some(k=>!['action','password','requestKey'].includes(k)))
      return fail(400,'invalid_request');
  }else if(action==='submit'){
    if(Object.keys(input).some(k=>!['action','targetUid','expectedVersion','requestKey',
      'name','email','password','profile','active','requireChange',
      'memberHouseIds','editHouseIds','attrHouseIds'].includes(k)))
      return fail(400,'invalid_request');
  }
  const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
   await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth'),
     import('firebase-admin/firestore')]);
  const name='cormyr-account-management';
  const app=getApps().find(a=>a.name===name)??initializeApp({
    projectId:'cormyr',credential:applicationDefault(),
  },name);
  const service=createFirebaseAccountService({
    db:getFirestore(app),auth:getAuth(app),snapshotId,projectId:'cormyr',enabled:true,
  });
  const token=bearer.slice(7);
  const result=action==='status'?await service.status(token):
    action==='list'?await service.list(token):
    action==='completePassword'?await service.completePassword(token,input):
    await service.submit(token,input);
  return Response.json({result},{headers});
 }catch(e){
  const status=typeof (e as {status?:unknown})?.status==='number'
    ?(e as {status:number}).status:503;
  const code=(e as {code?:unknown})?.code;
  return fail(status,typeof code==='string'&&/^[a-z_]{3,60}$/.test(code)
    ?code:'account_service_unavailable');
 }
}
export const Route=createFileRoute('/api/firebase-accounts')({
 server:{handlers:{POST:({request})=>handle(request)}},
});
