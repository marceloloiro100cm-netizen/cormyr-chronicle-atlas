import {deletedNewspaperIds} from '../../../scripts/firebase/newspaper-deleted.mjs';
import {createHash} from 'node:crypto';
/** Only images named in a published, independently reviewed edition may be served. */
const SNAP=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LEGACY=/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,299}$/;
const MAX_IMAGE_BYTES=15*1024*1024;
const imageType=(bytes:Buffer):string|null=>{
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))
  return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)
  return 'image/jpeg';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&
    bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
};
export class NewspaperImageError extends Error{
 constructor(readonly status:400|404|503,readonly code:string){super(code);}
}
const bad=(status:400|404|503,code:string):never=>{throw new NewspaperImageError(status,code);};
export type ImageOptions={db:any;bucket:any;snapshotId:string;editionId:string;index:number};

/** Strictly read-only: no caller-controlled bucket/path and no permission change. */
export async function readPublishedNewspaperImage({
 db,bucket,snapshotId,editionId,index,
}:ImageOptions):Promise<{data:Buffer;contentType:string}>{
 if(!SNAP.test(snapshotId)||!db||typeof db.collection!=='function'||
    !bucket||typeof bucket.file!=='function')
  bad(503,'newspaper_image_unavailable');
 if(!ID.test(editionId)||!Number.isSafeInteger(index)||index<0||index>=80)
  bad(400,'newspaper_image_request_invalid');
 const stage=await db.collection('migrationNewspaperRuntimeStage').doc(snapshotId);
 const ready=await stage.get();
 if(!ready.exists||ready.data()?.private!==true||ready.data()?.status!=='complete')
  bad(503,'newspaper_image_stage_pending');
 const cloud=editionId.startsWith('cloud-');
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 const record=await (cloud?runtime.collection('publishedNewspapers'):
  stage.collection('editions')).doc(editionId).get();
 const e=record.exists?record.data():null;
 if(!e||e.id!==editionId||e.cancelledAt!=null||
    (cloud&&(e.source!=='firebase-cloud'||e.sourceSnapshotId!==snapshotId))||
    !['published','archived'].includes(e.state)||
    !Number.isSafeInteger(e.editionNo)||
    typeof e.publishedAt!=='string'||!Array.isArray(e.blocks))
  bad(404,'newspaper_image_not_found');
 if((await deletedNewspaperIds(db,snapshotId)).has(editionId))
  bad(404,'newspaper_image_not_found');
 const block=e.blocks[index];
 if(!block||!['image'].includes(block.type??block.kind)||
    typeof block.imagePath!=='string'||!LEGACY.test(block.imagePath)||
    block.imagePath.includes('..')||block.imagePath.includes('//'))
  bad(404,'newspaper_image_not_found');
 let file;
 let expectedHash:string|null=null;
 if(cloud){
  if(typeof e.sourceHistoricId==='string'){
   // A historical copy may reference only the SAME unchanged image of
   // the imported edition. The original bytes are never rewritten.
   const source=await stage.collection('editions').doc(e.sourceHistoricId).get();
   const original=source.data();
   if(!source.exists||original?.id!==e.sourceHistoricId||
      !Array.isArray(original.blocks)||!original.blocks.some((b:any)=>
       b.id===block.id&&b.type==='image'&&b.imagePath===block.imagePath))
    bad(404,'newspaper_image_not_found');
   file=bucket.file('migration-staging/campaign-newspapers/'+block.imagePath);
   const [found]=await file.exists();
   if(!found)file=bucket.file('campaign-newspapers/'+block.imagePath);
  }else{
   if(!new RegExp('^newspaper-media/'+snapshotId+
     '/editionImage/[0-9a-f-]{36}\\.(?:png|jpg|webp)$').test(block.imagePath))
    bad(404,'newspaper_image_not_found');
   const media=await runtime.collection('newspaperMedia').doc(
     createHash('sha256').update('newspaper-media:'+block.imagePath).digest('hex')).get();
   const v=media.data();
   if(!media.exists||v?.state!=='ready'||v.path!==block.imagePath||
      v.kind!=='editionImage'||v.editionId!==editionId||
      v.sourceSnapshotId!==snapshotId||typeof v.sha256!=='string')
    bad(404,'newspaper_image_not_found');
   expectedHash=v.sha256;
   file=bucket.file(block.imagePath);
  }
 }else{
  // Imported originals remain at their historical, read-only locations.
  file=bucket.file('migration-staging/campaign-newspapers/'+block.imagePath);
  const [found]=await file.exists();
  if(!found)file=bucket.file('campaign-newspapers/'+block.imagePath);
 }
 const [exists]=await file.exists();
 if(!exists)bad(404,'newspaper_image_not_found');
 const [meta]=await file.getMetadata();
 const size=Number(meta?.size);
 if(!Number.isSafeInteger(size)||size<1||size>MAX_IMAGE_BYTES)
  bad(404,'newspaper_image_not_found');
 const [bytes]=await file.download();
 if(!Buffer.isBuffer(bytes)||bytes.length!==size||
    expectedHash&&createHash('sha256').update(bytes).digest('hex')!==expectedHash)
  bad(503,'newspaper_image_integrity_failed');
 const type=imageType(bytes);
 if(!type)return bad(503,'newspaper_image_type_invalid');
 // A signed public edition already has an immutable, reviewed source. The
 // original image path never appears in the response URL or headers.
 return {data:bytes,contentType:type};
}
export function publishedImageSrc(editionId:string,index:number):string|null{
 if(!ID.test(editionId)||!Number.isSafeInteger(index)||index<0||index>=80)return null;
 return '/api/public/newspaper-image?edition='+encodeURIComponent(editionId)+'&index='+index;
}

