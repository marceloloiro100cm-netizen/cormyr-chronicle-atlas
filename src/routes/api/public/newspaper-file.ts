import {createFileRoute} from '@tanstack/react-router';
import {getFirebaseAdminServices} from '@/lib/firebase/admin.server';
import {readPublishedNewspaperPdf,NewspaperImageError}
 from '@/lib/newspaper/firebase-published-image.server';
const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};
const fail=(status:number)=>new Response('PDF do jornal indisponível',{
 status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'},
});
export async function getPublishedPdf(request:Request):Promise<Response>{
 const url=new URL(request.url),q=url.searchParams,id=q.get('edition');
 if(!id||q.getAll('edition').length!==1||[...q.keys()].some(x=>x!=='edition')||
    !/^cloud-[a-f0-9]{64}$/.test(id))return fail(404);
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||
    process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST']||
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'])return fail(503);
 try{
  const {db:adminDb,storage:adminStorage}=await getFirebaseAdminServices();
  const result=await readPublishedNewspaperPdf({
   db:adminDb,bucket:adminStorage.bucket('cormyr.firebasestorage.app'),
   snapshotId,editionId:id,
  });
  return new Response(new Uint8Array(result.data),{status:200,headers:{
   ...headers,'Content-Type':result.contentType,'Content-Disposition':'inline',
   'Content-Length':String(result.data.length),
  }});
 }catch(e){return fail(e instanceof NewspaperImageError?e.status:503);}
}
export const Route=createFileRoute('/api/public/newspaper-file')({
 server:{handlers:{GET:async({request})=>getPublishedPdf(request)}},
});
