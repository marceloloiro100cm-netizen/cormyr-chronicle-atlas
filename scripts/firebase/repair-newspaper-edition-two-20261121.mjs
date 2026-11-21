/**
 * One-off, fail-closed Firestore correction approved by the Atlas owner:
 * the edition published on 2026-11-21 (20 Marpenoth 1522) appeared as no. 4
 * and must be displayed as issue no. 2.
 *
 * The imported archive, media, text, publication date, edition IDs, accounts,
 * and monotonic internal sequence are NEVER changed.
 * The protected GitHub environment provides short-lived OIDC credentials.
 */
import {fileURLToPath} from 'node:url';

const EXPECTED_PROJECT='cormyr';
export const EXPECTED_CAMPAIGN_DATE='1522-10-20';
export const EXPECTED_PUBLICATION_DAY='2026-11-21';
const EXPECTED_TITLE='A Folha Sem Selo';
const AUDIT_ID='owner-approved-issue-4-to-2-2026-11-21';
const isPublic=v=>v&&['published','archived'].includes(v.state)&&v.cancelledAt==null;
const localDay=value=>{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'})
  .format(new Date(value));
};
export function verifyRepairCandidate({runtime,stage,cloudRows,stageRows}){
 if(!runtime||runtime.status!=='active'||runtime.private!==true||
    runtime.sourceSnapshotReconciled!==true||runtime.applicationEnabled!==true||
    runtime.newspaperWriteApproved!==true||runtime.newspaperSequenceReconciled!==true||
    !stage||stage.status!=='complete'||stage.private!==true)
  throw Error('newspaper_runtime_not_reconciled');
 if(!Array.isArray(cloudRows)||!Array.isArray(stageRows)||
    cloudRows.length>100||stageRows.length>100)throw Error('newspaper_inventory_ambiguous');
 const publicCloud=cloudRows.filter(isPublic),publicStage=stageRows.filter(isPublic);
 const publicAll=[...publicCloud,...publicStage];
 if(publicAll.length!==2||
    publicAll.filter(e=>e.editionNo===1).length!==1||
    publicAll.filter(e=>e.editionNo===4).length!==1||
    publicAll.some(e=>e.editionNo===2))
  throw Error('published_editions_do_not_match_screenshot');
 const target=publicCloud.filter(e=>e.editionNo===4&&
   e.source==='firebase-cloud'&&
   e.title===EXPECTED_TITLE&&
   e.campaignDate===EXPECTED_CAMPAIGN_DATE&&
   localDay(e.publishedAt)===EXPECTED_PUBLICATION_DAY);
 if(target.length!==1||cloudRows.filter(e=>e.editionNo===4).length!==1)
  throw Error('target_not_unique_or_date_mismatch');
 const previous=publicAll.find(e=>e.editionNo===1);
 if(!previous||previous.title!==EXPECTED_TITLE)
  throw Error('previous_edition_unverified');
 return target[0];
}
export async function repairFirestore(db,{apply=false}={}){
 const rootSnap=await db.collection('campaignCloudRuntime').limit(20).get();
 if(rootSnap.size>=20)throw Error('too_many_runtime_roots');
 const active=rootSnap.docs.filter(d=>d.data()?.status==='active'&&
   d.data()?.private===true&&d.data()?.applicationEnabled===true);
 if(active.length!==1)throw Error('active_runtime_not_unique');
 const runtimeRef=active[0].ref,snapshotId=active[0].id;
 if(!/^[a-f0-9]{64}$/.test(snapshotId))throw Error('invalid_snapshot');
 const stageRef=db.collection('migrationNewspaperRuntimeStage').doc(snapshotId);
 const cloudRef=runtimeRef.collection('publishedNewspapers');
 const auditRef=runtimeRef.collection('newspaperAudits').doc(AUDIT_ID);
 const [stage,cloud,legacy,audit]=await Promise.all([
   stageRef.get(),cloudRef.limit(101).get(),stageRef.collection('editions').limit(101).get(),auditRef.get(),
 ]);
 if(cloud.size>100||legacy.size>100)throw Error('inventory_too_large');
 if(audit.exists){
   const a=audit.data(),record=await cloudRef.doc(a?.editionId??'_missing_').get();
   if(a?.action==='correct_public_edition_number'&&a?.from===4&&a?.to===2&&
      record.exists&&record.data()?.editionNo===2&&record.data()?.publishedAt===a.publishedAt){
      console.log(JSON.stringify({result:'already_corrected',from:4,to:2}));
      return 'already_corrected';
   }
   throw Error('existing_audit_conflict');
 }
 const cloudRows=cloud.docs.map(d=>d.data()),stageRows=legacy.docs.map(d=>d.data());
 const target=verifyRepairCandidate({runtime:active[0].data(),stage:stage.data(),cloudRows,stageRows});
 const targetRef=cloud.docs.find(d=>d.id===target.id)?.ref;
 if(!targetRef||!/^cloud-[a-f0-9]{64}$/.test(target.id))
   throw Error('target_reference_unverified');
 if(!apply){console.log(JSON.stringify({result:'preflight_ok',from:4,to:2}));return 'preflight_ok';}
 await db.runTransaction(async tx=>{
   const [r,s,t,a,occupiedCloud,occupiedLegacy]=await Promise.all([
     tx.get(runtimeRef),tx.get(stageRef),tx.get(targetRef),tx.get(auditRef),
     tx.get(cloudRef.where('editionNo','==',2).limit(3)),
     tx.get(stageRef.collection('editions').where('editionNo','==',2).limit(3)),
   ]);
   if(a.exists)throw Error('concurrent_correction');
   if(occupiedCloud.size!==0||occupiedLegacy.docs.some(d=>isPublic(d.data())))
     throw Error('edition_two_already_published');
   const current=t.data();
   if(!t.exists||current?.id!==target.id||current?.editionNo!==4||
      current?.source!=='firebase-cloud'||current?.sourceSnapshotId!==snapshotId||
      current?.campaignDate!==EXPECTED_CAMPAIGN_DATE||
      localDay(current?.publishedAt)!==EXPECTED_PUBLICATION_DAY||
      current?.publishedAt!==target.publishedAt||
      r.data()?.nextNewspaperEditionNo!==active[0].data().nextNewspaperEditionNo||
      r.data()?.sourceSnapshotId!==snapshotId||
      s.data()?.status!=='complete')
     throw Error('concurrent_or_unexpected_change');
   tx.update(targetRef,{editionNo:2});
   tx.create(auditRef,{
     action:'correct_public_edition_number',editionId:target.id,
     sourceSnapshotId:snapshotId,from:4,to:2,
     publishedAt:target.publishedAt,campaignDate:EXPECTED_CAMPAIGN_DATE,
     approvedBy:'atlas-owner-request-2026-11-21',
     appliedAt:new Date().toISOString(),
   });
 });
 const verified=await targetRef.get();
 if(verified.data()?.editionNo!==2)throw Error('post_commit_verification_failed');
 console.log(JSON.stringify({result:'corrected',from:4,to:2,importedArchiveChanged:false}));
 return 'corrected';
}
async function main(){
 if(process.env.GOOGLE_CLOUD_PROJECT!==EXPECTED_PROJECT||
    process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||
    process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==EXPECTED_PROJECT)
   throw Error('production_project_guard');
 const apply=process.argv.includes('--apply');
 if(apply&&process.env.CORMYR_NEWSPAPER_NUMBER_CORRECTION_ACK!=='REN_NUMBER_4_TO_2_20261121')
   throw Error('explicit_correction_ack_required');
 const [{initializeApp,applicationDefault},{getFirestore}]=await Promise.all([
   import('firebase-admin/app'),import('firebase-admin/firestore'),
 ]);
 const app=initializeApp({projectId:EXPECTED_PROJECT,credential:applicationDefault()},'newspaper-number-repair-20261121');
 await repairFirestore(getFirestore(app),{apply});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 main().catch(error=>{console.error('Number repair blocked:',error?.message??'unknown');process.exitCode=1;});
}
