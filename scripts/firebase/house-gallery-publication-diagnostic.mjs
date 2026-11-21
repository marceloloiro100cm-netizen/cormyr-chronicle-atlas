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
const success=truth.filter(([name,ok])=>name!=='gallery_existing_approved'&&name!=='gallery_existing_version_current'&&!ok);
console.log('HOUSE_GALLERY_GATE publish_prerequisites '+(success.length===0?'READY':'BLOCKED'));
