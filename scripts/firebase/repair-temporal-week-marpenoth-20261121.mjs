/**
 * Owner-approved one-off Firestore correction, 21 Marpenoth 1522:
 * undo the accidental operational week 3 -> 4 while retaining the intended
 * Harptos date (third desdia). Fails closed if dependent activity exists.
 *
 * This script never edits the immutable import, letters, editions, character
 * sheets, mission records, or House economy. Affected event publications are
 * restored exactly from the week-opening audit, not deleted.
 */
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';
import {publishEvent} from './cloud-schedule-events-core.mjs';

const PROJECT='cormyr';
const TARGET=Object.freeze({year:1522,month:9,day:21,festival:null});
const REPAIR_ID='owner-repair-week-4-to-3-marpenoth-1522-20261121';
const ACK='OWNER_FIX_21_MARPENOTH_WEEK_3_20261121';
const HASH=/^[a-f0-9]{64}$/;
const EVENT_ID=/^[A-Za-z0-9_-]{8,128}$/;
function requireState(ok,reason){
  if(!ok)throw Error(reason);
}
function sameDate(a,b){
  return a?.year===b?.year&&a?.month===b?.month&&a?.day===b?.day&&
    (a?.festival??null)===(b?.festival??null);
}

/** Pure fail-closed precondition for both the dry-run and the real transaction. */
export function verifyWeekCorrection({live,mail,archive,last,snapshotId}){
  requireState(HASH.test(snapshotId??''),'snapshot_id_invalid');
  requireState(live?.status==='active'&&live.private===true&&
    live.sourceSnapshotId===snapshotId&&live.calendarSource==='operational'&&
    live.sourceAuthority==='owner_adopted_firebase'&&
    live.sourceSnapshotReconciled===true&&live.applicationEnabled===true&&
    live.publicTimeApproved===true,'runtime_not_approved');
  requireState(live.openRound===4&&sameDate(live.calendar,TARGET)&&
    Number.isSafeInteger(live.calendarVersion)&&live.calendarVersion>=1&&
    live.calendar?.version===live.calendarVersion&&
    live.publishedTimeVersion===live.calendarVersion,'runtime_not_week_four_on_target');
  requireState(effectiveCloudCalendar(archive,live,snapshotId)?.version===live.calendarVersion&&
    cloudMailRuntimeApproved(live,mail,archive,snapshotId),'mail_clock_misaligned');
  requireState(typeof live.lastAdvanceAuditId==='string'&&
    live.lastAdvanceAuditId.length>=8,'last_advance_not_identified');
  requireState(last?.action==='advance_week'&&last.fromRound===3&&last.toRound===4&&
    last.to?.version===live.calendarVersion&&sameDate(last.to,TARGET)&&
    last.from?.year===1522&&last.from?.month===9&&
    Number.isInteger(last.from?.day)&&last.from.day>=11&&last.from.day<=20&&
    !last.from.festival&&last.monthsCrossed===0&&
    last.flashback!==true&&typeof last.undoneAt!=='string'&&
    typeof last.at==='string'&&Number.isFinite(Date.parse(last.at))&&
    Array.isArray(last.eventsBefore),'last_opening_not_safe_to_undo');
  const before=last.eventsBefore;
  requireState(before.length<=100,'event_restore_above_safe_limit');
  const ids=new Set();
  for(const event of before){
    requireState(EVENT_ID.test(event?.id??'')&&!ids.has(event.id)&&
      event.doc&&Number.isSafeInteger(event.doc.version)&&
      event.doc.version>=1&&event.doc.draft,'event_audit_invalid');
    ids.add(event.id);
  }
  return {eventCount:before.length};
}

export function verifyEventRestore(before,current){
  requireState(before.length===current.length,'event_count_mismatch');
  for(let i=0;i<before.length;i++){
    const expected=publishEvent(before[i].doc,undefined);
    const actual=current[i];
    // Only the publication timestamp may be different from pure projection.
    requireState(expected!==null&&actual&&
      typeof actual.publishedAt==='string'&&
      isDeepStrictEqual({...expected,publishedAt:actual.publishedAt},actual),
      'event_modified_since_week_opening');
  }
}

async function findUniqueRuntime(db){
  const roots=await db.collection('campaignCloudRuntime').limit(20).get();
  requireState(roots.size<20,'runtime_inventory_too_large');
  const active=roots.docs.filter(d=>d.data()?.status==='active'&&
    d.data()?.private===true&&d.data()?.applicationEnabled===true);
  requireState(active.length===1&&HASH.test(active[0].id),'active_runtime_not_unique');
  return active[0];
}

