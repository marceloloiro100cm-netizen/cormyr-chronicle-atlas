import {createFileRoute} from '@tanstack/react-router';
import {createWorkspaceService,workspaceErrorCategory} from '@/lib/firebase-workspace/service';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
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
  const {db,auth}=await getFirebaseAdminServices();
  const result=await createWorkspaceService({db,auth,snapshotId,cacheImportedTables:true}).execute(bearer.slice(7),input);
  return Response.json({result},{headers});
 }catch(e){
  const category=workspaceErrorCategory(e);
  // Never leak raw Firestore/provider messages or tokens. Only reviewed fixed
  // error codes cross the boundary, including the Records approval gate.
  if(category.code==='workspace_unavailable')
   console.error('[firebase-workspace] unavailable',category.code);
  return error(category.status,category.code);
 }
}
export const Route=createFileRoute('/api/firebase-workspace')({server:{handlers:{POST:({request})=>handleWorkspace(request)}}});
