/**
 * Public gallery transport backed exclusively by independently reviewed Firebase
 * metadata and a private migrated GCS bucket. No Supabase, no implicit publish.
 * The Admin SDK bypasses Rules: every release gate is checked here.
 */
import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';

const SHA=/^[a-f0-9]{64}$/;
const PATH=/^public-house\/[a-z0-9-]{1,90}\/[A-Za-z0-9_-]{1,130}$/;
const BUCKET=/^cormyr-[a-z0-9-]{1,120}$/;
const MAX_BYTES=20*1024*1024;
const TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);

export class PublicGalleryError extends Error{
  constructor(readonly status:404|503){
    super(status===404?'public_gallery_not_found':'public_gallery_unavailable');
    this.name='PublicGalleryError';
  }
}
const unavailable=():never=>{throw new PublicGalleryError(503);};
const notFound=():never=>{throw new PublicGalleryError(404);};
const record=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);

export function validPublicGalleryPath(path:unknown):path is string{
  return typeof path==='string'&&path.length<=250&&PATH.test(path);
}
export function galleryDocId(path:string):string{
  return createHash('sha256').update(path,'utf8').digest('hex');
}

type GalleryObject={
  getMetadata():Promise<readonly [{size?:string|number;contentType?:string}]>;
  download():Promise<readonly [Uint8Array]>;
};
export type PublicGalleryBucket={file:(path:string)=>GalleryObject};

type Options={
  db:Firestore;
  bucket:PublicGalleryBucket;
  bucketName:string;
  snapshotId:string;
  projectId:string;
  enabled:boolean;
  env?:NodeJS.ProcessEnv;
};
export type PublicGalleryImage={contentType:string;data:Uint8Array};

function validSignature(bytes:Uint8Array,type:string):boolean{
  const b=Buffer.from(bytes);
  if(type==='image/png')return b.length>=8&&
    b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/jpeg')return b.length>=3&&
    b[0]===255&&b[1]===216&&b[2]===255;
  if(type==='image/gif')return b.length>=6&&
    (b.subarray(0,6).toString('ascii')==='GIF87a'||
     b.subarray(0,6).toString('ascii')==='GIF89a');
  if(type==='image/webp')return b.length>=12&&
    b.subarray(0,4).toString('ascii')==='RIFF'&&
    b.subarray(8,12).toString('ascii')==='WEBP';
  return false;
}

/** Read a single pre-approved object, not a listing or an open proxy. */
export async function readApprovedPublicGalleryImage(
  options:Options,path:unknown,
):Promise<PublicGalleryImage>{
  if(!validPublicGalleryPath(path))return notFound();
  const {db,bucket,bucketName,snapshotId,projectId,enabled}=options;
  const env=options.env??process.env;
  if(!enabled||projectId!=='cormyr'||!SHA.test(snapshotId)||
     !BUCKET.test(bucketName)||!db||typeof db.collection!=='function'||
     !bucket||typeof bucket.file!=='function'||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST'])
    return unavailable();

  const runtime=(await db.collection('campaignCloudRuntime').doc(snapshotId).get()).data();
  if(!record(runtime)||runtime['status']!=='active'||runtime['private']!==true||
     runtime['sourceSnapshotId']!==snapshotId||
     runtime['sourceSnapshotReconciled']!==true||
     runtime['applicationEnabled']!==true||
     runtime['publicGalleryApproved']!==true||
     runtime['publicGalleryBucket']!==bucketName||
     !Number.isSafeInteger(runtime['galleryVersion'])||
     typeof runtime['galleryVersion']!=='number'||runtime['galleryVersion']<1||
     runtime['galleryVersion']!==runtime['publishedGalleryVersion'])return unavailable();

  // The reviewed image inventory is independent from the public catalog
  // (whose editorial stage may not yet exist). No historical records leak.
  const stageRef=db.collection('migrationPublicHouseGalleryStage').doc(snapshotId);
  const stage=(await stageRef.get()).data();
  if(!record(stage)||stage['status']!=='complete'||stage['private']!==true||
     stage['sourceSnapshotId']!==snapshotId||
     stage['reviewScope']!=='house-gallery-only'||
     stage['publicReviewApproved']!==true||
     typeof stage['reviewDigest']!=='string'||!SHA.test(stage['reviewDigest'])||
     stage['galleryVersion']!==runtime['galleryVersion'])return unavailable();

  const imageRef=stageRef.collection('gallery').doc(galleryDocId(path));
  const image=(await imageRef.get()).data();
  if(!record(image))return notFound();
  const storagePath='campaign-images/'+path;
  if(image['status']!=='approved'||image['publicReviewed']!==true||
     image['sourceSnapshotId']!==snapshotId||
     image['version']!==runtime['galleryVersion']||
     image['path']!==path||image['bucketName']!==bucketName||
     image['storagePath']!==storagePath||
     typeof image['sha256']!=='string'||!SHA.test(image['sha256'])||
     !Number.isSafeInteger(image['sizeBytes'])||
     typeof image['sizeBytes']!=='number'||
     image['sizeBytes']<1||image['sizeBytes']>MAX_BYTES||
     typeof image['contentType']!=='string'||!TYPES.has(image['contentType']))
    return notFound();

  const file=bucket.file(storagePath);
  const [metadata]=await file.getMetadata();
  const size=metadata?.size;
  const n=typeof size==='string'&&/^\d{1,9}$/.test(size)?
    Number(size):size;
  if(n!==image['sizeBytes']||metadata?.contentType!==image['contentType'])
    return unavailable();
  const [data]=await file.download();
  if(!(Buffer.isBuffer(data)||data instanceof Uint8Array)||
     data.length!==image['sizeBytes']||
     data.length>MAX_BYTES||!validSignature(data,image['contentType']))
    return unavailable();
  const digest=createHash('sha256').update(data).digest('hex');
  if(digest!==image['sha256'])return unavailable();
  return {contentType:image['contentType'],data};
}
