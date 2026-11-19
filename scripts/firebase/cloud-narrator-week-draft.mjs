/**
 * Narrator-only Firebase proposal of the campaign's next official week.
 *
 * Saving is a private pending draft. Publishing explicitly initializes the operational clock.
 * The immutable import and House resources are preserved. One-time publication
 * adopts the imported source and opens a separate operational runtime with an audit.
 */
import {randomUUID} from 'node:crypto';
import {validateHarptosDate} from './stage-temporal-emulator.mjs';
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';
import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';

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

    /** One-time baseline launch, explicitly selected by the authenticated narrator. */
    async publish(token,request){
      const uid=await authenticate(token);
      if(!request||request.adoptFirebaseSource!==true||
         !whole(request.expectedDraftVersion,1,2147483647)||
         Object.keys(request).some(k=>!['adoptFirebaseSource','expectedDraftVersion'].includes(k)))
        deny('launch_confirmation_required',400);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const mail=db.collection('campaignMailRuntime').doc(snapshotId);
        const paper=db.collection('migrationNewspaperRuntimeStage').doc(snapshotId);
        const [liveDoc,mailDoc,paperDoc,editionsDoc]=await Promise.all([
          tx.get(cloud),tx.get(mail),tx.get(paper),
          tx.get(paper.collection('editions').limit(101)),
        ]);
        const live=liveDoc.data(),gate=mailDoc.data();
        if(live?.launchDraftVersion===request.expectedDraftVersion&&
           live?.calendarSource==='operational'&&live?.status==='active'&&
           live?.applicationEnabled===true&&live?.sourceSnapshotReconciled===true&&
           live?.mailWriteApproved===true&&live?.private===true&&
           live?.sourceSnapshotId===snapshotId&&
           gate?.applicationEnabled===true&&gate?.mailEnabled===true&&
           gate?.sourceLiveReconciled===true&&gate?.private===true&&
           gate?.sourceSnapshotId===snapshotId&&
           gate?.status==='active'&&gate?.openRound===live?.openRound&&
           gate?.calendarVersion===live?.calendarVersion)
          return {published:true,duplicate:true,calendar:live.calendar,openRound:live.openRound};
        if(!state.draft||state.draft.draftVersion!==request.expectedDraftVersion||
           state.draft.expectedCalendarVersion!==state.calendar.version)
          deny('draft_version_conflict',409);
        // A launch cannot overwrite an already running campaign or advance game effects.
        if(!liveDoc.exists||!mailDoc.exists||
           live?.status!=='pending'||gate?.status!=='pending'||
           live.private!==true||gate.private!==true||
           live.applicationEnabled!==false||gate.applicationEnabled!==false||
           live.sourceSnapshotId!==snapshotId||gate.sourceSnapshotId!==snapshotId)
          deny('campaign_already_started_or_invalid',409);
        if(!complete(paperDoc,snapshotId)||!Array.isArray(editionsDoc.docs)||
           editionsDoc.docs.length>100)deny('newspaper_source_not_ready',503);
        let maxEdition=0;
        for(const doc of editionsDoc.docs){
          const edition=doc.data();
          if(!whole(edition?.editionNo,0,99999998))
            deny('newspaper_sequence_invalid',503);
          maxEdition=Math.max(maxEdition,edition.editionNo);
        }
        const d=state.draft.proposedDate;
        if(!calendarOkay({...d,version:state.calendar.version})||
           !whole(state.draft.proposedOpenRound,1,2147483647)||
           state.calendar.version>=2147483647)
          deny('draft_invalid_source',503);
        const calendar={year:d.year,month:d.month,day:d.day,
          festival:d.festival??null,version:state.calendar.version+1};
        const at=now();
        if(!Number.isFinite(Date.parse(at)))deny('draft_clock_invalid',503);
        const next={...live,status:'active',applicationEnabled:true,
          sourceSnapshotReconciled:true,sourceAuthority:'owner_adopted_firebase',
          calendarSource:'operational',calendar,calendarVersion:calendar.version,
          openRound:state.draft.proposedOpenRound,mailWriteApproved:true,
          publicTimeApproved:true,publishedTimeVersion:calendar.version,
          newspaperWriteApproved:true,newspaperSequenceReconciled:true,
          newspaperImportedMaxEditionNo:maxEdition,nextNewspaperEditionNo:maxEdition+1,
          launchDraftVersion:state.draft.draftVersion,launchedAt:at,launchedBy:uid};
        tx.set(cloud,next);
        tx.set(mail,{...gate,status:'active',applicationEnabled:true,
          sourceLiveReconciled:true,mailEnabled:true,
          calendarVersion:calendar.version,openRound:next.openRound,
          launchedAt:at,launchedBy:uid});
        tx.create(audit.doc(newId()),{action:'launch_firebase_campaign',
          actorUid:uid,at,sourceAuthority:'owner_adopted_firebase',
          previousCloudRuntime:live,previousMailRuntime:gate,
          draftVersion:state.draft.draftVersion,calendar,openRound:next.openRound});
        return {published:true,duplicate:false,calendar,openRound:next.openRound};
      });
    },
    async get(token){
      const uid=await authenticate(token);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const [runtime,mailRuntime]=await Promise.all([
          tx.get(db.collection('campaignCloudRuntime').doc(snapshotId)),
          tx.get(db.collection('campaignMailRuntime').doc(snapshotId)),
        ]);
        const live=runtime?.exists?runtime.data():null;
        const mail=mailRuntime?.exists?mailRuntime.data():null;
        const effective=effectiveCloudCalendar(state.calendar,live,snapshotId);
        // An active marker without coherent operational date and explicit
        // narrator source adoption must never appear as a published week.
        const launched=Boolean(
          live?.status==='active'&&live?.private===true&&
          live?.calendarSource==='operational'&&
          live?.sourceSnapshotId===snapshotId&&
          live?.sourceSnapshotReconciled===true&&
          live?.applicationEnabled===true&&
          live?.sourceAuthority==='owner_adopted_firebase'&&
          whole(live?.launchDraftVersion,1,2147483647)&&
          whole(live?.openRound,1,2147483647)&&
          effective&&calendarOkay(effective)&&
          live.calendarVersion===effective.version&&
          live.publicTimeApproved===true&&
          live.publishedTimeVersion===effective.version);
        const mailEnabled=launched&&
          cloudMailRuntimeApproved(live,mail,state.calendar,snapshotId);
        return {...publicView(state),editable:!launched,
          calendarPublished:launched,mailEnabled:Boolean(mailEnabled),
          operationalCalendar:launched?{
            year:effective.year,month:effective.month,day:effective.day,
            festival:effective.festival??null,version:effective.version,
          }:null,
          openRound:launched?live.openRound:null};
      });
    },
    async save(token,request){
      const uid=await authenticate(token);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const runtime=await tx.get(db.collection('campaignCloudRuntime').doc(snapshotId));
        if(runtime.data()?.status==='active')deny('campaign_already_started_or_invalid',409);
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

