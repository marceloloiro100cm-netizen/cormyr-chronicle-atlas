import {createFileRoute} from '@tanstack/react-router';
import {createFirebaseHouseRulesService}
 from '../../../scripts/firebase/cloud-house-rules-service.mjs';
import {catalogSchema} from '@/lib/house/schemas';
import {crossOriginRejected} from '@/lib/server/request-origin';

const headers={'Cache-Control':'private, no-store, max-age=0',
  'Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({error:code},{status,headers});

async function handle(request:Request):Promise<Response>{
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_HOUSE_RULES_ENABLED']!=='true'||
    process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST'])
   return fail(503,'house_rules_disabled');
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
  let length=0;const chunks:Uint8Array[]=[];
  while(true){
   const {done,value}=await reader.read();
   if(done)break;length+=value.length;
   if(length>40000){await reader.cancel();return fail(413,'body_too_large');}
   chunks.push(value);
  }
  let v:Record<string,unknown>;
  try{
   const input:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!input||typeof input!=='object'||Array.isArray(input))
    return fail(400,'invalid_request');
   v=input as Record<string,unknown>;
  }catch{return fail(400,'invalid_json');}
  if(v['action']!=='save'||Object.keys(v).some(k=>![
    'action','houseId','requestKey','expectedVersion','definition'
   ].includes(k)))return fail(400,'invalid_rule_request');
  const parsed=catalogSchema.safeParse(v['definition']);
  if(!parsed.success)return fail(400,'invalid_rule_definition');
  const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=
   await Promise.all([import('firebase-admin/app'),
    import('firebase-admin/auth'),import('firebase-admin/firestore')]);
  const name='cormyr-house-rules';
  const app=getApps().find(x=>x.name===name)??initializeApp({
   projectId:'cormyr',credential:applicationDefault(),
  },name);
  const service=createFirebaseHouseRulesService({
   db:getFirestore(app),auth:getAuth(app),snapshotId,
   projectId:'cormyr',enabled:true,
  });
  const result=await service.save(bearer.slice(7),{
   houseId:v['houseId'] as string,
   requestKey:v['requestKey'] as string,
   expectedVersion:v['expectedVersion'] as number,
   definition:{...parsed.data,custom:true},
  });
  return Response.json({result},{headers});
 }catch(e){
  const status=(e as {status?:number})?.status??503;
  const code=(e as {code?:string})?.code;
  return fail(status,typeof code==='string'&&/^[a-z_]{3,60}$/.test(code)
   ?code:'house_rules_unavailable');
 }
}
export const Route=createFileRoute('/api/firebase-house-rules')({
 server:{handlers:{POST:({request})=>handle(request)}},
});
