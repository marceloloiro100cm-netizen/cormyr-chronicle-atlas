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
import {publishEvent} from './cloud-schedule-events-core.mjs';
import {weekPeriod,dateKeyInRange,planFestivalSave,isFestivalId,FIXED_FESTIVALS}
  from './hub-temporal-core.mjs';

const HASH=/^[a-f0-9]{64}$/;
const UID=/^[^/\u0000-\u001f]{1,128}$/;
const REASON=/^[\s\S]{12,300}$/;
const EVENT_ID=/^[A-Za-z0-9_-]{8,128}$/;
const HISTORY_ACTIONS=['advance_week','launch_firebase_campaign','set_calendar_date','undo_advance','start_season'];

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

/** Sortable position of a Harptos date (festivals follow day 30 of their month). */
export function harptosOrdinal(d){
  return d.year*1000+d.month*40+(d.festival?31:d.day);
}
const sameDate=(a,b)=>a.year===b.year&&a.month===b.month&&a.day===b.day&&
  (a.festival??null)===(b.festival??null);

/**
 * Weekly advance after launch: exactly one round forward, never backwards
 * in time. Crossing a month or year requires the narrator's explicit
 * confirmation; the crossing is counted in pendingHouseEffectMonths until
 * the HUB route runs the canonical monthly House processing for every
 * activated operational House sheet (src/lib/house/firebase-house-monthly).
 */
export function planWeekAdvance({live,request}){
  if(!request||typeof request!=='object'||Array.isArray(request))
    deny('advance_invalid_request',400);
  const current=live.calendar;
  if(!whole(request.expectedCalendarVersion,1,2147483647)||
     request.expectedCalendarVersion!==live.calendarVersion||
     !whole(request.expectedOpenRound,1,2147483646)||
     request.expectedOpenRound!==live.openRound)
    deny('calendar_version_conflict',409);
  const d=request.proposedDate;
  if(!d||typeof d!=='object'||Array.isArray(d)||
     !validateHarptosDate(d.year,d.month,d.day,d.festival??null))
    deny('draft_date_invalid',400);
  const next={year:d.year,month:d.month,day:d.day,festival:d.festival??null};
  // Volta no tempo (Hub V2.1): a semana avança, a data do jogo recua. Exige
  // confirmação explícita; efeitos já realizados não são desfeitos e a
  // economia das Casas não roda de novo (marca d'água por Casa).
  const flashback=harptosOrdinal(next)<harptosOrdinal(current);
  if(flashback&&(request.allowBackdate!==true||request.acknowledgeIrreversibleEffects!==true))
    deny('advance_backdate_forbidden',400);
  if(flashback&&current.year-next.year>50)deny('flashback_too_far',400);
  if(typeof request.reason!=='string'||!REASON.test(request.reason.trim()))
    deny('draft_reason_invalid',400);
  const monthsCrossed=Math.max(0,(next.year-current.year)*12+(next.month-current.month));
  if(monthsCrossed>0&&request.acknowledgeHouseEffectsPending!==true)
    deny('house_effects_acknowledgement_required',409);
  if(monthsCrossed>3)deny('advance_too_far',400);
  return {date:next,monthsCrossed,openRound:live.openRound+1,flashback,
    version:live.calendarVersion+1,reason:request.reason.trim()};
}

/** Nova temporada: a semana avança e a data muda para qualquer era. Não há
 * efeitos mensais das Casas nem viradas de idade de personagens. */
