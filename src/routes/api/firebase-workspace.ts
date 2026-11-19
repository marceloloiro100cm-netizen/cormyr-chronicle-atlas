import {createFileRoute} from '@tanstack/react-router';
import {createWorkspaceService} from '@/lib/firebase-workspace/service';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {crossOriginRejected} from '@/lib/server/request-origin';
const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
export async function handleWorkspace(request:Request){
 const error=(status:number,code:string)=>Response.json({error:code},{status,headers});
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_CLOUD_READ_ENABLED']!=='true'||!/^[a-f0-9]{64}$/.test(snapshotId)||
  process.env['FIRESTORE_EMULATOR_HOST']||process.env['FIREBASE_AUTH_EMULATOR_HOST'])return error(503,'workspace_disabled');
 if(new URL(request.url).search||request.headers.has('cookie')||crossOriginRejected(request))return error(403,'access_denied');
 const bearer=request.headers.get('authorization');
 if(!bearer||!/^Bearer [^\s]{10,10000}$/.test(bearer))return error(401,'authentication_required');
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||request.headers.has('content-encoding'))return error(415,'json_required');
 try{
  const reader=request.body?.getReader();if(!reader)return error(400,'invalid_request');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>800000){await reader.cancel();return error(413,'body_too_large');}chunks.push(value);}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return error(400,'invalid_json');}
  const [{initializeApp,getApps,applicationDefault},{getAuth},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth'),import('firebase-admin/firestore')]);
  const name='cormyr-workspace',app=getApps().find(a=>a.name===name)??initializeApp({projectId:'cormyr',credential:applicationDefault()},name);
  const result=await createWorkspaceService({db:getFirestore(app),auth:getAuth(app),snapshotId}).execute(bearer.slice(7),input);
  return Response.json({result},{headers});
 }catch(e){
  if(e instanceof CloudAccessError)return error(e.status,e.code);
  // Fixed, content-free categories so a blocked area can be diagnosed
  // without exposing Firestore paths, IDs or provider messages.
  const m=e instanceof Error?e.message:'';
  const known:Record<string,string>={
   workspace_import_pending:'workspace_import_pending',
   workspace_source_table_missing:'workspace_source_table_missing',
   workspace_table_not_supported:'workspace_table_not_supported',
   'Registro não encontrado ou ambíguo.':'workspace_ambiguous_record',
   'Consulta não suportada pelo Firebase.':'workspace_query_not_supported',
   firebase_operational_mail_integrity_failed:'operational_mail_integrity_failed',
   workspace_mail_contract_invalid:'workspace_mail_contract_invalid',
   workspace_archive_integrity_failed:'workspace_archive_integrity_failed',
  };
  const code=Object.hasOwn(known,m)?known[m]!:'workspace_unavailable';
  console.error('[firebase-workspace] unavailable',code);
  return error(503,code);
 }
}
export const Route=createFileRoute('/api/firebase-workspace')({server:{handlers:{POST:({request})=>handleWorkspace(request)}}});
