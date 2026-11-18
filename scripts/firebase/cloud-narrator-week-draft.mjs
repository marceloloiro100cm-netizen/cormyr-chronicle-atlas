/**
 * Narrator-only Firebase proposal of the campaign's next official week.
 *
 * This is a PRIVATE PENDING DRAFT, never an active calendar publication.
 * The immutable migrationTimeEngineStage source, House resources, operational
 * runtimes, inbox and player permissions are never modified by this module.
 * A separate reconciled approval flow must publish the campaign clock.
 */
import {randomUUID} from 'node:crypto';
import {validateHarptosDate} from './stage-temporal-emulator.mjs';

const HASH=/^[a-f0-9]{64}$/;
const UID=/^[^/\u0000-\u001f]{1,128}$/;
const REASON=/^[\s\S]{12,300}$/;

export class NarratorWeekDraftError extends Error {
  constructor(code,status=403){
    super(code);this.name='NarratorWeekDraftError';this.code=code;this.status=status;
  }
}
const deny=(code,status)=>{throw new NarratorWeekDraftError(code,status);};
const whole=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const calendarOkay=c=>whole(c?.version,1,2147483647)&&
  validateHarptosDate(c?.year,c?.month,c?.day,c?.festival??null);
const complete=(doc,id)=>doc?.exists===true&&doc.data()?.status==='complete'&&
  doc.data()?.private===true&&
  (doc.data()?.sourceSnapshotId===undefined||doc.data()?.sourceSnapshotId===id);

export function planNarratorWeekDraft({archivedCalendar,previous,request,actorUid,at}){
  if(!UID.test(actorUid??'')||!calendarOkay(archivedCalendar)||
     !request||typeof request!=='object'||Array.isArray(request))
    deny('draft_invalid_source',503);
  if(!whole(request.expectedCalendarVersion,1,2147483647)||
     request.expectedCalendarVersion!==archivedCalendar.version)
    deny('calendar_version_conflict',409);
  const prevVersion=previous===null?0:previous?.draftVersion;
  if(!whole(prevVersion,0,2147483647)||
     (previous!==null&&previous.status!=='pending'))
    deny('draft_state_conflict',409);
  if(!whole(request.expectedDraftVersion,0,2147483647)||
     request.expectedDraftVersion!==prevVersion)
    deny('draft_version_conflict',409);
  const d=request.proposedDate;
  if(!d||typeof d!=='object'||Array.isArray(d)||
     !validateHarptosDate(d.year,d.month,d.day,d.festival??null)||
     (d.festival!==null&&d.festival!==undefined&&typeof d.festival!=='string'))
    deny('draft_date_invalid',400);
  if(!whole(request.openRound,1,2147483647))
    deny('draft_round_invalid',400);
  if(typeof request.reason!=='string'||!REASON.test(request.reason.trim()))
    deny('draft_reason_invalid',400);
  if(!Number.isFinite(Date.parse(at)))
    deny('draft_clock_invalid',503);
  // A proposal is intentionally not inferred from a historical lastRound.
  // Historic version is only a CAS precondition, never a live round approval.
  return {
    status:'pending',private:true,draftVersion:prevVersion+1,
    expectedCalendarVersion:archivedCalendar.version,
    proposedDate:{year:d.year,month:d.month,day:d.day,
      festival:d.festival??null},
    proposedOpenRound:request.openRound,
    reason:request.reason.trim(),actorUid,updatedAt:at,
    applied:false,currentRoundApproved:false,sourceDeltaReconciled:false,
  };
}

export function createFirebaseNarratorWeekDraft({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
  now=()=>new Date().toISOString(),newId=randomUUID,
}={}){
  if(enabled!==true||projectId!=='cormyr'||!HASH.test(snapshotId??'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    deny('draft_service_disabled',503);

  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const authRoot=db.collection('migrationAuthStage').doc(snapshotId);
  const timeRoot=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const calendarRef=timeRoot.collection('calendar').doc('current');
  const drafts=db.collection('campaignNarratorDrafts').doc(snapshotId);
  const draftRef=drafts.collection('calendar').doc('current');
  const audit=drafts.collection('calendarAudit');

  async function authenticate(token){
    if(typeof token!=='string'||token.length<10||token.length>10000)
      deny('authentication_required',401);
    let decoded,user;
    try{
      decoded=await auth.verifyIdToken(token,true);
      if(!UID.test(decoded?.uid??''))deny('authentication_required',401);
      user=await auth.getUser(decoded.uid);
    }catch{deny('authentication_required',401);}
    if(user?.uid!==decoded.uid||user.disabled===true)
      deny('authentication_required',401);
    return decoded.uid;
  }
  async function readState(tx,uid){
    const [domainDoc,authDoc,timeDoc,accessDoc,calendarDoc,draftDoc]=
      await Promise.all([tx.get(domain),tx.get(authRoot),tx.get(timeRoot),
        tx.get(domain.collection('access').doc(uid)),tx.get(calendarRef),
        tx.get(draftRef)]);
    if(![domainDoc,authDoc,timeDoc].every(d=>complete(d,snapshotId))||
       !calendarDoc.exists||!calendarOkay(calendarDoc.data()))
      deny('draft_source_not_ready',503);
    const access=accessDoc.data();
    if(!accessDoc.exists||access?.userId!==uid||access.active!==true||
       access.requirePasswordChange!==false||access.profile!=='narrador'||
       access.admin!==true)deny('narrator_required',403);
    if(draftDoc.exists&&(draftDoc.data()?.status!=='pending'||
       !whole(draftDoc.data()?.draftVersion,1,2147483647)||
       draftDoc.data()?.applied!==false))
      deny('draft_state_conflict',409);
    return {calendar:calendarDoc.data(),draft:draftDoc.exists?draftDoc.data():null};
  }
  const publicView=state=>({
    archivedCalendar:{
      year:state.calendar.year,month:state.calendar.month,
      day:state.calendar.day,festival:state.calendar.festival??null,
      version:state.calendar.version,
    },
    draft:state.draft?{
      draftVersion:state.draft.draftVersion,
      expectedCalendarVersion:state.draft.expectedCalendarVersion,
      proposedDate:state.draft.proposedDate,
      proposedOpenRound:state.draft.proposedOpenRound,
      reason:state.draft.reason,updatedAt:state.draft.updatedAt,
      status:'pending',
    }:null,
    editable:true,calendarPublished:false,mailEnabled:false,
  });
  return {
    async get(token){
      const uid=await authenticate(token);
      return db.runTransaction(async tx=>publicView(await readState(tx,uid)));
    },
    async save(token,request){
      const uid=await authenticate(token);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const proposal=planNarratorWeekDraft({
          archivedCalendar:state.calendar,previous:state.draft,
          request,actorUid:uid,at:now(),
        });
        const auditRef=audit.doc(newId());
        tx.set(draftRef,proposal);
        tx.create(auditRef,{
          action:'narrator_proposed_week',actorUid:uid,
          draftVersion:proposal.draftVersion,
          expectedCalendarVersion:proposal.expectedCalendarVersion,
          proposedDate:proposal.proposedDate,
          proposedOpenRound:proposal.proposedOpenRound,
          at:proposal.updatedAt,applied:false,
        });
        return {...publicView({...state,draft:proposal}),saved:true};
      });
    },
  };
}
