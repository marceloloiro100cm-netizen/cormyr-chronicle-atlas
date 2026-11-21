/** Read-only publication gate probe; reports booleans, no snapshot IDs, image paths or private records. */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const app=initializeApp({credential:applicationDefault(),projectId:'cormyr'},'cormyr-house-gallery-readonly');
const db=getFirestore(app);
const list=await db.collection('campaignWorkspaceImports').limit(8).get();
const candidates=list.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&
  d.data()?.status==='complete'&&d.data()?.private===true&&d.data()?.sourceSnapshotId===d.id);
console.log('HOUSE_GALLERY_GATE unique_completed_snapshot '+(candidates.length===1?'YES':'NO'));
if(candidates.length!==1)process.exit(1);
const snap=candidates[0].id;
const [runtime,stage]=await Promise.all([
  db.collection('campaignCloudRuntime').doc(snap).get(),
  db.collection('migrationPublicContentStage').doc(snap).get(),
]);
const r=runtime.data()??{},s=stage.data()??{};
const truth=[
 ['runtime_active',r.status==='active'],
 ['runtime_private',r.private===true],
 ['runtime_snapshot_matches',r.sourceSnapshotId===snap],
 ['source_reconciled',r.sourceSnapshotReconciled===true],
 ['application_enabled',r.applicationEnabled===true],
 ['stage_complete',s.status==='complete'],
 ['stage_private',s.private===true],
 ['stage_snapshot_matches',s.sourceSnapshotId===snap],
 ['gallery_bucket_unset_or_matches',!r.publicGalleryBucket||
  r.publicGalleryBucket==='cormyr-migration-homolog-477785088395'],
 ['gallery_existing_approved',r.publicGalleryApproved===true],
 ['gallery_existing_version_current',Number.isSafeInteger(r.galleryVersion)&&
  r.galleryVersion>0&&r.galleryVersion===r.publishedGalleryVersion],
];
for(const [name,ok] of truth)console.log('HOUSE_GALLERY_GATE '+name+' '+(ok?'YES':'NO'));
const requiredRuntime=new Set(['runtime_active','runtime_private','runtime_snapshot_matches','source_reconciled','application_enabled','gallery_bucket_unset_or_matches']);
const success=truth.filter(([name,ok])=>requiredRuntime.has(name)&&!ok);
console.log('HOUSE_GALLERY_GATE publish_prerequisites '+(success.length===0?'READY':'BLOCKED'));


/** Independently validate the actual House gallery publication stage. */
const imageStageRef=db.collection('migrationPublicHouseGalleryStage').doc(snap);
const imageStageDoc=await imageStageRef.get();
const imageStage=imageStageDoc.data()??{};
const galleryChecks=[
 ['gallery_public_approval',r.publicGalleryApproved===true],
 ['gallery_bucket_matches',r.publicGalleryBucket==='cormyr-migration-homolog-477785088395'],
 ['gallery_version_published',Number.isSafeInteger(r.galleryVersion)&&r.galleryVersion>0&&r.galleryVersion===r.publishedGalleryVersion],
 ['gallery_stage_complete',imageStage.status==='complete'],
 ['gallery_stage_private',imageStage.private===true],
 ['gallery_stage_snapshot_matches',imageStage.sourceSnapshotId===snap],
 ['gallery_stage_scope',imageStage.reviewScope==='house-gallery-only'],
 ['gallery_stage_approved',imageStage.publicReviewApproved===true],
 ['gallery_stage_digest',typeof imageStage.reviewDigest==='string'&&/^[a-f0-9]{64}$/.test(imageStage.reviewDigest)],
 ['gallery_stage_version_matches',imageStage.galleryVersion===r.galleryVersion],
];
const sampleHouses=['phelles','evenhand','goldfin','blester','axehand','silversword'];
const samples=await Promise.all(sampleHouses.map(house=>
  imageStageRef.collection('houseGalleries').doc(house).get()));
for(let i=0;i<sampleHouses.length;i++){
 const doc=samples[i].data()??{},house=sampleHouses[i];
 galleryChecks.push(['gallery_house_'+house,doc.status==='approved'&&
  doc.publicReviewed===true&&doc.sourceSnapshotId===snap&&
  doc.version===r.galleryVersion&&doc.houseId===house&&
  Array.isArray(doc.images)&&doc.images.length>0&&doc.images.length<=250]);
}
const [houseTotal,imageTotal]=await Promise.all([
 imageStageRef.collection('houseGalleries').count().get(),
 imageStageRef.collection('gallery').count().get(),
]);
const houseCount=houseTotal.data().count,imageCount=imageTotal.data().count;
console.log('HOUSE_GALLERY_INVENTORY houses='+houseCount+' images='+imageCount);
galleryChecks.push(['gallery_expected_inventory',houseCount===172&&imageCount===766]);
for(const [name,ok] of galleryChecks)
 console.log('HOUSE_GALLERY_GATE '+name+' '+(ok?'YES':'NO'));
const deliveryReady=galleryChecks.every(([,ok])=>ok)&&success.length===0;
console.log('HOUSE_GALLERY_GATE firestore_delivery '+(deliveryReady?'READY':'BLOCKED'));
if(!deliveryReady)process.exitCode=2;
