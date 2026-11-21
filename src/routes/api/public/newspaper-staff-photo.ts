import {createFileRoute} from '@tanstack/react-router';
import {PublicStaffPhotoError,readPublicStaffPhoto}
 from '@/lib/newspaper/firebase-public-staff-photo.server';

const headers={'Cache-Control':'private, max-age=0, no-store','X-Content-Type-Options':'nosniff'};
const unavailable=(status:number)=>new Response('Fotografia indisponível',{status,headers:{
 ...headers,'Content-Type':'text/plain; charset=utf-8',
}});
export async function getPublicStaffPhoto(request:Request):Promise<Response>{
 const url=new URL(request.url),q=url.searchParams;
 const staffId=q.get('staff');
 if(url.search.length>300||q.getAll('staff').length!==1||[...q.keys()].some(k=>k!=='staff')||
    !staffId||!/^[A-Za-z0-9_-]{1,128}$/.test(staffId))return unavailable(404);
 const snapshotId=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 if(process.env['CORMYR_FIREBASE_PUBLIC_NEWSPAPER_ENABLED']!=='true'||
    !/^[a-f0-9]{64}$/.test(snapshotId)||process.env['FIRESTORE_EMULATOR_HOST']||
    process.env['FIREBASE_AUTH_EMULATOR_HOST']||
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'])return unavailable(503);
 try{
  const [{initializeApp,getApps,applicationDefault},{getFirestore},{getStorage}]=await Promise.all([
   import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/storage'),
  ]);
  const name='cormyr-public-newspaper-staff-photo';
  const app=getApps().find(item=>item.name===name)??initializeApp({
   projectId:'cormyr',credential:applicationDefault(),
  },name);
  const image=await readPublicStaffPhoto({
   db:getFirestore(app),bucket:getStorage(app).bucket('cormyr.firebasestorage.app'),
   snapshotId,staffId,
  });
  return new Response(new Uint8Array(image.data),{status:200,headers:{
   ...headers,'Content-Type':image.contentType,'Content-Length':String(image.data.length),
  }});
 }catch(error){return unavailable(error instanceof PublicStaffPhotoError?error.status:503);}
}
export const Route=createFileRoute('/api/public/newspaper-staff-photo')({
 server:{handlers:{GET:async({request})=>getPublicStaffPhoto(request)}},
});
