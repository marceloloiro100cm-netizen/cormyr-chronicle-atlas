import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseHouseActivation,HouseActivationError} from '@/lib/house/firebase-house-activation';
import {crossOriginRejected} from '@/lib/server/request-origin';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Vary':'Authorization'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
async function handle(request:Request){
  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  if(process.env['CORMYR_FIREBASE_HOUSE_ACTIVATION_ENABLED']!=='true'||
     process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])return fail(503,'house_activation_disabled');
  if(new URL(request.url).search||request.headers.has('cookie')||crossOriginRejected(request))
    return fail(403,'access_denied');
  const token=request.headers.get('authorization')??'';
  if(!/^Bearer [^\s]{10,10000}$/.test(token))return fail(401,'authentication_required');
  if(request.headers.has('content-encoding')||
     request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return fail(415,'json_required');
  try{
    const reader=request.body?.getReader();
    if(!reader)return fail(400,'invalid_request');
    const chunks:Uint8Array[]=[];let bytes=0;
    while(true){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>2200){await reader.cancel();return fail(413,'body_too_large');}
      chunks.push(value);
    }
    let input:unknown;
    try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{return fail(400,'invalid_json');}
    const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=await Promise.all([
      import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/firestore')]);
    const name='cormyr-house-activation';
    const app=getApps().find(a=>a.name===name)??initializeApp({projectId:'cormyr',credential:applicationDefault()},name);
    const service=createFirebaseHouseActivation({db:getFirestore(app),auth:getAuth(app),snapshotId,enabled:true});
    const action=input&&typeof input==='object'&&!Array.isArray(input)
      ?(input as Record<string,unknown>)['action']:null;
    if((action==='activateAll'||action==='list')&&
       Object.keys(input as object).length!==1)
      return fail(400,'invalid_activation_request');
    const result=action==='list'?await service.listHouses(token.slice(7))
      :action==='activateAll'?await service.activateAll(token.slice(7))
      :await service.execute(token.slice(7),input);
    return Response.json({result},{status:200,headers});
  }catch(e){
    if(e instanceof HouseActivationError)return fail(e.status,e.code);
    return fail(503,'house_activation_unavailable');
  }
}
export const Route=createFileRoute('/api/firebase-house-activation')({
  server:{handlers:{POST:async({request})=>handle(request)}},
});