export function planSeasonStart({live,request}){
  if(!request||typeof request!=='object'||Array.isArray(request))
    deny('season_invalid_request',400);
  if(!whole(request.expectedCalendarVersion,1,2147483647)||
     request.expectedCalendarVersion!==live.calendarVersion||
     !whole(request.expectedOpenRound,1,2147483646)||
     request.expectedOpenRound!==live.openRound)
    deny('calendar_version_conflict',409);
  const d=request.proposedDate;
  if(!d||typeof d!=='object'||Array.isArray(d)||
     !validateHarptosDate(d.year,d.month,d.day,d.festival??null))
    deny('draft_date_invalid',400);
  if(request.name!==undefined&&(typeof request.name!=='string'||request.name.length>80))
    deny('season_invalid_request',400);
  if(typeof request.reason!=='string'||!REASON.test(request.reason.trim()))
    deny('draft_reason_invalid',400);
  const before=seasonsOf(live);
  const number=Math.max(...before.map(x=>x.number))+1;
  const seasons=[...before.map(x=>x.status==='active'?{...x,status:'closed',endRound:live.openRound}:x),
    {number,name:(request.name??'').trim(),startRound:live.openRound+1,
     startDate:{year:d.year,month:d.month,day:d.day,festival:d.festival??null},status:'active'}];
  return {date:{year:d.year,month:d.month,day:d.day,festival:d.festival??null},
    openRound:live.openRound+1,version:live.calendarVersion+1,
    reason:request.reason.trim(),seasons,number};
}
/** Temporadas registradas; sem registro, a campanha está na Temporada 2. */
export function seasonsOf(live){
  const list=Array.isArray(live?.seasons)?live.seasons.filter(x=>
    x&&whole(x.number,1,999)&&['active','closed'].includes(x.status)):[];
  return list.length?list:[{number:2,name:'',startRound:null,startDate:null,status:'active'}];
}

/** Escolhe os eventos publicados na abertura: rascunhos do período da nova
 * semana (menos os desmarcados) e exclusões pendentes. */
export function planEventPublication(docs,date,exclude=[]){
  const {start,end}=weekPeriod(date);
  const skip=new Set(Array.isArray(exclude)?exclude:[]);
  return (docs??[]).filter(d=>{
    const v=d.data();
    if(!v?.draft)return false;
    if(v.draft.deleted===true)return true;
    return !skip.has(d.id)&&dateKeyInRange(v.draft.date,start,end);
  });
}

/**
 * Change the official Harptos date without delivering letters, opening a
 * new correspondence round, or mutating the historical imported calendar.
 * Backdating inside the same month requires explicit acknowledgement and
 * cannot undo earlier campaign effects.
 */
export function planCalendarDateChange({live,request}){
  if(!request||typeof request!=='object'||Array.isArray(request))
    deny('date_change_invalid_request',400);
  const current=live?.calendar;
  if(!calendarOkay({...current,version:live?.calendarVersion})||
     !whole(request.expectedCalendarVersion,1,2147483646)||
     request.expectedCalendarVersion!==live.calendarVersion||
     !whole(request.expectedOpenRound,1,2147483647)||
     request.expectedOpenRound!==live.openRound)
    deny('calendar_version_conflict',409);
  const input=request.proposedDate;
  if(!input||typeof input!=='object'||Array.isArray(input)||
     !validateHarptosDate(input.year,input.month,input.day,input.festival??null))
    deny('draft_date_invalid',400);
  const date={year:input.year,month:input.month,day:input.day,
    festival:input.festival??null};
  if(sameDate(current,date))deny('date_unchanged',400);
  if(typeof request.reason!=='string'||!REASON.test(request.reason.trim()))
    deny('draft_reason_invalid',400);
  const monthsCrossed=(date.year-current.year)*12+(date.month-current.month);
  const backdated=harptosOrdinal(date)<harptosOrdinal(current);
  if(monthsCrossed<0)deny('historical_month_reversal_forbidden',400);
  if(backdated&&(!request.allowBackdate||
      request.acknowledgeIrreversibleEffects!==true))
    deny('date_backdate_acknowledgement_required',409);
  if(monthsCrossed>3)deny('advance_too_far',400);
  if(monthsCrossed>0&&request.acknowledgeHouseEffectsPending!==true)
    deny('house_effects_acknowledgement_required',409);
  return {date,version:live.calendarVersion+1,monthsCrossed,backdated,
    openRound:live.openRound,reason:request.reason.trim()};
}

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

/** Diz se a última abertura do Hub pode ser desfeita (exceto o teste de
 * missivas novas, que precisa consultar a coleção dentro da transação). */