/** Public PDF: only a published Cloud edition and its verified media record. */
export async function readPublishedNewspaperPdf({db,bucket,snapshotId,editionId}:Omit<ImageOptions,'index'>):
 Promise<{data:Buffer;contentType:'application/pdf'}>{
 if(!SNAP.test(snapshotId)||!ID.test(editionId)||!editionId.startsWith('cloud-'))
  bad(404,'newspaper_pdf_not_found');
 const stage=await db.collection('migrationNewspaperRuntimeStage').doc(snapshotId).get();
 if(!stage.exists||stage.data()?.status!=='complete'||stage.data()?.private!==true)
  bad(503,'newspaper_pdf_stage_pending');
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 const item=await runtime.collection('publishedNewspapers').doc(editionId).get();
 const e=item.data();
 if(!item.exists||e?.id!==editionId||e.sourceSnapshotId!==snapshotId||
    e.source!=='firebase-cloud'||!['published','archived'].includes(e.state)||
    e.cancelledAt!=null||(await deletedNewspaperIds(db,snapshotId)).has(editionId))
  bad(404,'newspaper_pdf_not_found');
 const path=e.pdfPath;
 let file:any,expectedSize:number|null=null,expectedHash:string|null=null;
 if(typeof path!=='string')bad(404,'newspaper_pdf_not_found');
 if(typeof e.sourceHistoricId==='string'){
  const source=await db.collection('migrationNewspaperRuntimeStage')
   .doc(snapshotId).collection('editions').doc(e.sourceHistoricId).get();
  const original=source.data();
  if(!source.exists||original?.id!==e.sourceHistoricId||
     original.pdfPath!==path||!LEGACY.test(path)||
     path.includes('..')||path.includes('//'))
   bad(404,'newspaper_pdf_not_found');
  file=bucket.file('migration-staging/campaign-newspapers/'+path);
  const [found]=await file.exists();
  if(!found)file=bucket.file('campaign-newspapers/'+path);
 }else{
  if(!new RegExp('^newspaper-media/'+snapshotId+
    '/editionPdf/[0-9a-f-]{36}\\.pdf$').test(path))
   bad(404,'newspaper_pdf_not_found');
  const doc=await runtime.collection('newspaperMedia').doc(
   createHash('sha256').update('newspaper-media:'+path).digest('hex')).get();
  const v=doc.data();
  if(!doc.exists||v?.state!=='ready'||v.path!==path||
     v.kind!=='editionPdf'||v.sourceSnapshotId!==snapshotId||
     v.editionId!==editionId||v.contentType!=='application/pdf')
   bad(404,'newspaper_pdf_not_found');
  expectedSize=v.bytes;expectedHash=v.sha256;
  file=bucket.file(path);
 }
 const [exists]=await file.exists();if(!exists)bad(404,'newspaper_pdf_not_found');
 const [meta]=await file.getMetadata(),size=Number(meta?.size);
 if(!Number.isSafeInteger(size)||size<5||size>MAX_IMAGE_BYTES||
    expectedSize!==null&&size!==expectedSize)
  bad(404,'newspaper_pdf_not_found');
 const [bytes]=await file.download();
 if(!Buffer.isBuffer(bytes)||bytes.length!==size||
    bytes.subarray(0,5).toString()!=='%PDF-'||
    expectedHash!==null&&createHash('sha256').update(bytes).digest('hex')!==expectedHash)
  bad(503,'newspaper_pdf_integrity');
 return {data:bytes,contentType:'application/pdf'};
}
