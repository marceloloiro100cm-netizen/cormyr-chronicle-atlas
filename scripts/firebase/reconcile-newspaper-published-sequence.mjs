/**
 * One-off, audited Firestore counter reconciliation for A Folha Sem Selo.
 * DEFAULT IS READ ONLY. Never changes editions, revisions, images, receipts,
 * tombstones, or publication state. Fails closed unless the ONLY issued
 * historical numbers are 1 and 2 and no Cloud issue was published.
 *
 * Run:
 *   CORMYR_FIREBASE_SNAPSHOT_ID=<verified snapshot hash> node scripts/firebase/reconcile-newspaper-published-sequence.mjs
 * Apply (only after external backup and review):
 *   CORMYR_NEWSPAPER_SEQUENCE_REPAIR_APPROVED=true CORMYR_FIREBASE_SNAPSHOT_ID=<verified hash> node scripts/firebase/reconcile-newspaper-published-sequence.mjs --apply
 */
import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const ID=/^[a-f0-9]{64}$/;
const snapshot=process.env.CORMYR_FIREBASE_SNAPSHOT_ID??'';
const apply=process.argv.includes('--apply');
if(!ID.test(snapshot)||process.argv.some(a=>a.startsWith('--')&&!['--apply','--dry-run'].includes(a)))
 throw Error('invalid_repair_request');
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)
 throw Error('production_only_reconciliation');
if(apply&&process.env.CORMYR_NEWSPAPER_SEQUENCE_REPAIR_APPROVED!=='true')
 throw Error('explicit_repair_approval_required');

const app=getApps().find(a=>a.name==='cormyr-newspaper-sequence-reconciliation')??
 initializeApp({credential:applicationDefault(),projectId:'cormyr'},'cormyr-newspaper-sequence-reconciliation');
const db=getFirestore(app);
const runtime=db.collection('campaignCloudRuntime').doc(snapshot);
const stageRoot=db.collection('migrationNewspaperRuntimeStage').doc(snapshot);
const stageIssues=stageRoot.collection('editions');
const cloudIssues=runtime.collection('publishedNewspapers');
const audit=runtime.collection('newspaperAudits').doc('sequence-reconciliation-2026-11-22');
const issued=v=>typeof v?.publishedAt==='string'||['published','archived'].includes(v?.state);
const valid=v=>v&&Number.isSafeInteger(v.editionNo)&&v.editionNo>0&&
 typeof v.id==='string'&&v.id.length>0;

const outcome=await db.runTransaction(async tx=>{
 const [root,stage,imported,cloud,prior]=await Promise.all([
  tx.get(runtime),tx.get(stageRoot),tx.get(stageIssues.limit(501)),
  tx.get(cloudIssues.limit(501)),tx.get(audit),
 ]);
 const config=root.data(),source=stage.data();
 if(!root.exists||config?.status!=='active'||config.private!==true||
    config.sourceSnapshotId!==snapshot||config.newspaperWriteApproved!==true||
    !stage.exists||source?.status!=='complete'||source.private!==true||
    imported.docs.length>=501||cloud.docs.length>=501)
   throw Error('unverified_archive_or_runtime');
 const importedRows=imported.docs.map(d=>d.data());
 const cloudRows=cloud.docs.map(d=>d.data());
 if(importedRows.some(v=>!valid(v))||cloudRows.some(v=>!valid(v)||
    v.source!=='firebase-cloud'||v.sourceSnapshotId!==snapshot))
   throw Error('unexpected_edition_integrity');
 const published=importedRows.filter(issued).map(v=>v.editionNo).sort((a,b)=>a-b);
 const cloudPublished=cloudRows.filter(issued);
 if(published.length!==2||published[0]!==1||published[1]!==2||
    cloudPublished.length!==0||config.newspaperImportedMaxEditionNo!==2||
    !Number.isSafeInteger(config.nextNewspaperEditionNo)||
    config.nextNewspaperEditionNo<3)
   throw Error('published_sequence_differs_from_approved_1_2');
 if(prior.exists){
  const last=prior.data();
  if(last?.newCounter!==3||config.nextNewspaperEditionNo!==3)
   throw Error('prior_repair_conflict');
  return {status:'already_reconciled',previousCounter:3,newCounter:3,issuedCount:2};
 }
 const before=config.nextNewspaperEditionNo;
 if(apply&&before!==3){
  const now=new Date().toISOString();
  tx.create(audit,{action:'reconcile_newspaper_sequence',sourceSnapshotId:snapshot,
   previousCounter:before,newCounter:3,issuedNumbers:[1,2],
   importedCount:importedRows.length,cloudDraftCount:cloudRows.length,
   occurredAt:now,reason:'deleted drafts do not reserve official edition numbers'});
  tx.update(runtime,{nextNewspaperEditionNo:3});
 }
 return {status:apply?'applied_or_unchanged':'dry_run',previousCounter:before,
  newCounter:3,issuedCount:2,cloudDraftCount:cloudRows.length};
});
console.log(JSON.stringify(outcome));
