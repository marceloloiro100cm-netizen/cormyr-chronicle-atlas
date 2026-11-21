import {createHash} from 'node:crypto';
export const ORIGINAL_SHA256='84fcfd2ce77a34aae2d1b14f58f10053fe732764d6ef56cc8629277e1058b83f';
export const ORIGINAL_BASENAME='f85ca6d0-3fb7-4f94-be4a-adc075296199.png';
export const ORIGINAL_BYTES=3237233;
export const STORAGE_PREFIX='migration-staging/campaign-newspapers/';
const SAFE_PATH=/^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,299}$/;
export const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex');
export function assertOriginalImage(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length!==ORIGINAL_BYTES||
   !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||
   sha256(bytes)!==ORIGINAL_SHA256)throw new Error('original_media_checksum_mismatch');
 return true;
}
/** Exact registered image, not a caller-supplied object key. */
export function selectOriginalIssueOnePath(editions){
 const published=editions.filter(e=>e?.editionNo===1&&
   ['published','archived'].includes(e.state)&&!e.cancelledAt&&
   typeof e.publishedAt==='string'&&Array.isArray(e.blocks));
 if(published.length!==1)throw new Error('issue_one_not_unique_and_published');
 const images=published[0].blocks.filter(b=>(b?.type??b?.kind)==='image'&&typeof b.imagePath==='string');
 if(images.length!==1)throw new Error('issue_one_image_not_unique');
 const path=images[0].imagePath;
 if(!SAFE_PATH.test(path)||path.includes('//')||path.includes('..')||
   path.split('/').at(-1)!==ORIGINAL_BASENAME)throw new Error('issue_one_path_mismatch');
 return STORAGE_PREFIX+path;
}
