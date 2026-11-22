/**
 * Read-only diagnosis of historical image references. Prints aggregate facts,
 * never source paths, image bytes, UIDs or newspaper content.
 */
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHash} from 'node:crypto';
import {readWorkspaceTable} from './workspace-import.mjs';
import {extractImagePaths} from './storage-references-core.mjs';
const app=initializeApp({projectId:'cormyr',credential:applicationDefault()},'cormyr-media-readonly-audit');
const db=getFirestore(app);
const root=await db.collection('campaignWorkspaceImports').limit(7).get();
const snapshots=root.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&
 d.data()?.status==='complete'&&d.data()?.private===true&&
 d.data()?.sourceSnapshotId===d.id);
if(snapshots.length!==1||root.size>6){console.log('MEDIA_DIAG snapshot_unavailable');process.exit(1);}
const snapshot=snapshots[0].id;
const runtime=await db.collection('campaignCloudRuntime').doc(snapshot).get();
const flags=runtime.data()??{};
const newspaperStage=await db.collection('migrationNewspaperRuntimeStage').doc(snapshot).get();
const stageFlags=newspaperStage.data()??{};
const newspaperMediaReady=newspaperStage.exists&&
 stageFlags.status==='complete'&&stageFlags.private===true&&
 runtime.exists&&flags.status==='active'&&flags.private===true&&
 flags.sourceSnapshotId===snapshot&&flags.sourceSnapshotReconciled===true&&
 flags.applicationEnabled===true&&flags.newspaperWriteApproved===true;
console.log('MEDIA_DIAG newspaper_media_runtime_ready '+(newspaperMediaReady?'YES':'NO'));
console.log('MEDIA_DIAG newspaper_stage_complete '+
 (newspaperStage.exists&&stageFlags.status==='complete'&&stageFlags.private===true?'YES':'NO'));
console.log('MEDIA_DIAG newspaper_runtime_active '+
 (runtime.exists&&flags.status==='active'&&flags.private===true&&
 flags.sourceSnapshotId===snapshot&&flags.sourceSnapshotReconciled===true&&
 flags.applicationEnabled===true?'YES':'NO'));
for(const key of ['privateMediaReadApproved','publicGalleryApproved','publicGalleryBucket',
                  'newspaperWriteApproved']){
 const enabled=typeof flags[key]==='boolean'?flags[key]===true?'YES':'NO':
               typeof flags[key]==='string'?flags[key]?'CONFIGURED':'MISSING':'MISSING';
 console.log('MEDIA_DIAG flag_'+key+' '+enabled);
}
const stage=await db.collection('migrationStorageStage').doc(snapshot).get();
console.log('MEDIA_DIAG storage_stage_exists '+(stage.exists?'YES':'NO'));
const stageData=stage.data()??{};
console.log('MEDIA_DIAG storage_stage_status '+(
 ['complete','pending','staged','active','ready'].includes(stageData.status)
  ?stageData.status.toUpperCase():'OTHER'));
console.log('MEDIA_DIAG storage_stage_private '+(stageData.private===true?'YES':'NO'));
console.log('MEDIA_DIAG storage_stage_snapshot_match '+(stageData.sourceSnapshotId===snapshot?'YES':'NO'));
console.log('MEDIA_DIAG storage_stage_source_present '+
 (Object.hasOwn(stageData,'sourceSnapshotId')?'YES':'NO'));
console.log('MEDIA_DIAG storage_stage_format_v1 '+(stageData.formatVersion===1?'YES':'NO'));
console.log('MEDIA_DIAG storage_stage_legacy_v1_eligible '+
 (stage.exists&&stageData.status==='complete'&&stageData.private===true&&
  stageData.sourceSnapshotId===undefined&&stageData.formatVersion===1?'YES':'NO'));
console.log('MEDIA_DIAG storage_stage_complete '+
  (stage.exists&&stage.data()?.status==='complete'&&stage.data()?.private===true&&
   stage.data()?.sourceSnapshotId===snapshot?'YES':'NO'));
const editions=await db.collection('migrationNewspaperRuntimeStage').doc(snapshot).collection('editions').limit(101).get();
const first=editions.docs.map(d=>d.data()).filter(v=>v?.editionNo===1);
console.log('MEDIA_DIAG issue_one_count '+first.length);
const blocks=first.length===1&&Array.isArray(first[0].blocks)?first[0].blocks:[];
const imageBlocks=blocks.filter(b=>b?.type==='image'||b?.kind==='image');
const withPath=imageBlocks.filter(b=>typeof b.imagePath==='string'&&b.imagePath.length>0);
const withSrc=imageBlocks.filter(b=>typeof b.imageSrc==='string'&&b.imageSrc.length>0);
console.log('MEDIA_DIAG issue_one_image_blocks '+imageBlocks.length+
 ' legacy_paths='+withPath.length+' static_sources='+withSrc.length);
const records=await readWorkspaceTable(db,snapshot,'campaign_records');
const refs=[...new Set(records.flatMap(r=>extractImagePaths(r.content??'')))];
console.log('MEDIA_DIAG gallery_imported_record_refs '+refs.length);
const legacyBucket=getStorage(app).bucket('cormyr.firebasestorage.app');
const otherBucket=getStorage(app).bucket('cormyr-migration-homolog-477785088395');
async function probe(bucket,path){
 try{const [yes]=await bucket.file(path).exists();return yes?'EXISTS':'MISSING';}
 catch(e){
  const code=String(e?.code??'');
  return code==='403'||code==='7'?'NO_PERMISSION':'UNKNOWN';
 }
}
async function sample(prefix,paths,bucket,max=12){
 const selected=paths.slice(0,max),counts={EXISTS:0,MISSING:0,NO_PERMISSION:0,UNKNOWN:0};
 for(const p of selected){counts[await probe(bucket,prefix+p)]++;}
 return `sampled=${selected.length} existing=${counts.EXISTS} missing=${counts.MISSING} permission_denied=${counts.NO_PERMISSION} unknown=${counts.UNKNOWN}`;
}
const imagePaths=withPath.map(b=>b.imagePath);
const candidatePrefixes=['migration-staging/campaign-newspapers/','campaign-newspapers/'];
for(const prefix of candidatePrefixes){
 console.log('MEDIA_DIAG issue_one_storage_'+(prefix.startsWith('migration')?'staging':'normal')+' '+
   await sample(prefix,imagePaths,legacyBucket,8));
}
console.log('MEDIA_DIAG gallery_source_storage '+
 await sample('migration-staging/campaign-images/',refs,legacyBucket));
console.log('MEDIA_DIAG gallery_homolog_storage '+
 await sample('campaign-images/',refs,otherBucket));
for(let i=0;i<Math.min(5,imagePaths.length);i++){
 const name=imagePaths[i].split('/').pop();
 console.log('MEDIA_DIAG issue_one_path_basename_sha256_16 '+
   createHash('sha256').update(name).digest('hex').slice(0,16));
}
