/* eslint-disable @typescript-eslint/no-explicit-any -- Firebase Admin boundary. */
/* Fotografia pública apenas dos funcionários presentes na Redação do Jornal. */
import {createHash} from 'node:crypto';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';
import {readNewspaperStaffOverlay} from './firebase-newspaper-staff.server';

const SNAP=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const PHOTO=/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,299}$/;
const LIMIT=5*1024*1024;
export class PublicStaffPhotoError extends Error{
 constructor(readonly status:400|404|503){super('staff_photo_unavailable');}
}
const reject=(status:400|404|503):never=>{throw new PublicStaffPhotoError(status);};
const typeOf=(data:Buffer):string|null=>{
 if(data.length>=8&&data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
 if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
};
export const publicStaffPhotoSrc=(id:string):string|null=>
 ID.test(id)?'/api/public/newspaper-staff-photo?staff='+encodeURIComponent(id):null;

/** Nunca aceita caminho do navegador. O Firestore determina quem pertence à Redação. */
export async function readPublicStaffPhoto({db,bucket,snapshotId,staffId}:{
 db:any;bucket:any;snapshotId:string;staffId:string;
}):Promise<{data:Buffer;contentType:string}>{
 if(!SNAP.test(snapshotId)||!db?.collection||!bucket?.file)reject(503);
 if(!ID.test(staffId))reject(400);
 const stage=await db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).get();
 if(!stage.exists||stage.data()?.status!=='complete'||stage.data()?.private!==true)reject(503);
 const overlay=await readNewspaperStaffOverlay(db,snapshotId);
 const rows=overlay??await readWorkspaceTable(db,snapshotId,'campaign_newspaper_staff');
 const person=rows.find((row:Record<string,unknown>)=>row['id']===staffId);
 const path=person?.['photo_path'];
 if(typeof path!=='string'||!PHOTO.test(path)||path.includes('..')||path.includes('//'))reject(404);
 // Fotos novas: o vínculo do registro determina um caminho exato no Storage.
 // Fotos legadas continuam nos dois prefixos da migração, sem alterações.
 const currentPath=path.startsWith('newspaper-staff/')&&
  /^newspaper-staff\/[a-f0-9]{64}\/[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(path)&&
  path.startsWith(`newspaper-staff/${snapshotId}/${staffId}/`);
 if(path.startsWith('newspaper-staff/')&&!currentPath)reject(404);
 const candidates=currentPath?[path]:[
  'migration-staging/campaign-newspaper-staff/'+path,
  'campaign-newspaper-staff/'+path,
 ];
 for(const candidate of candidates){
  const file=bucket.file(candidate);
  const [exists]=await file.exists();
  if(!exists)continue;
  const [meta]=await file.getMetadata();
  const size=Number(meta?.size);
  if(!Number.isSafeInteger(size)||size<1||size>LIMIT)reject(404);
  const [data]=await file.download();
  if(!Buffer.isBuffer(data)||data.length!==size)reject(503);
  const contentType=typeOf(data);
  if(contentType===null)throw new PublicStaffPhotoError(503);
  if(currentPath){
   const extra=meta?.metadata;
   if(extra?.sourceSnapshotId!==snapshotId||extra?.staffId!==staffId||
      extra?.sha256!==createHash('sha256').update(data).digest('hex'))
    reject(503);
  }
  return {data,contentType};
 }
 return reject(404);
}