export function undoBlocker(last,live){
  if(!last||!['advance_week','start_season'].includes(last.action)||
     !Array.isArray(last.eventsBefore)||!last.from)
    return {available:false,reason:'no_hub_opening'};
  if(typeof last.undoneAt==='string')return {available:false,reason:'no_hub_opening'};
  if(last.toRound!==live?.openRound||last.to?.version!==live?.calendarVersion)
    return {available:false,reason:'undo_calendar_changed'};
  if(last.action==='advance_week'&&(last.monthsCrossed>0||last.from.year!==last.to.year))
    return {available:false,reason:'undo_house_effects_applied'};
  return {available:true};
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
  function publishChosen(tx,cloud,docs,at){
    let count=0;
    for(const d of docs){
      const next=publishEvent(d.data(),at);
      if(!next)continue;
      tx.set(cloud.collection('scheduleEvents').doc(d.id),next);count++;
    }
    return count;
  }
  function publishPending(tx,cloud,eventDocs,at){
    const docs=Array.isArray(eventDocs?.docs)?eventDocs.docs:[];
    if(docs.length>2000)deny('schedule_events_too_large',503);
    let count=0;
    for(const d of docs){
      const next=publishEvent(d.data(),at);
      if(!next)continue;
      tx.set(cloud.collection('scheduleEvents').doc(d.id),next);count++;
    }
    return count;
  }
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
    /** Independent official clock edit; mail round is deliberately unchanged. */
    async changeDate(token,request){
      const uid=await authenticate(token);
      if(!request||typeof request!=='object'||Array.isArray(request)||
         Object.keys(request).some(k=>!['expectedCalendarVersion','expectedOpenRound',
           'proposedDate','reason','requestKey','allowBackdate',
           'acknowledgeIrreversibleEffects','acknowledgeHouseEffectsPending'].includes(k))||
         typeof request.requestKey!=='string'||
         !/^[A-Za-z0-9_-]{8,128}$/.test(request.requestKey))
        deny('date_change_invalid_request',400);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const mail=db.collection('campaignMailRuntime').doc(snapshotId);
        const [liveDoc,mailDoc]=await Promise.all([tx.get(cloud),tx.get(mail)]);
        const live=liveDoc.data(),gate=mailDoc.data();
        if(live?.lastDateChangeKey===request.requestKey&&live.lastDateChangeBy===uid)
          return {changed:true,duplicate:true,calendar:live.calendar,
            openRound:live.openRound,monthsCrossed:0};
        const effective=effectiveCloudCalendar(state.calendar,live,snapshotId);
        const launched=live?.status==='active'&&live?.private===true&&
          live?.calendarSource==='operational'&&
          live?.sourceAuthority==='owner_adopted_firebase'&&
          live?.sourceSnapshotId===snapshotId&&
          live?.sourceSnapshotReconciled===true&&
          live?.applicationEnabled===true&&effective&&
          live?.publicTimeApproved===true&&
          live?.publishedTimeVersion===effective.version&&
          live.calendarVersion===effective.version&&
          whole(live.openRound,1,2147483647)&&
          cloudMailRuntimeApproved(live,gate,state.calendar,snapshotId);
        if(!launched)deny('campaign_not_launched',409);
        const plan=planCalendarDateChange({live:{...live,calendar:effective},request});
        const at=now();
        if(!Number.isFinite(Date.parse(at)))deny('draft_clock_invalid',503);
        const calendar={...plan.date,version:plan.version};
        const pending=whole(live.pendingHouseEffectMonths,0,1200)
          ?live.pendingHouseEffectMonths:0;
        if(calendar.year>effective.year)for(let year=effective.year;year<calendar.year;year++){
          tx.create(cloud.collection('characterYearTransitions')
            .doc('year-'+plan.version+'-'+year+'-'+(year+1)),{
            id:newId(),sourceSnapshotId:snapshotId,calendarVersion:plan.version,
            fromYear:year,toYear:year+1,actor:uid,createdAt:at,
          });
        }
        tx.set(cloud,{...live,calendar,calendarVersion:plan.version,
          publishedTimeVersion:plan.version,
          pendingHouseEffectMonths:pending+plan.monthsCrossed,
          lastDateChangeKey:request.requestKey,lastDateChangeBy:uid,
          lastDateChangedAt:at});
        tx.set(mail,{...gate,calendarVersion:plan.version,lastDateChangedAt:at});
        tx.create(audit.doc(newId()),{action:'set_calendar_date',actorUid:uid,at,
          from:{...effective},to:calendar,fromRound:live.openRound,
          toRound:live.openRound,monthsCrossed:plan.monthsCrossed,
          backdated:plan.backdated,reason:plan.reason});
        return {changed:true,duplicate:false,calendar,
          openRound:live.openRound,monthsCrossed:plan.monthsCrossed};
      });
    },

    async advance(token,request){
      const uid=await authenticate(token);
      if(!request||typeof request!=='object'||Array.isArray(request)||
         Object.keys(request).some(k=>!['expectedCalendarVersion','expectedOpenRound',
           'proposedDate','reason','acknowledgeHouseEffectsPending','requestKey',
           'allowBackdate','acknowledgeIrreversibleEffects','excludeEventIds'].includes(k))||
         typeof request.requestKey!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(request.requestKey)||
         (request.excludeEventIds!==undefined&&(!Array.isArray(request.excludeEventIds)||
           request.excludeEventIds.length>200||request.excludeEventIds.some(x=>!EVENT_ID.test(String(x))))))
        deny('advance_invalid_request',400);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const mail=db.collection('campaignMailRuntime').doc(snapshotId);
        const [liveDoc,mailDoc,eventDocs]=await Promise.all([tx.get(cloud),tx.get(mail),
          tx.get(cloud.collection('scheduleEvents').limit(2001))]);
        const live=liveDoc.data(),gate=mailDoc.data();
        // Retrying the same request after success returns the same week.
        if(live?.lastAdvanceKey===request.requestKey&&live?.lastAdvanceBy===uid)
          return {advanced:true,duplicate:true,calendar:live.calendar,openRound:live.openRound};
        const effective=effectiveCloudCalendar(state.calendar,live,snapshotId);
        const launched=live?.status==='active'&&live?.calendarSource==='operational'&&
          live?.sourceAuthority==='owner_adopted_firebase'&&effective&&
          live.calendarVersion===effective.version&&whole(live.openRound,1,2147483646)&&
          cloudMailRuntimeApproved(live,gate,state.calendar,snapshotId);
        if(!launched)deny('campaign_not_launched',409);
        const plan=planWeekAdvance({live:{...live,calendar:effective},request});
        const at=now();
        if(!Number.isFinite(Date.parse(at)))deny('draft_clock_invalid',503);
        const calendar={...plan.date,version:plan.version};
        const pending=whole(live.pendingHouseEffectMonths,0,1200)?live.pendingHouseEffectMonths:0;
        // Cada mudança de ano é auditada na mesma transação que o HUB oficial.
        if(calendar.year!==effective.year){
          const direction=calendar.year>effective.year?1:-1;
          for(let year=effective.year;year!==calendar.year;year+=direction){
            const id=newId(),to=year+direction;
            tx.create(cloud.collection('characterYearTransitions')
              .doc('year-'+plan.version+'-'+year+'-'+to),{
              id,sourceSnapshotId:snapshotId,calendarVersion:plan.version,
              fromYear:year,toYear:to,actor:uid,createdAt:at,
            });
          }
        }
        // Opening the week publishes the Narrator's pending events of the new
        // week's period (Hub V2.1); the previous documents allow an exact undo.
        if((eventDocs?.docs?.length??0)>2000)deny('schedule_events_too_large',503);
        const chosen=planEventPublication(eventDocs?.docs,plan.date,request.excludeEventIds);
        const auditId=newId();
        tx.set(cloud,{...live,calendar,calendarVersion:plan.version,openRound:plan.openRound,
          publishedTimeVersion:plan.version,
          pendingHouseEffectMonths:pending+plan.monthsCrossed,
          lastAdvanceKey:request.requestKey,lastAdvanceBy:uid,lastAdvancedAt:at,
          lastAdvanceAuditId:auditId});
        tx.set(mail,{...gate,calendarVersion:plan.version,openRound:plan.openRound,
          lastAdvancedAt:at});
        const published=publishChosen(tx,cloud,chosen,at);
        tx.create(audit.doc(auditId),{action:'advance_week',actorUid:uid,at,publishedEvents:published,
          from:{...effective},to:calendar,fromRound:live.openRound,toRound:plan.openRound,
          monthsCrossed:plan.monthsCrossed,houseEffectsPending:plan.monthsCrossed>0,
          flashback:plan.flashback,reason:plan.reason,
          prevAdvanceAuditId:typeof live.lastAdvanceAuditId==='string'?live.lastAdvanceAuditId:null,
          eventsBefore:chosen.map(d=>({id:d.id,doc:d.data()}))});
        return {advanced:true,duplicate:false,calendar,openRound:plan.openRound,
          monthsCrossed:plan.monthsCrossed,publishedEvents:published};
      });
    },
    /** Explicit publication of pending calendar events, without a new week. */
    async publishEvents(token,ids){
      const uid=await authenticate(token);
      if(ids!==undefined&&(!Array.isArray(ids)||ids.length<1||ids.length>200||
         ids.some(x=>!EVENT_ID.test(String(x)))))deny('advance_invalid_request',400);
      return db.runTransaction(async tx=>{
        await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const [liveDoc,eventDocs]=await Promise.all([tx.get(cloud),
          tx.get(cloud.collection('scheduleEvents').limit(2001))]);
        if(liveDoc.data()?.status!=='active')deny('campaign_not_launched',409);
        const at=now();
        if(!Number.isFinite(Date.parse(at)))deny('draft_clock_invalid',503);
        const published=ids===undefined?publishPending(tx,cloud,eventDocs,at)
          :publishChosen(tx,cloud,(eventDocs?.docs??[]).filter(d=>ids.includes(d.id)),at);
        if(published>0)tx.create(audit.doc(newId()),{action:'publish_events',actorUid:uid,at,publishedEvents:published});
        return {published};
      });
    },
    /** Narrator history of launch and weekly advances (no UIDs). */
    async history(token,limit=15){
      const uid=await authenticate(token);
      if(!whole(limit,1,50))deny('advance_invalid_request',400);
      return db.runTransaction(async tx=>{
        await readState(tx,uid);
        const docs=await tx.get(audit.limit(500));
        return (docs.docs??[]).map(d=>({id:d.id,...d.data()}))
          .filter(a=>HISTORY_ACTIONS.includes(a.action))
          .sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,limit)
          .map(a=>({id:a.id,action:a.action,at:a.at,
            from:a.from??null,to:a.to??a.calendar??null,
            fromRound:a.fromRound??null,toRound:a.toRound??a.openRound??null,
            monthsCrossed:a.monthsCrossed??0,reason:a.reason??null,
            flashback:a.flashback===true,undone:typeof a.undoneAt==='string',
            publishedEvents:Number.isSafeInteger(a.publishedEvents)?a.publishedEvents:null,
            season:a.season??null}));
      });
    },
    /** Estado operacional para as ações do Hub V2.1 (somente Narrador). */
    async hubData(token){
      const uid=await authenticate(token);
      return db.runTransaction(async tx=>{
        await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const [liveDoc,festDocs,letterDocs,paperDocs]=await Promise.all([tx.get(cloud),
          tx.get(cloud.collection('festivals').limit(501)),
          tx.get(cloud.collection('letters').select('originHouseId','recipientKind',
            'recipientHouseId','subject','campaignDate','creationRound','deliveryRound',
            'publicationState','deletedAt').limit(5001)),
          tx.get(cloud.collection('publishedNewspapers').select('editionNo','state',
            'publishedAt','publishedRound').limit(2001))]);
        const live=liveDoc.data();
        if(live?.status!=='active')deny('campaign_not_launched',409);
        const round=live.openRound;
        let undo={available:false,reason:'no_hub_opening'};
        if(typeof live.lastAdvanceAuditId==='string'){
          const last=await tx.get(audit.doc(live.lastAdvanceAuditId));
          undo=undoBlocker(last.data(),live);
          if(undo.available){
            const fresh=await tx.get(cloud.collection('letters')
              .where('creationRound','==',round).limit(1));
            if((fresh?.docs?.length??0)>0)undo={available:false,reason:'undo_new_week_has_mail'};
          }
        }
        const letters=(letterDocs?.docs??[]).map(d=>({id:d.id,...d.data()}))
          .filter(v=>v.deletedAt==null&&typeof v.campaignDate==='string')
          .map(v=>({id:v.id,from:v.originHouseId??null,to:v.recipientKind==='house'?v.recipientHouseId??null:'narrador',
            subject:typeof v.subject==='string'?v.subject.slice(0,160):'',date:v.campaignDate,
            creationRound:whole(v.creationRound,1,2147483647)?v.creationRound:null,
            deliveryRound:whole(v.deliveryRound,1,2147483647)?v.deliveryRound:null,
            state:['draft','scheduled','delivered'].includes(v.publicationState)?v.publicationState:'draft'}));
        const editions=(paperDocs?.docs??[]).map(d=>d.data())
          .filter(v=>v&&v.state!=='cancelled'&&typeof v.publishedAt==='string');
        return {
          openRound:round,
          seasons:seasonsOf(live),
          settings:{newspaperOneEditionPerWeek:live.newspaperOneEditionPerWeek===true},
          fixedFestivalNotify:live.fixedFestivalNotify&&typeof live.fixedFestivalNotify==='object'
            ?live.fixedFestivalNotify:{},
          festivals:(festDocs?.docs??[]).map(d=>d.data()).filter(f=>f&&f.deleted!==true&&isFestivalId(f.id)),
          letters,
          newspaper:{total:editions.length,
            thisWeek:editions.filter(v=>v.publishedRound===round)
              .map(v=>v.editionNo).filter(n=>whole(n,0,99999999)).sort((a,b)=>a-b)},
          undo,
        };
      });
    },
    /** Desfaz a última abertura feita pelo Hub (sem prazo), revertendo
     * exatamente o que ela gravou. Bloqueia se a nova semana já teve
     * missivas, se a abertura processou a economia das Casas ou virou o ano. */
    async undo(token,request){
      const uid=await authenticate(token);
      if(!request||typeof request!=='object'||Array.isArray(request)||
         Object.keys(request).some(k=>!['expectedCalendarVersion','expectedOpenRound','requestKey'].includes(k))||
         typeof request.requestKey!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(request.requestKey))
        deny('undo_invalid_request',400);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const mail=db.collection('campaignMailRuntime').doc(snapshotId);
        const [liveDoc,mailDoc]=await Promise.all([tx.get(cloud),tx.get(mail)]);
        const live=liveDoc.data(),gate=mailDoc.data();
        if(live?.lastUndoKey===request.requestKey&&live?.lastUndoBy===uid)
          return {undone:true,duplicate:true,calendar:live.calendar,openRound:live.openRound};
        const effective=effectiveCloudCalendar(state.calendar,live,snapshotId);
        const launched=live?.status==='active'&&live?.calendarSource==='operational'&&
          live?.sourceAuthority==='owner_adopted_firebase'&&effective&&
          live.calendarVersion===effective.version&&whole(live.openRound,2,2147483647)&&
          cloudMailRuntimeApproved(live,gate,state.calendar,snapshotId);
        if(!launched)deny('campaign_not_launched',409);
        if(request.expectedCalendarVersion!==live.calendarVersion||
           request.expectedOpenRound!==live.openRound)deny('calendar_version_conflict',409);
        if(typeof live.lastAdvanceAuditId!=='string')deny('no_hub_opening',409);
        const auditRef=audit.doc(live.lastAdvanceAuditId);
        const lastDoc=await tx.get(auditRef);
        const last=lastDoc.data();
        const blocker=undoBlocker(last,live);
        if(!blocker.available)deny(blocker.reason,409);
        const fresh=await tx.get(cloud.collection('letters')
          .where('creationRound','==',live.openRound).limit(1));
        if((fresh?.docs?.length??0)>0)deny('undo_new_week_has_mail',409);
        const before=Array.isArray(last.eventsBefore)?last.eventsBefore:[];
        const refs=before.map(x=>cloud.collection('scheduleEvents').doc(x.id));
        const current=await Promise.all(refs.map(r=>tx.get(r)));
        for(let i=0;i<before.length;i++){
          const now_=current[i]?.data();
          if(!now_||now_.version!==before[i].doc.version+1)deny('undo_events_changed',409);
        }
        const at=now();
        if(!Number.isFinite(Date.parse(at)))deny('draft_clock_invalid',503);
        const version=live.calendarVersion+1;
        const f=last.from;
        const calendar={year:f.year,month:f.month,day:f.day,festival:f.festival??null,version};
        before.forEach((x,i)=>tx.set(refs[i],x.doc));
        tx.set(cloud,{...live,calendar,calendarVersion:version,publishedTimeVersion:version,
          openRound:last.fromRound,lastAdvanceKey:null,
          lastAdvanceAuditId:typeof last.prevAdvanceAuditId==='string'?last.prevAdvanceAuditId:null,
          ...(last.action==='start_season'?{seasons:Array.isArray(last.seasonsBefore)?last.seasonsBefore:null}:{}),
          lastUndoKey:request.requestKey,lastUndoBy:uid,lastUndoneAt:at});
        tx.set(mail,{...gate,calendarVersion:version,openRound:last.fromRound,lastUndoneAt:at});
        tx.set(auditRef,{...last,undoneAt:at,undoneBy:uid});
        tx.create(audit.doc(newId()),{action:'undo_advance',actorUid:uid,at,
          undoneAuditId:lastDoc.id??live.lastAdvanceAuditId,
          from:{...effective},to:calendar,fromRound:live.openRound,toRound:last.fromRound,
          monthsCrossed:0,restoredEvents:before.length,
          reason:'Abertura da Semana '+live.openRound+' desfeita pelo Narrador'});
        return {undone:true,duplicate:false,calendar,openRound:last.fromRound,restoredEvents:before.length};
      });
    },
    /** Inicia uma nova temporada em qualquer data (inclusive outra era). */
    async startSeason(token,request){
      const uid=await authenticate(token);
      if(!request||typeof request!=='object'||Array.isArray(request)||
         Object.keys(request).some(k=>!['expectedCalendarVersion','expectedOpenRound',
           'proposedDate','reason','name','requestKey'].includes(k))||
         typeof request.requestKey!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(request.requestKey))
        deny('season_invalid_request',400);
      return db.runTransaction(async tx=>{
        const state=await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const mail=db.collection('campaignMailRuntime').doc(snapshotId);
        const [liveDoc,mailDoc,eventDocs]=await Promise.all([tx.get(cloud),tx.get(mail),
          tx.get(cloud.collection('scheduleEvents').limit(2001))]);
        const live=liveDoc.data(),gate=mailDoc.data();
        if(live?.lastSeasonKey===request.requestKey&&live?.lastSeasonBy===uid)
          return {started:true,duplicate:true,calendar:live.calendar,openRound:live.openRound};
        const effective=effectiveCloudCalendar(state.calendar,live,snapshotId);
        const launched=live?.status==='active'&&live?.calendarSource==='operational'&&
          live?.sourceAuthority==='owner_adopted_firebase'&&effective&&
          live.calendarVersion===effective.version&&whole(live.openRound,1,2147483646)&&
          cloudMailRuntimeApproved(live,gate,state.calendar,snapshotId);
        if(!launched)deny('campaign_not_launched',409);
        const plan=planSeasonStart({live,request});
        if((eventDocs?.docs?.length??0)>2000)deny('schedule_events_too_large',503);
        const at=now();
        if(!Number.isFinite(Date.parse(at)))deny('draft_clock_invalid',503);
        const calendar={...plan.date,version:plan.version};
        const chosen=planEventPublication(eventDocs?.docs,plan.date,[]);
        const auditId=newId();
        tx.set(cloud,{...live,calendar,calendarVersion:plan.version,openRound:plan.openRound,
          publishedTimeVersion:plan.version,seasons:plan.seasons,
          lastSeasonKey:request.requestKey,lastSeasonBy:uid,lastAdvancedAt:at,
          lastAdvanceAuditId:auditId});
        tx.set(mail,{...gate,calendarVersion:plan.version,openRound:plan.openRound,lastAdvancedAt:at});
        const published=publishChosen(tx,cloud,chosen,at);
        tx.create(audit.doc(auditId),{action:'start_season',actorUid:uid,at,publishedEvents:published,
          from:{...effective},to:calendar,fromRound:live.openRound,toRound:plan.openRound,
          monthsCrossed:0,reason:plan.reason,season:{number:plan.number,name:plan.seasons.at(-1).name},
          seasonsBefore:Array.isArray(live.seasons)?live.seasons:null,
          prevAdvanceAuditId:typeof live.lastAdvanceAuditId==='string'?live.lastAdvanceAuditId:null,
          eventsBefore:chosen.map(d=>({id:d.id,doc:d.data()}))});
        return {started:true,duplicate:false,calendar,openRound:plan.openRound,
          season:plan.number,publishedEvents:published};
      });
    },
    /** Cadastro, edição e exclusão de festivais (coleção festivals). */
    async saveFestival(token,payload){
      const uid=await authenticate(token);
      return db.runTransaction(async tx=>{
        await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const id=payload&&typeof payload==='object'?payload.id:undefined;
        if(id!==null&&id!==undefined&&!isFestivalId(id))deny('invalid_festival',400);
        const [liveDoc,prevDoc]=await Promise.all([tx.get(cloud),
          typeof id==='string'?tx.get(cloud.collection('festivals').doc(id)):Promise.resolve(null)]);
        if(liveDoc.data()?.status!=='active')deny('campaign_not_launched',409);
        const at=now();
        const next=planFestivalSave(prevDoc?.exists?prevDoc.data():null,payload,{
          deny,newId:()=>'fest-'+String(newId()).replace(/[^A-Za-z0-9_-]/g,''),uid,at});
        tx.set(cloud.collection('festivals').doc(next.id),next);
        tx.create(audit.doc(newId()),{action:'save_festival',actorUid:uid,at,
          festivalId:next.id,version:next.version});
        return next;
      });
    },
    async deleteFestival(token,request){
      const uid=await authenticate(token);
      if(!request||!isFestivalId(request.id)||!whole(request.version,1,2147483646))
        deny('invalid_festival',400);
      return db.runTransaction(async tx=>{
        await readState(tx,uid);
        const ref=db.collection('campaignCloudRuntime').doc(snapshotId).collection('festivals').doc(request.id);
        const prev=await tx.get(ref);
        const v=prev.data();
        if(!prev.exists||v?.deleted===true)deny('festival_not_found',404);
        if(v.version!==request.version)deny('festival_version_conflict',409);
        const at=now();
        tx.set(ref,{...v,deleted:true,version:v.version+1,updatedAt:at,updatedBy:uid});
        tx.create(audit.doc(newId()),{action:'delete_festival',actorUid:uid,at,festivalId:request.id});
        return {deleted:true};
      });
    },
    /** Ajustes do Hub: aviso dos dias festivos fixos e limite semanal do Jornal. */
    async saveSettings(token,request){
      const uid=await authenticate(token);
      const keys=['newspaperOneEditionPerWeek','fixedFestivalNotify'];
      if(!request||typeof request!=='object'||Array.isArray(request)||
         Object.keys(request).length===0||Object.keys(request).some(k=>!keys.includes(k))||
         (request.newspaperOneEditionPerWeek!==undefined&&typeof request.newspaperOneEditionPerWeek!=='boolean')||
         (request.fixedFestivalNotify!==undefined&&(typeof request.fixedFestivalNotify!=='object'||
           request.fixedFestivalNotify===null||Array.isArray(request.fixedFestivalNotify)||
           Object.entries(request.fixedFestivalNotify).some(([k,v])=>
             !FIXED_FESTIVALS.some(f=>f.id===k)||typeof v!=='boolean'))))
        deny('invalid_settings',400);
      return db.runTransaction(async tx=>{
        await readState(tx,uid);
        const cloud=db.collection('campaignCloudRuntime').doc(snapshotId);
        const live=(await tx.get(cloud)).data();
        if(live?.status!=='active')deny('campaign_not_launched',409);
        const at=now();
        const next={...live,
          ...(request.newspaperOneEditionPerWeek!==undefined?{newspaperOneEditionPerWeek:request.newspaperOneEditionPerWeek}:{}),
          ...(request.fixedFestivalNotify!==undefined?{fixedFestivalNotify:{
            ...(live.fixedFestivalNotify&&typeof live.fixedFestivalNotify==='object'?live.fixedFestivalNotify:{}),
            ...request.fixedFestivalNotify}}:{})};
        tx.set(cloud,next);
        tx.create(audit.doc(newId()),{action:'hub_settings',actorUid:uid,at,changes:request});
        return {settings:{newspaperOneEditionPerWeek:next.newspaperOneEditionPerWeek===true},
          fixedFestivalNotify:next.fixedFestivalNotify??{}};
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
        return {...publicView(state),editable:live?.status!=='active',
          calendarPublished:launched,
          requiresReconciliation:live?.status==='active'&&!launched,
          mailEnabled:Boolean(mailEnabled),
          operationalCalendar:launched?{
            year:effective.year,month:effective.month,day:effective.day,
            festival:effective.festival??null,version:effective.version,
          }:null,
          openRound:launched?live.openRound:null,
          pendingHouseEffectMonths:launched&&whole(live.pendingHouseEffectMonths,0,1200)
            ?live.pendingHouseEffectMonths:0};
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

