import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {publicContentFirestore} from '@/lib/public/firebase-public-content-admin.server';
import {
  PublicGalleryError,readApprovedPublicGalleryImage,validPublicGalleryPath,
  type PublicGalleryBucket,
} from '@/lib/public/firebase-public-gallery.server';

const HEADERS={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
};
const fail=(status:404|503)=>new Response(
  status===404?'Imagem indisponível':'Galeria temporariamente indisponível',
  {status,headers:{...HEADERS,'Content-Type':'text/plain; charset=utf-8'}},
);

/**
 * Public only after per-image review, exact snapshot/version approval and
 * byte-level SHA-256 verification against a separately migrated private bucket.
 * No legacy Supabase RPC, credentials, redirect or fallback.
 */
export async function getFirebasePublicGalleryImage(request:Request):Promise<Response>{
  const u=new URL(request.url);
  const q=u.searchParams;
  if(u.search.length>800||q.getAll('path').length!==1||
     [...q.keys()].some(key=>!['path','download','name'].includes(key))||
     q.getAll('download').length>1||q.getAll('name').length>1||
     (!q.has('download')&&q.has('name')))
    return fail(404);
  const path=q.get('path');
  if(!validPublicGalleryPath(path))return fail(404);

  const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
  const bucketName=process.env['CORMYR_FIREBASE_PUBLIC_GALLERY_BUCKET']??'';
  if(process.env['CORMYR_FIREBASE_PUBLIC_GALLERY_ENABLED']!=='true'||
     !/^[a-f0-9]{64}$/.test(snapshotId)||
     !/^cormyr-[a-z0-9-]{1,120}$/.test(bucketName)||
     process.env['FIRESTORE_EMULATOR_HOST']||
     process.env['FIREBASE_AUTH_EMULATOR_HOST'])
    return fail(503);

  try{
    const {storage:adminStorage}=await getFirebaseAdminServices();
    const result=await readApprovedPublicGalleryImage({
      db:await publicContentFirestore(),
      bucket:adminStorage.bucket(bucketName) as unknown as PublicGalleryBucket,
      enabled:true,projectId:'cormyr',snapshotId,bucketName,
    },path);
    const headers:Record<string,string>={
      ...HEADERS,'Content-Type':result.contentType,
      'Content-Length':String(result.data.length),
    };
    if(q.has('download')){
      const requested=q.get('name')??'';
      const filename=/^[A-Za-z0-9 _.-]{1,100}$/.test(requested)?
        requested:'imagem';
      headers['Content-Disposition']=
        "attachment; filename*=UTF-8''"+encodeURIComponent(filename);
    }
    return new Response(new Uint8Array(result.data),{status:200,headers});
  }catch(e){
    if(e instanceof PublicGalleryError)return fail(e.status);
    // No disclosure of object names, storage permissions or source metadata.
    return fail(503);
  }
}
export const Route=createFileRoute('/api/public/gallery-image')({
  server:{handlers:{GET:async({request})=>getFirebasePublicGalleryImage(request)}},
});
