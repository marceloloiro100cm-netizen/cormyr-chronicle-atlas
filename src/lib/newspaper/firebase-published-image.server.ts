import {deletedNewspaperIds} from '../../../scripts/firebase/newspaper-deleted.mjs';
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
 const record=await stage.collection('editions').doc(editionId).get();
 const e=record.exists?record.data():null;
 if(!e||e.id!==editionId||e.cancelledAt!=null||
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
 const path='migration-staging/campaign-newspapers/'+block.imagePath;
 const file=bucket.file(path);
 const [exists]=await file.exists();
 if(!exists)bad(404,'newspaper_image_not_found');
 const [meta]=await file.getMetadata();
 const size=Number(meta?.size);
 if(!Number.isSafeInteger(size)||size<1||size>MAX_IMAGE_BYTES)
  bad(404,'newspaper_image_not_found');
 const [bytes]=await file.download();
 if(!Buffer.isBuffer(bytes)||bytes.length!==size)
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
