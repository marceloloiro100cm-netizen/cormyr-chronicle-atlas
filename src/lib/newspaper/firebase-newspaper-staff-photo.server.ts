/* eslint-disable @typescript-eslint/no-explicit-any -- Firebase Admin boundary. */
import {createHash} from 'node:crypto';
import {createFirebaseCloudReadonly} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';
import {commitNewspaperStaffPhoto,NewspaperStaffError}
 from './firebase-newspaper-staff.server';

const SNAP=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX=5*1024*1024;
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
type Input={id?:string;requestId:string;name:string;specialty:string;bio:string;
 sortOrder?:number;contentType:string;dataBase64:string};
const fail=(code:string,status=400):never=>{throw new NewspaperStaffError(code,status);};
const imageType=(data:Buffer):string|null=>{
 if(data.length>=8&&data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
 if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
};
export function parseStaffPhotoInput(raw:unknown):{input:Input;bytes:Buffer;ext:string;sha256:string}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('invalid_staff_photo');
 const v=raw as Record<string,unknown>;
 if(v['action']!=='saveStaffPhoto'||typeof v['requestId']!=='string'||!UUID.test(v['requestId'])||
    (v['id']!==undefined&&(!v['id']||typeof v['id']!=='string'||!ID.test(v['id'])))||
    typeof v['name']!=='string'||!v['name'].trim()||v['name'].length>120||
    typeof v['specialty']!=='string'||v['specialty'].length>120||
    typeof v['bio']!=='string'||v['bio'].length>3000||
    (v['sortOrder']!==undefined&&(!Number.isSafeInteger(v['sortOrder'])||
     (v['sortOrder'] as number)<0||(v['sortOrder'] as number)>10000))||
    !['image/png','image/jpeg','image/webp'].includes(String(v['contentType']))||
    typeof v['dataBase64']!=='string'||v['dataBase64'].length>7_000_000||
    !B64.test(v['dataBase64']))
  fail('invalid_staff_photo');
 const bytes=Buffer.from(v['dataBase64'] as string,'base64');
 if(bytes.length<1||bytes.length>MAX||bytes.toString('base64')!==v['dataBase64']||
    imageType(bytes)!==v['contentType'])fail('invalid_staff_image',415);
 const ext=v['contentType']==='image/png'?'png':v['contentType']==='image/webp'?'webp':'jpg';
 return {input:v as unknown as Input,bytes,ext,
  sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function saveFirebaseStaffPhoto({db,auth,bucket,snapshotId,token,raw}:{
 db:any;auth:any;bucket:any;snapshotId:string;token:string;raw:unknown;
}):Promise<{id:string;photoPath:string}>{
 if(!SNAP.test(snapshotId)||!db?.runTransaction||!bucket?.file)fail('staff_photo_unavailable',503);
 const {input,bytes,ext,sha256}=parseStaffPhotoInput(raw);
 const cloud=createFirebaseCloudReadonly({db,auth,snapshotId,projectId:'cormyr',enabled:true});
 const viewer=await cloud.workspaceScope(token);
 if(viewer.profile!=='editor'&&viewer.profile!=='narrador')fail('access_denied',403);
 const [stage,runtime]=await Promise.all([
  db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).get(),
  db.collection('campaignCloudRuntime').doc(snapshotId).get(),
 ]);
 const config=runtime.data();
 if(!stage.exists||stage.data()?.private!==true||stage.data()?.status!=='complete'||
    !runtime.exists||config?.status!=='active'||config?.private!==true||
    config?.sourceSnapshotId!==snapshotId||config?.sourceSnapshotReconciled!==true||
    config?.applicationEnabled!==true)
  fail('staff_photo_not_approved',503);
 const id=input.id??input.requestId;
 const path=`newspaper-staff/${snapshotId}/${id}/${input.requestId}.${ext}`;
 const file=bucket.file(path);
 try{
  await file.save(bytes,{
   resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},
   metadata:{contentType:input.contentType,cacheControl:'private, no-store',
    metadata:{sha256,editorUid:viewer.uid,sourceSnapshotId:snapshotId,staffId:id}},
  });
 }catch(e){
  // A primeira requisição pode ter terminado no Storage e perdido a resposta.
  // Nunca sobrescrevemos bytes existentes nem os apagamos depois de falha.
  const [exists]=await file.exists();
  if(!exists)throw e;
  const [meta]=await file.getMetadata();
  if(meta?.metadata?.sha256!==sha256||meta?.metadata?.staffId!==id||
     meta?.metadata?.sourceSnapshotId!==snapshotId||Number(meta.size)!==bytes.length)
   fail('staff_photo_conflict',409);
 }
 const imported=await readWorkspaceTable(db,snapshotId,'campaign_newspaper_staff') as Record<string,any>[];
 const saved=await commitNewspaperStaffPhoto({
  db,snapshotId,actorUid:viewer.uid,imported,
  input:{id:input.id,requestId:input.requestId,photoPath:path,
   name:input.name,specialty:input.specialty,bio:input.bio,sortOrder:input.sortOrder},
 });
 return {id:saved.id,photoPath:path};
}
