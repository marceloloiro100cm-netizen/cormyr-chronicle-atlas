import {createFileRoute} from '@tanstack/react-router';
import {publicContentFirestore} from '@/lib/public/firebase-public-content-admin.server';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const fail=(status:404|503)=>Response.json({error:'Galeria indisponível'},{status,headers});
export async function readHouseDriveGallery(request:Request):Promise<Response>{
 const u=new URL(request.url),q=u.searchParams,house=q.get('house');
 if(u.search.length>180||q.getAll('house').length!==1||[...q.keys()].some(k=>k!=='house')||
    !house||!/^[a-z0-9-]{1,80}$/.test(house))return fail(404);
 const snap=process.env['CORMYR_FIREBASE_SNAPSHOT_ID']??'';
 const bucket=process.env['CORMYR_FIREBASE_PUBLIC_GALLERY_BUCKET']??'';
 if(process.env['CORMYR_FIREBASE_PUBLIC_GALLERY_ENABLED']!=='true'||!/^[a-f0-9]{64}$/.test(snap)||
    !/^cormyr-[a-z0-9-]+$/.test(bucket)||process.env['FIRESTORE_EMULATOR_HOST'])return fail(503);
 try{
  const db=await publicContentFirestore(),root=db.collection('campaignCloudRuntime').doc(snap),
   stage=db.collection('migrationPublicContentStage').doc(snap);
  const [a,b]=await Promise.all([root.get(),stage.get()]);
  const r=a.data()??{},s=b.data()??{};
  if(r.status!=='active'||r.private!==true||r.sourceSnapshotId!==snap||
     r.sourceSnapshotReconciled!==true||r.applicationEnabled!==true||
     r.publicGalleryApproved!==true||r.publicGalleryBucket!==bucket||
     !Number.isSafeInteger(r.galleryVersion)||r.galleryVersion<1||
     r.galleryVersion!==r.publishedGalleryVersion||
     s.status!=='complete'||s.private!==true||s.sourceSnapshotId!==snap)return fail(503);
  const d=(await stage.collection('houseGalleries').doc(house).get()).data();
  if(!d||d.status!=='approved'||d.publicReviewed!==true||d.sourceSnapshotId!==snap||
     d.version!==r.galleryVersion||d.houseId!==house||
     !Array.isArray(d.images)||d.images.length>250)return fail(404);
  const images=[],seen=new Set<string>();
  for(const item of d.images){
   if(!item||typeof item.path!=='string'||!/^public-house\/[a-z0-9-]{1,80}\/[a-f0-9]{48}$/.test(item.path)||
      !item.path.startsWith('public-house/'+house+'/')||seen.has(item.path)||
      typeof item.name!=='string'||!item.name||item.name.length>200||
      /[\u0000-\u001f\u007f]/.test(item.name))return fail(503);
   seen.add(item.path);images.push({path:item.path,name:item.name});
  }
  return Response.json({houseId:house,images},{headers});
 }catch{return fail(503);}
}
export const Route=createFileRoute('/api/public/house-gallery')({
 server:{handlers:{GET:async({request})=>readHouseDriveGallery(request)}},
});
