/**
 * One-time, create-only restoration of the publication-approved historical PNG.
 * Executed ONLY by protected main GitHub workflow after byte hash verification.
 * No browser-controlled path, no bucket ACL changes, no Firestore changes.
 */
import {readFileSync} from 'node:fs';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {
 assertOriginalImage,sha256,ORIGINAL_SHA256,selectOriginalIssueOnePath,
} from './restore-newspaper-issue-one-core.mjs';
if(process.env['GITHUB_REPOSITORY']!=='marceloloiro100cm-netizen/cormyr-chronicle-atlas'||
   process.env['GITHUB_REF']!=='refs/heads/main'||
   !/^[a-f0-9]{40}$/.test(process.env['GITHUB_SHA']??''))throw new Error('untrusted_restore_context');
const source=process.argv[2];
if(source!=='.tmp-newspaper-original/image.png')throw new Error('untrusted_source_path');
const bytes=readFileSync(source);
assertOriginalImage(bytes);
const app=initializeApp({projectId:'cormyr',credential:applicationDefault()},'cormyr-issue-one-once');
const db=getFirestore(app);
const roots=await db.collection('campaignWorkspaceImports').limit(7).get();
const snapshots=roots.docs.filter(d=>/^[a-f0-9]{64}$/.test(d.id)&&
 d.data()?.status==='complete'&&d.data()?.private===true&&
 d.data()?.sourceSnapshotId===d.id);
if(roots.size>6||snapshots.length!==1)throw new Error('verified_snapshot_missing_or_ambiguous');
const id=snapshots[0].id;
const stage=await db.collection('migrationNewspaperRuntimeStage').doc(id).get();
if(!stage.exists||stage.data()?.status!=='complete'||stage.data()?.private!==true)
 throw new Error('verified_newspaper_stage_incomplete');
const list=await db.collection('migrationNewspaperRuntimeStage').doc(id).collection('editions').limit(101).get();
if(list.size>100)throw new Error('newspaper_stage_too_large');
const path=selectOriginalIssueOnePath(list.docs.map(d=>d.data()));
const file=getStorage(app).bucket('cormyr.firebasestorage.app').file(path);
const [exists]=await file.exists();
if(exists){
 const [current]=await file.download();
 if(sha256(current)!==ORIGINAL_SHA256)throw new Error('original_object_exists_with_different_checksum');
 console.log('NEWSPAPER_ISSUE_ONE_RESTORED already_valid; create_only=true; metadata_unchanged=true');
}else{
 try{
  await file.save(bytes,{resumable:false,validation:'crc32c',
   metadata:{contentType:'image/png',cacheControl:'private, max-age=0'},
   preconditionOpts:{ifGenerationMatch:0}});
 }catch(e){
  if(![409,412].includes(Number(e?.code)))throw e;
  // Concurrent create: ensure that the winning object has the exact intended bytes.
 }
 const [stored]=await file.download();
 if(sha256(stored)!==ORIGINAL_SHA256)throw new Error('stored_image_checksum_mismatch');
 console.log('NEWSPAPER_ISSUE_ONE_RESTORED verified; create_only=true; modified_editions=0; changed_acl=false');
}
