/**
 * Owner-approved, one-off Firestore date-only correction.
 * Live read-only evidence on 2026-11-22: week 3, 20 Marpenoth 1522.
 * Set the calendar to 21 Marpenoth without opening week 4.
 *
 * All missives, events, newspaper, imported archive, House effects and
 * historical rounds remain untouched. Strict compare-and-set transaction.
 */
import {fileURLToPath} from 'node:url';
import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';

const PROJECT='cormyr';
const SOURCE=Object.freeze({year:1522,month:9,day:20,festival:null});
const TARGET=Object.freeze({year:1522,month:9,day:21,festival:null});
const CORRECTION_ID='owner-set-date-21-marpenoth-week-3-20261121';
const ACK='OWNER_SET_21_MARPENOTH_WEEK_3_20261121';
const HASH=/^[a-f0-9]{64}$/;
const requireSafe=(ok,code)=>{if(!ok)throw Error(code);};
const same=(a,b)=>a?.year===b.year&&a?.month===b.month&&
  a?.day===b.day&&(a?.festival??null)===(b.festival??null);

export function verifyDateChange({snapshotId,live,mail,archive}){
  requireSafe(HASH.test(snapshotId??''),'snapshot_invalid');
  requireSafe(live?.status==='active'&&live.private===true&&
    live.sourceSnapshotId===snapshotId&&live.sourceSnapshotReconciled===true&&
    live.applicationEnabled===true&&live.calendarSource==='operational'&&
    live.sourceAuthority==='owner_adopted_firebase'&&
    live.publicTimeApproved===true&&
    Number.isSafeInteger(live.calendarVersion)&&
    live.calendarVersion>=1&&live.calendar?.version===live.calendarVersion&&
    live.publishedTimeVersion===live.calendarVersion,'operational_calendar_invalid');
  requireSafe(live.openRound===3&&same(live.calendar,SOURCE),
    'not_week_three_on_20_marpenoth');
  requireSafe(effectiveCloudCalendar(archive,live,snapshotId)?.version===
    live.calendarVersion&&cloudMailRuntimeApproved(live,mail,archive,snapshotId),
    'mail_calendar_alignment_failed');
  return {fromDay:20,toDay:21,week:3,previousVersion:live.calendarVersion};
}

export async function correctDate(db,{apply=false,now=()=>new Date().toISOString()}={}){
  const roots=await db.collection('campaignCloudRuntime').limit(20).get();
  requireSafe(roots.size<20,'runtime_count_limit');
  const active=roots.docs.filter(d=>d.data()?.status==='active'&&
    d.data()?.private===true&&d.data()?.applicationEnabled===true);
  requireSafe(active.length===1&&HASH.test(active[0].id),'runtime_not_unique');
  const snapshotId=active[0].id;
  const cloudRef=active[0].ref;
  const mailRef=db.collection('campaignMailRuntime').doc(snapshotId);
  const archiveRef=db.collection('migrationTimeEngineStage').doc(snapshotId)
    .collection('calendar').doc('current');
  const auditRef=db.collection('campaignNarratorDrafts').doc(snapshotId)
    .collection('calendarAudit').doc(CORRECTION_ID);
  const result=await db.runTransaction(async tx=>{
    const [cloudDoc,mailDoc,archiveDoc,auditDoc]=await Promise.all([
      tx.get(cloudRef),tx.get(mailRef),tx.get(archiveRef),tx.get(auditRef),
    ]);
    requireSafe(cloudDoc.exists&&mailDoc.exists&&archiveDoc.exists,
      'required_document_missing');
    const live=cloudDoc.data(),mail=mailDoc.data(),archive=archiveDoc.data();
    if(auditDoc.exists){
      const audit=auditDoc.data();
      requireSafe(audit?.action==='set_calendar_date'&&
        audit.fromRound===3&&audit.toRound===3&&
        same(audit.from,SOURCE)&&same(audit.to,TARGET)&&
        live.openRound===3&&mail.openRound===3&&same(live.calendar,TARGET)&&
        live.calendar?.version===live.calendarVersion&&
        live.calendarVersion===mail.calendarVersion&&
        live.publishedTimeVersion===live.calendarVersion&&
        cloudMailRuntimeApproved(live,mail,archive,snapshotId),
        'already_exists_but_current_state_conflicts');
      return {result:'already_corrected',week:3,day:21};
    }
    const plan=verifyDateChange({snapshotId,live,mail,archive});
    if(!apply)return {result:'preflight_ok',...plan};
    const at=now();
    requireSafe(typeof at==='string'&&Number.isFinite(Date.parse(at)),
      'invalid_audit_timestamp');
    const version=live.calendarVersion+1;
    requireSafe(Number.isSafeInteger(version)&&version<=2147483647,'version_limit');
    const calendar={...TARGET,version};
    tx.update(cloudRef,{
      calendar,calendarVersion:version,publishedTimeVersion:version,
      lastDateChangeKey:CORRECTION_ID,
      lastDateChangeBy:'owner-approved-firestore-correction',
      lastDateChangedAt:at,
    });
    tx.update(mailRef,{calendarVersion:version,lastDateChangedAt:at});
    tx.create(auditRef,{
      action:'set_calendar_date',
      actorUid:'owner-approved-firestore-correction',at,
      from:{...live.calendar},to:calendar,fromRound:3,toRound:3,
      monthsCrossed:0,backdated:false,
      reason:'Corrigir a data de 20 para 21 de Marpenoth 1522, na mesma Semana 3',
      correctionId:CORRECTION_ID,sourceSnapshotId:snapshotId,
    });
    return {result:'corrected',fromDay:20,toDay:21,week:3,version};
  });
  if(result.result==='corrected'){
    const [cloud,mail,audit]=await Promise.all([
      cloudRef.get(),mailRef.get(),auditRef.get(),
    ]);
    requireSafe(cloud.data()?.openRound===3&&mail.data()?.openRound===3&&
      same(cloud.data()?.calendar,TARGET)&&
      cloud.data()?.calendarVersion===mail.data()?.calendarVersion&&
      cloud.data()?.calendar?.version===cloud.data()?.calendarVersion&&audit.exists,
      'post_commit_verification_failed');
  }
  console.log('CORMYR_MARPENOTH_DATE_ONLY '+JSON.stringify(result));
  return result;
}

async function main(){
  requireSafe(process.env.GOOGLE_CLOUD_PROJECT===PROJECT&&
    (!process.env.GCLOUD_PROJECT||process.env.GCLOUD_PROJECT===PROJECT)&&
    !process.env.FIRESTORE_EMULATOR_HOST&&!process.env.FIREBASE_AUTH_EMULATOR_HOST,
    'wrong_target_project');
  const apply=process.argv.includes('--apply');
  requireSafe(!(apply&&process.argv.includes('--check')),'conflicting_modes');
  if(apply)requireSafe(process.env.CORMYR_DATE_ONLY_ACK===ACK,
    'explicit_owner_ack_required');
  const [{initializeApp,applicationDefault},{getFirestore}]=await Promise.all([
    import('firebase-admin/app'),import('firebase-admin/firestore'),
  ]);
  const app=initializeApp({projectId:PROJECT,credential:applicationDefault()},
    'cormyr-marpenoth-third-desdia-date-correction');
  await correctDate(getFirestore(app),{apply});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error('CORMYR_MARPENOTH_DATE_ONLY_BLOCKED '+(e?.message??'unknown'));
    process.exitCode=1;});
}