export async function repairWeek(db,{apply=false,now=()=>new Date().toISOString()}={}){
  const root=await findUniqueRuntime(db);
  const snapshotId=root.id,cloudRef=root.ref;
  const mailRef=db.collection('campaignMailRuntime').doc(snapshotId);
  const archiveRef=db.collection('migrationTimeEngineStage').doc(snapshotId)
    .collection('calendar').doc('current');
  const history=db.collection('campaignNarratorDrafts').doc(snapshotId).collection('calendarAudit');
  const repairRef=history.doc(REPAIR_ID);

  const outcome=await db.runTransaction(async tx=>{
    const [liveDoc,mailDoc,archiveDoc,repairDoc]=await Promise.all([
      tx.get(cloudRef),tx.get(mailRef),tx.get(archiveRef),tx.get(repairRef),
    ]);
    const live=liveDoc.data(),mail=mailDoc.data(),archive=archiveDoc.data();
    if(repairDoc.exists){
      const previous=repairDoc.data();
      requireState(previous?.action==='undo_advance'&&
        previous.fromRound===4&&previous.toRound===3&&
        sameDate(live?.calendar,TARGET)&&live?.openRound===3&&mail?.openRound===3&&
        live?.calendarVersion===mail?.calendarVersion,'existing_correction_conflict');
      return {result:'already_corrected',week:3,day:21,eventsRestored:previous.restoredEvents??0};
    }
    requireState(liveDoc.exists&&mailDoc.exists&&archiveDoc.exists,'clock_document_missing');
    const lastRef=history.doc(live?.lastAdvanceAuditId??'_missing_');
    const lastDoc=await tx.get(lastRef);
    const last=lastDoc.data();
    const {eventCount}=verifyWeekCorrection({live,mail,archive,last,snapshotId});
    const eventRefs=last.eventsBefore.map(x=>cloudRef.collection('scheduleEvents').doc(x.id));
    // Query guards are identical in preview and apply; no writes before all reads.
    const [createdFourth,publishedFourth,...eventDocs]=await Promise.all([
      tx.get(cloudRef.collection('letters').where('creationRound','==',4).limit(1)),
      tx.get(cloudRef.collection('publishedNewspapers').where('publishedRound','==',4).limit(1)),
      ...eventRefs.map(ref=>tx.get(ref)),
    ]);
    requireState(createdFourth.empty,'new_letters_exist_in_week_four');
    requireState(publishedFourth.empty,'newspaper_published_in_week_four');
    verifyEventRestore(last.eventsBefore,eventDocs.map(d=>d.exists?d.data():null));
    if(!apply)return {result:'preflight_ok',week:3,day:21,eventsRestored:eventCount};
    const at=now();
    requireState(Number.isFinite(Date.parse(at)),'audit_time_invalid');
    const newVersion=live.calendarVersion+1;
    const calendar={...TARGET,version:newVersion};
    last.eventsBefore.forEach((item,i)=>tx.set(eventRefs[i],item.doc));
    tx.update(cloudRef,{
      calendar,calendarVersion:newVersion,publishedTimeVersion:newVersion,
      openRound:3,lastAdvanceKey:null,
      lastAdvanceAuditId:typeof last.prevAdvanceAuditId==='string'?last.prevAdvanceAuditId:null,
      lastWeekCorrectionId:REPAIR_ID,lastWeekCorrectedAt:at,lastWeekCorrectedBy:'atlas-owner',
    });
    tx.update(mailRef,{
      openRound:3,calendarVersion:newVersion,lastWeekCorrectionId:REPAIR_ID,
      lastWeekCorrectedAt:at,
    });
    tx.update(lastRef,{undoneAt:at,undoneBy:'owner-approved-firestore-correction'});
    tx.create(repairRef,{
      action:'undo_advance',actorUid:'owner-approved-firestore-correction',at,
      undoneAuditId:live.lastAdvanceAuditId,
      from:{...live.calendar},to:calendar,fromRound:4,toRound:3,
      monthsCrossed:0,restoredEvents:eventCount,
      reason:'Correção do Narrador: 21 de Marpenoth de 1522 pertence à 3ª désdia e à Semana operacional 3',
      correctionId:REPAIR_ID,sourceSnapshotId:snapshotId,
    });
    return {result:'corrected',week:3,day:21,eventsRestored:eventCount,newVersion};
  });
  if(outcome.result==='corrected'){
    const [live,mail,audit]=await Promise.all([
      cloudRef.get(),mailRef.get(),repairRef.get(),
    ]);
    requireState(live.data()?.openRound===3&&mail.data()?.openRound===3&&
      live.data()?.calendarVersion===mail.data()?.calendarVersion&&
      sameDate(live.data()?.calendar,TARGET)&&audit.exists,'post_commit_verification_failed');
  }
  console.log('TEMPORAL_WEEK_CORRECTION '+JSON.stringify(outcome));
  return outcome;
}

async function main(){
  requireState(process.env.GOOGLE_CLOUD_PROJECT===PROJECT&&
    (!process.env.GCLOUD_PROJECT||process.env.GCLOUD_PROJECT===PROJECT)&&
    !process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FIREBASE_AUTH_EMULATOR_HOST,
    'production_project_guard');
  const apply=process.argv.includes('--apply');
  requireState(!(apply&&process.argv.includes('--check')),'conflicting_modes');
  if(apply)requireState(process.env.CORMYR_WEEK_CORRECTION_ACK===ACK,
    'owner_ack_required');
  const [{initializeApp,applicationDefault},{getFirestore}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/firestore'),
  ]);
  const app=initializeApp({projectId:PROJECT,credential:applicationDefault()},
    'cormyr-marpenoth-week-correction');
  await repairWeek(getFirestore(app),{apply});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error('TEMPORAL_WEEK_CORRECTION_BLOCKED '+(e?.message??'unknown'));
    process.exitCode=1;});
}
