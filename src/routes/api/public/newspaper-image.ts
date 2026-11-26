import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {readPublishedNewspaperImage,NewspaperImageError}
 from '@/lib/newspaper/firebase-published-image.server';

const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const fail=(status:number)=>new Response('Imagem do jornal indisponível',{
 status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'},
});
/** Exactly one published edition, exactly one image block; no arbitrary path or bucket. */
export async function getPublishedImage(request:Request):Promise<Response>{
 const url=new URL(request.url),q=url.searchParams;
 const edition=q.get('edition'),index=q.get('index');
 if(url.search.length>400||q.getAll('edition').length!==1||
    q.getAll('index').length!==1||
    [...q.keys()].some(x=>x!=='edition'&&x!=='index')||
    !edition||!index||!/^(0|[1-7]?[0-9])$/.test(index))
  return fail(404);
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST']||
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'])return fail(503);
 try{
  const {db:adminDb,storage:adminStorage}=await getFirebaseAdminServices();
  const result=await readPublishedNewspaperImage({
   db:adminDb,bucket:adminStorage.bucket('cormyr.firebasestorage.app'),
   snapshotId,editionId:edition,index:Number(index),
  });
  return new Response(new Uint8Array(result.data),{status:200,headers:{
   ...headers,'Content-Type':result.contentType,
   'Content-Length':String(result.data.length),
  }});
 }catch(e){
  return fail(e instanceof NewspaperImageError?e.status:503);
 }
}
export const Route=createFileRoute('/api/public/newspaper-image')({
 server:{handlers:{GET:async({request})=>getPublishedImage(request)}},
});
