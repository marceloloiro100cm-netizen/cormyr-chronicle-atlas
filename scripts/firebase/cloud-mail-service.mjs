import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
import {verifyMediaReferences,MediaReferenceError} from './private-media-references.mjs';
/**
 * Cormyr Firebase Cloud — fail-closed transactional mail.
 *
 * No Supabase and no emulator. The 2026-11-15 migration* documents are
 * immutable; newly authored messages live in a SEPARATE Cloud runtime.
 *
 * Three independent release gates:
 *  1. trusted server feature flag (enabled:true)
 *  2. reconciled, approved runtime root in Firestore
 *  3. enabled Firebase Auth account with trusted, current House access
 *
 * Never provision runtime or enable an account from this service.
 */
import {createHash} from 'node:crypto';
import {validateHarptosDate} from './stage-temporal-emulator.mjs';
import {canAcknowledgeMail,mailReceiptId,validMailIdentity} from './cloud-mail-receipt-core.mjs';
import {cloudReplyRoute} from './cloud-mail-reply-core.mjs';
import {cloudMailRuntimeApproved} from './cloud-mail-runtime-approval.mjs';
import {activeSeason2HouseScopeValid} from './cloud-season2-house-scope.mjs';
import {effectiveCloudMail,deliveryOptions,deliveryPlan} from './cloud-mail-delivery-core.mjs';
import {chooseCurrentAccountAccess,currentAccountAccess} from './operational-account-access.mjs';

const SNAPSHOT=/^[a-f0-9]{64}$/;
const SAFE_ID=/^[^/\u0000-\u001f]{1,128}$/;
const REQUEST_KEY=/^[a-zA-Z0-9_-]{8,128}$/;
const MAX_CONTENT_BYTES=20_000;
const MAX_SUBJECT_BYTES=180;
const MAX_MAIL_PER_ROUND=100;
const LETTER_HASH=/^[a-f0-9]{64}$/;
const writerOnly=actor=>{if(actor.role==='editor')deny('editor_read_only',403);};
/** NPC signature is a Narrator voice; court and unit links belong to a
 * player House order. The browser can never assign them across roles. */
function checkRoleOptions(actor,req){
  if(req.signedBy!==undefined&&actor.role!=='narrador')deny('signature_not_allowed',400);
  if((req.courtMemberId!==undefined||req.unitId!==undefined)&&
     (actor.role!=='jogador'||req.originHouseId===null))deny('links_not_allowed',400);
}
const storedOptions=req=>({
  ...(req.signedBy!==undefined?{signedBy:req.signedBy}:{}),
  ...(req.courtMemberId!==undefined?{courtMemberId:req.courtMemberId,courtAssignment:req.courtAssignment}:{}),
  ...(req.unitId!==undefined?{unitId:req.unitId}:{}),
});

/** Edit, cancel and restore share one strict envelope: Cloud id + version. */
function lifecycleInput(input,keys){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>!keys.includes(k))||
     typeof input.letterId!=='string'||!LETTER_HASH.test(input.letterId)||
     !Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)
    deny('invalid_mail_lifecycle_request',400);
  return input;
}

const hash=s=>createHash('sha256').update(s).digest('hex');
const validId=s=>typeof s==='string'&&SAFE_ID.test(s);
const validText=(s,limit)=>typeof s==='string'&&s.trim().length>0&&
  Buffer.byteLength(s,'utf8')<=limit;
const deny=(code,status=403)=>{throw new CloudMailError(code,status);};

export class CloudMailError extends Error {
  constructor(code,status=403){
    super(code);this.name='CloudMailError';this.code=code;this.status=status;
  }
}

function campaignDateOf(value){
  if(!Number.isInteger(value?.year)||!Number.isInteger(value?.month)||
     !Number.isInteger(value?.day)||value.year<1||value.year>9999)
    deny('calendar_unavailable',503);
  if(!validateHarptosDate(value.year,value.month,value.day,value.festival??null))
    deny('calendar_unavailable',503);
  return value.festival
    ?String(value.year).padStart(4,'0')+'-F-'+value.festival
    :String(value.year).padStart(4,'0')+'-'+
       String(value.month+1).padStart(2,'0')+'-'+
       String(value.day).padStart(2,'0');
}

function accessOf(uid,v){
  if(!v||v.userId!==uid||v.active!==true||
     v.requirePasswordChange!==false)
    deny('access_denied');
  if(v.profile==='narrador'&&v.admin===true)
    return {uid,role:'narrador',playerId:null,memberHouses:[],editHouses:[]};
  // Editor-Chefe: leitura de missivas entregues e recibo da PRÓPRIA leitura.
  // Nunca recebe Casa, nunca escreve, responde, edita ou cancela.
  if(v.profile==='editor'){
    const none=x=>x===undefined||x===null||Array.isArray(x)&&x.length===0;
    if(v.admin!==false||!none(v.memberHouseIds)||!none(v.editHouseIds))
      deny('access_denied');
    return {uid,role:'editor',playerId:null,memberHouses:[],editHouses:[]};
  }
  if(v.profile!=='jogador'||v.admin!==false||!validId(v.playerId)||
     !Array.isArray(v.memberHouseIds)||!Array.isArray(v.editHouseIds)||
     v.memberHouseIds.length>250||v.editHouseIds.length>250||
     !v.memberHouseIds.every(validId)||!v.editHouseIds.every(validId)||
     v.editHouseIds.some(x=>!v.memberHouseIds.includes(x)))
    deny('access_denied');
  return {uid,role:'jogador',playerId:v.playerId,
    memberHouses:v.memberHouseIds,editHouses:v.editHouseIds};
}

const OPTION_KEYS=['draft','deliveryRound','signedBy','courtMemberId','courtAssignment','unitId'];
const REQUEST_KEYS=['requestKey','originHouseId','recipientKind','recipientHouseId',
  'subject','content','expectedCampaignDate',...OPTION_KEYS];
function validateRequest(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
     Object.keys(v).some(k=>!REQUEST_KEYS.includes(k))||
     typeof v.requestKey!=='string'||!REQUEST_KEY.test(v.requestKey)||
     !validText(v.subject,MAX_SUBJECT_BYTES)||
     !validText(v.content,MAX_CONTENT_BYTES)||
     (v.originHouseId!==null&&!validId(v.originHouseId))||
     !['house','narrator'].includes(v.recipientKind)||
     (v.recipientKind==='house'&&!validId(v.recipientHouseId))||
     (v.recipientKind==='narrator'&&v.recipientHouseId!==null)||
     (v.expectedCampaignDate!==undefined&&
       (typeof v.expectedCampaignDate!=='string'||!/^\d{4}-(?:\d{2}-\d{2}|F-[a-z-]+)$/.test(v.expectedCampaignDate))))
    deny('invalid_mail_request',400);
  const options=deliveryOptions(v,()=>deny('invalid_mail_request',400));
  return {
    ...options,
    requestKey:v.requestKey,
    originHouseId:v.originHouseId,
    recipientKind:v.recipientKind,
    recipientHouseId:v.recipientHouseId,
    subject:v.subject.trim(),
    content:v.content,
    ...(v.expectedCampaignDate!==undefined?
      {expectedCampaignDate:v.expectedCampaignDate}:{}),
  };
}

// Separate mail approval is mandatory: activating the general campaign runtime
// must never silently authorize sending letters from an unreconciled mailbox.
 /**
 * Immutable migration roots and separate mutable Cloud mailbox namespace.
 * Emulator variables, project mismatch and missing flags are hard failures.
 */
export function createFirebaseCloudMail({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
  clock=()=>new Date().toISOString(),
}){
  if(enabled!==true||projectId!=='cormyr'||!SNAPSHOT.test(snapshotId??'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    deny('cloud_mail_disabled',503);

  const stage=db.collection('migrationDomainStage').doc(snapshotId);
  const authStage=db.collection('migrationAuthStage').doc(snapshotId);
  const timeStage=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  const mailRuntime=db.collection('campaignMailRuntime').doc(snapshotId);
  const access=stage.collection('access');
  const letters=runtime.collection('letters');
  const audits=runtime.collection('mailAudits');
  const limits=runtime.collection('mailSenderRoundCounts');
  const readReceipts=runtime.collection('mailReadReceipts');
  const versions=runtime.collection('letterVersions');
  const importedModeration=runtime.collection('legacyMailModeration');
  const importedReplies=db.collection('migrationMailHistoryStage').doc(snapshotId);

  /** Only Cloud-authored, delivered runtime letters have a lifecycle. */
  function cloudLetterOf(doc,letterId,round){
    const raw=doc.exists?doc.data():null;
    const v=raw?effectiveCloudMail(raw,round):null;
    if(!v||v.id!==letterId||v.source!=='firebase-cloud'||
       v.sourceSnapshotId!==snapshotId||
       !['delivered','scheduled','draft'].includes(v.publicationState)||
       !Number.isSafeInteger(v.version)||v.version<1||
       !(Number.isSafeInteger(v.deliveryRound)||
         v.publicationState==='draft'&&v.deliveryRound===null))
      deny('letter_not_found',404);
    return v;
  }
  /** Draft or still-scheduled: the author (under current authority) may
   * change it at any time, because nobody has received it yet. */
  function authorOfPending(actor,uid,v,round){
    if(v.senderUid!==uid||v.creationRound!==round||
       !['draft','scheduled'].includes(v.publicationState))return false;
    if(actor.role==='jogador')return actor.editHouses.includes(v.originHouseId);
    return actor.role==='narrador'&&v.originHouseId===null;
  }
  /**
   * The author may change or withdraw a message only while its delivery week
   * is still the open round, and only under CURRENT authority over the same
   * origin (a House lost since sending is no longer an authorization).
   */
  function authorInOpenWeek(actor,uid,v,round){
    if(authorOfPending(actor,uid,v,round))return true;
    if(v.senderUid!==uid||v.publicationState!=='delivered')return false;
    if(actor.role==='jogador'&&!actor.editHouses.includes(v.originHouseId))
      return false;
    if(actor.role==='narrador'&&v.originHouseId!==null)return false;
    return v.deliveryRound===round;
  }
  const checkVersion=(v,expected)=>{
    if(v.version!==expected)deny('letter_version_conflict',409);
  };
  const serverTime=()=>{
    const timestamp=clock();
    if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))
      deny('invalid_server_clock',503);
    return timestamp;
  };

  async function uidFromToken(idToken){
    if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
      deny('authentication_required',401);
    let decoded,user;
    try{
      decoded=await auth.verifyIdToken(idToken,true);
      if(!validId(decoded?.uid))deny('authentication_required',401);
      user=await auth.getUser(decoded.uid);
    }catch{deny('authentication_required',401);}
    if(user?.uid!==decoded.uid||user.disabled===true)
      deny('authentication_required',401);
    return decoded.uid;
  }
  async function verifyMemberHouses(actor,read){
    if(actor.role!=='jogador')return;
    const documents=await Promise.all(actor.memberHouses.map(id=>
      read(stage.collection('houses').doc(hash('house:'+id)))));
    if(!activeSeason2HouseScopeValid({
      memberHouseIds:actor.memberHouses,
      editHouseIds:actor.editHouses,
      houseDocuments:documents,
    }))deny('access_denied',403);
  }
  async function readyTransaction(tx,uid){
    const [domain,authRoot,temporal,scopeDoc,overlayDoc,calendar,live,mailGate]=await Promise.all([
      tx.get(stage),tx.get(authStage),tx.get(timeStage),
      tx.get(access.doc(uid)),
      tx.get(runtime.collection('accountAccess').doc(uid)),
      tx.get(timeStage.collection('calendar').doc('current')),tx.get(runtime),
      tx.get(mailRuntime),
    ]);
    for(const doc of [domain,authRoot,temporal])
      if(!doc.exists||doc.data()?.status!=='complete'||
         doc.data()?.private!==true)
        deny('migration_stage_not_ready',503);
    if(!calendar.exists||!Number.isInteger(calendar.data()?.version))
      deny('calendar_unavailable',503);
    const campaignDate=campaignDateOf(effectiveCloudCalendar(calendar.data(),live.data(),snapshotId));
    const actor=accessOf(uid,chooseCurrentAccountAccess(uid,scopeDoc.data(),
       overlayDoc.exists?overlayDoc.data():null,live.data()));
    // Every active player membership is verified against its exact House
    // document INSIDE the same transaction as mail authorization.
    await verifyMemberHouses(actor,ref=>tx.get(ref));
    if(!cloudMailRuntimeApproved(live.data(),mailGate.data(),
      calendar.data(),snapshotId))deny('mail_runtime_not_approved',503);
    return {actor,date:campaignDate,round:live.data().openRound};
  }


  /** Resolves the immutable imported root inside the SAME transaction used
   * to authorize the Cloud reply. No destination is taken from the browser.
   * A historical reply ID must belong to the root and target this actor.
   */
  async function resolveReply(tx,actor,input,round){
    if(LETTER_HASH.test(input.letterId)){
      const existing=await tx.get(letters.doc(input.letterId));
      if(existing.exists){
        if(existing.data()?.source!=='firebase-cloud'||
           existing.data()?.sourceSnapshotId!==snapshotId)
          deny('reply_not_authorized',403);
        if(input.replyId!==undefined)deny('invalid_reply_request',400);
        const parent=effectiveCloudMail(existing.data(),round);
        const route=cloudReplyRoute(actor,parent,snapshotId);
        if(!route||parent.id!==input.letterId)deny('reply_not_authorized',403);
        return {parent,route,replyToId:parent.id,
          threadRootId:parent.threadRootId??parent.replyToId??parent.id};
      }
    }
    const [source,moderated]=await Promise.all([
      tx.get(stage.collection('letters').doc(hash('letter:'+input.letterId))),
      tx.get(importedModeration.doc(hash('legacy-mail:'+input.letterId))),
    ]);
    const root=source.exists?source.data():null;
    if(!root||root.sourceId!==input.letterId||
       root.publicationState!=='delivered'||root.deletedAt!==null||
       moderated.exists&&moderated.data()?.deletedAt!==null)
      deny('reply_not_authorized',403);
    let recipientPersonHouseId=null;
    if(root.recipientKind==='player'){
      if(!validId(root.recipientPlayerId))deny('reply_not_authorized',403);
      const person=await tx.get(stage.collection('players')
        .doc(hash('player:'+root.recipientPlayerId)));
      if(!person.exists||person.data()?.id!==root.recipientPlayerId||
         !validId(person.data()?.rosterHouseId))
        deny('reply_not_authorized',403);
      recipientPersonHouseId=person.data().rosterHouseId;
    }
    let parent={
      ...root,id:input.letterId,source:'imported',
    };
    let replyToId=input.letterId;
    if(input.replyId!==undefined){
      const historyRoot=await tx.get(importedReplies);
      if(!historyRoot.exists||historyRoot.data()?.status!=='complete'||
         historyRoot.data()?.private!==true)
        deny('mail_history_not_ready',503);
      const response=await tx.get(importedReplies.collection('replies')
        .doc(hash('reply:'+input.replyId)));
      const old=response.exists?response.data():null;
      if(!old||old.sourceId!==input.replyId||
         old.letterId!==hash('letter:'+input.letterId)||
         old.publicationState!=='delivered'||old.deletedAt!==null||
         !validId(old.authorUid)||old.authorUid===actor.uid||
         old.recipientUid!==actor.uid||typeof old.content!=='string')
        deny('reply_not_authorized',403);
      const fromOriginal=old.authorUid===root.senderUid;
      const receivingHouse=root.recipientKind==='player'
        ?recipientPersonHouseId:root.recipientHouseId;
      if(!fromOriginal&&(!validId(receivingHouse)||
         !validId(root.originHouseId)&&root.originHouseId!==null))
        deny('reply_not_authorized',403);
      parent={
        ...parent,senderUid:old.authorUid,
        originHouseId:fromOriginal?root.originHouseId:receivingHouse,
        recipientKind:fromOriginal?root.recipientKind:
          root.originHouseId===null?'narrator':'house',
        recipientHouseId:fromOriginal?root.recipientHouseId:root.originHouseId,
        recipientPlayerId:fromOriginal?root.recipientPlayerId:null,
        subject:root.subject,content:old.content,
      };
      if(!fromOriginal)recipientPersonHouseId=null;
      replyToId=input.replyId;
    }
    const route=cloudReplyRoute(actor,parent,snapshotId,{recipientPersonHouseId});
    if(!route)deny('reply_not_authorized',403);
    return {parent,route,replyToId,threadRootId:input.letterId};
  }


  // All Cloud writes use the same atomic idempotency, House validation,
  // rate limit and immutable migration-source safeguards.
  async function persist(tx,{uid,actor,date,round,req,replyToId=null,threadRootId=null,realActorUid=null,sessionNonce=null}){
    // Original composer submits an explicit campaign date. Compare it inside
    // the same transaction to prevent a clock rollover from misdating a letter.
    if(req.expectedCampaignDate!==undefined&&req.expectedCampaignDate!==date)
      deny('campaign_date_changed',409);
    writerOnly(actor);
    if(actor.role==='narrador'){
      if(req.originHouseId!==null||req.recipientKind!=='house')
        deny('recipient_not_allowed');
    }else if(!actor.editHouses.includes(req.originHouseId)){
      deny('origin_house_not_authorized');
    }
    checkRoleOptions(actor,req);
    const plan=deliveryPlan(actor.role,req,round);
    if(plan.error)deny(plan.error,400);
    const fingerprint=hash(JSON.stringify(replyToId?{...req,replyToId,threadRootId}:req));
    const id=hash('cloud-mail:'+uid+':'+req.requestKey);
    const ref=letters.doc(id);
    const audit=audits.doc(id);
        const houseIds=[req.originHouseId,req.recipientKind==='house'
          ?req.recipientHouseId:null].filter(Boolean);
        const houseRefs=[...new Set(houseIds)].map(x=>
          stage.collection('houses').doc(hash('house:'+x)));
        const found=await Promise.all(houseRefs.map(r=>tx.get(r)));
        if(found.some((d,i)=>!d.exists||d.data()?.active!==true||
           d.data()?.season!==2||
           d.data()?.sourceId!==[...new Set(houseIds)][i]))
          deny('house_unavailable',404);

        const limitRef=limits.doc(hash('mail-count:'+uid+':'+round));
        const [previous,counter]=await Promise.all([
          tx.get(ref),tx.get(limitRef),
        ]);
        if(previous.exists){
          if(previous.data()?.senderUid!==uid||
             previous.data()?.requestFingerprint!==fingerprint)
            deny('request_key_conflict',409);
          return {id,duplicate:true,state:previous.data().publicationState,
            deliveryRound:previous.data().deliveryRound};
        }
        try{await verifyMediaReferences({tx,root:runtime,snapshotId,uid,
          content:req.content});}
        catch(e){if(e instanceof MediaReferenceError)
          deny(e.code,e.status);throw e;}
        const n=counter.exists?counter.data()?.count:0;
        if(!Number.isInteger(n)||n<0||n>=MAX_MAIL_PER_ROUND)
          deny('mail_round_limit',429);
        const timestamp=clock();
        if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))
          deny('invalid_server_clock',503);
        tx.create(ref,{
          id,source:'firebase-cloud',sourceSnapshotId:snapshotId,
          requestKey:req.requestKey,requestFingerprint:fingerprint,
          senderUid:uid,senderPlayerId:actor.playerId,
          ...(realActorUid?{administrativeActorUid:realActorUid}:{}),
          senderName:actor.role==='narrador'?'Narrador':'Jogador',
          originHouseId:req.originHouseId,
          recipientKind:req.recipientKind,
          recipientHouseId:req.recipientKind==='house'?req.recipientHouseId:null,
          recipientPlayerId:null,
          ...(replyToId?{replyToId,threadRootId:threadRootId??replyToId}:{}),
          ...storedOptions(req),
          subject:req.subject,content:req.content,
          createdAt:timestamp,deliveredAt:plan.state==='delivered'?timestamp:null,
          campaignDate:date,creationRound:round,deliveryRound:plan.deliveryRound,
          publicationState:plan.state,deletedAt:null,version:1,
        });
        tx.create(audit,{action:replyToId?'reply':'send',actorUid:realActorUid??uid,
          ...(realActorUid?{representedUid:uid,sessionNonce}:{}),letterId:id,
          ...(replyToId?{replyToId}:{}),
          requestFingerprint:fingerprint,occurredAt:timestamp});
        if(realActorUid)tx.create(runtime.collection('representationAudits')
          .doc(hash('representation-mail:'+uid+':'+req.requestKey)),{
           action:'representation_'+(replyToId?'reply':'send'),
           realActorUid,representedUid:uid,playerId:actor.playerId,
           letterId:id,sessionNonce,sourceSnapshotId:snapshotId,
           occurredAt:timestamp,
          });
        if(counter.exists)tx.update(limitRef,{count:n+1});
        else tx.create(limitRef,{count:1,round,actorUid:uid});
        return {id,duplicate:false,state:plan.state,deliveryRound:plan.deliveryRound};

  }


  // O JWT continua pertencendo ao Narrador. O alvo e as permissões são
  // validados novamente dentro da própria transação de envio.
  async function represented(tx,realUid){
    if(env.CORMYR_FIREBASE_REPRESENTATION_ENABLED!=='true')
      deny('representation_disabled',501);
    const actual=await readyTransaction(tx,realUid);
    const root=await tx.get(runtime);
    if(root.data()?.representationReadApproved!==true||
       root.data()?.representationWriteApproved!==true)
      deny('representation_write_not_approved',503);
    if(actual.actor.role!=='narrador')deny('representation_denied',403);
    const ref=runtime.collection('representationSessions').doc(realUid);
    const doc=await tx.get(ref),session=doc.data();
    if(!doc.exists||session?.actorUid!==realUid||
       session?.sourceSnapshotId!==snapshotId||
       !validId(session?.representedUid)||session.representedUid===realUid||
       typeof session?.nonce!=='string'||
       !Number.isFinite(Date.parse(session?.expiresAt))||
       Date.parse(session.expiresAt)<=Date.now())
      deny('representation_expired',403);
    const target=await readyTransaction(tx,session.representedUid);
    if(target.actor.role!=='jogador'||target.actor.playerId!==session.playerId)
      deny('representation_denied',403);
    return {...target,uid:session.representedUid,realActorUid:realUid,
      sessionNonce:session.nonce};
  }

  function validateRepresentedReply(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||
      Object.keys(input).some(k=>!['requestKey','letterId','replyId','content','expectedCampaignDate','draft'].includes(k))||
      (input.expectedCampaignDate!==undefined&&
       (typeof input.expectedCampaignDate!=='string'||
        !/^\d{4}-(?:\d{2}-\d{2}|F-[a-z-]+)$/.test(input.expectedCampaignDate)))||
      !validId(input.letterId)||
      (input.replyId!==undefined&&!validId(input.replyId))||
      typeof input.requestKey!=='string'||!REQUEST_KEY.test(input.requestKey)||
      !validText(input.content,MAX_CONTENT_BYTES)||
      (input.draft!==undefined&&typeof input.draft!=='boolean'))
      deny('invalid_reply_request',400);
    return input;
  }

  return {

    async sendRepresented(idToken,input){
      const realUid=await uidFromToken(idToken),req=validateRequest(input);
      if(req.recipientKind==='narrator'&&req.originHouseId===null)
        deny('invalid_origin_house',400);
      return db.runTransaction(async tx=>{
        const ctx=await represented(tx,realUid);
        return persist(tx,{...ctx,req});
      });
    },
    async replyRepresented(idToken,raw){
      const realUid=await uidFromToken(idToken);
      const input=validateRepresentedReply(raw);
      return db.runTransaction(async tx=>{
        const {actor,uid,date,round,realActorUid,sessionNonce}=await represented(tx,realUid);
        if(input.expectedCampaignDate!==undefined&&input.expectedCampaignDate!==date)
          deny('campaign_date_changed',409);
        const {parent,route,replyToId,threadRootId}=
          await resolveReply(tx,actor,input,round);
        const prefix=/^Re:\s/i.test(parent.subject)?'':'Re: ';
        const chars=Array.from(parent.subject);
        while(chars.length&&Buffer.byteLength(prefix+chars.join(''),'utf8')>
              MAX_SUBJECT_BYTES)chars.pop();
        const req=validateRequest({
          requestKey:input.requestKey,...route,
          subject:prefix+chars.join(''),content:input.content,
          ...(input.draft===true?{draft:true}:{}),
          ...(input.expectedCampaignDate!==undefined?
            {expectedCampaignDate:input.expectedCampaignDate}:{}),
        });
        return persist(tx,{uid,actor,date,round,req,replyToId,threadRootId,
          realActorUid,sessionNonce});
      });
    },
    async cancelRepresented(idToken,input){
      const realUid=await uidFromToken(idToken);
      const {letterId,expectedVersion}=lifecycleInput(input,
        ['letterId','expectedVersion']);
      return db.runTransaction(async tx=>{
        const {actor,uid,round,sessionNonce}=await represented(tx,realUid);
        const v=cloudLetterOf(await tx.get(letters.doc(letterId)),letterId,round);
        if(v.senderUid!==uid||!actor.editHouses.includes(v.originHouseId))
          deny('cancel_not_allowed',403);
        if(v.deletedAt!==null)return {removed:true,alreadyRemoved:true,version:v.version};
        checkVersion(v,expectedVersion);
        if(!authorInOpenWeek(actor,uid,v,round))
          deny('cancel_not_allowed',403);
        const at=serverTime(),version=v.version+1;
        tx.update(letters.doc(letterId),{deletedAt:at,deletedByUid:uid,
          removalKind:'cancelada',version,updatedAt:at,
          administrativeActorUid:realUid});
        tx.create(audits.doc(hash('mail-remove:'+letterId+':'+version)),{
          action:'cancel',actorUid:realUid,representedUid:uid,
          sessionNonce,letterId,version,occurredAt:at,
        });
        tx.create(runtime.collection('representationAudits')
          .doc(hash('representation-mail-cancel:'+letterId+':'+version)),{
            action:'representation_delete',realActorUid:realUid,
            representedUid:uid,playerId:actor.playerId,
            letterId,sessionNonce,occurredAt:at,sourceSnapshotId:snapshotId,
          });
        return {removed:true,alreadyRemoved:false,version};
      });
    },
    async status(idToken){
      const uid=await uidFromToken(idToken);
      const [effective,domain,authRoot,temporal,cal,live,mailGate]=await Promise.all([
        currentAccountAccess(db,snapshotId,uid),stage.get(),authStage.get(),timeStage.get(),
        timeStage.collection('calendar').doc('current').get(),runtime.get(),
        mailRuntime.get(),
      ]);
      const actor=accessOf(uid,effective);
      await verifyMemberHouses(actor,ref=>ref.get());
      // No snapshot metadata, UIDs or incomplete sources go to the caller.
      const rootsReady=[domain,authRoot,temporal].every(d=>
        d.exists&&d.data()?.status==='complete'&&d.data()?.private===true);
      const dateValid=cal.exists&&Number.isInteger(cal.data()?.version)&&
        Number.isInteger(cal.data()?.year)&&
        Number.isInteger(cal.data()?.month)&&
        Number.isInteger(cal.data()?.day)&&
        validateHarptosDate(cal.data().year,cal.data().month,
          cal.data().day,cal.data().festival??null);
      const writable=rootsReady&&dateValid&&live.exists&&mailGate.exists&&
        cloudMailRuntimeApproved(live.data(),mailGate.data(),
          cal.data(),snapshotId);
      return {enabled:Boolean(writable),
        canSend:Boolean(writable&&(actor.role==='narrador'||actor.editHouses.length>0)),
        originHouseIds:actor.editHouses,
        readOnly:!writable};
    },

    /**
     * Withdraw a delivered Cloud message. Author: only during the open week
     * ("cancelada"). Narrator: moderation at any time ("excluida").
     * Nothing is erased: the row keeps its text, gains deletedAt and an
     * immutable audit entry, and appears in the Lixeira for restoration.
     */
    async cancel(idToken,input){
      const uid=await uidFromToken(idToken);
      const {letterId,expectedVersion}=lifecycleInput(input,['letterId','expectedVersion']);
      const ref=letters.doc(letterId);
      return db.runTransaction(async tx=>{
        const {actor,round}=await readyTransaction(tx,uid);
        writerOnly(actor);
        const v=cloudLetterOf(await tx.get(ref),letterId,round);
        if(v.deletedAt!==null)
          return {removed:true,alreadyRemoved:true,version:v.version,
            removalKind:v.removalKind??null};
        checkVersion(v,expectedVersion);
        const own=authorInOpenWeek(actor,uid,v,round);
        if(!own&&actor.role!=='narrador')
          deny(v.senderUid===uid?'mail_week_closed':'cancel_not_allowed',
            v.senderUid===uid?409:403);
        const removalKind=own?'cancelada':'excluida';
        const at=serverTime(),version=v.version+1;
        tx.update(ref,{deletedAt:at,deletedByUid:uid,removalKind,version,updatedAt:at});
        tx.create(audits.doc(hash('mail-remove:'+letterId+':'+version)),{
          action:own?'cancel':'remove',actorUid:uid,letterId,version,occurredAt:at});
        return {removed:true,alreadyRemoved:false,version,removalKind};
      });
    },


    /**
     * Narrator's separate operational removal marker for delivered legacy
     * mail. Archive bytes and immutable migration snapshots never change.
     * A restore changes only the marker and records an audit.
     */
    async moderateImported(idToken,input){
      const uid=await uidFromToken(idToken);
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(k=>!['letterId','action'].includes(k))||
         !validId(input.letterId)||!['remove','restore'].includes(input.action))
        deny('invalid_mail_lifecycle_request',400);
      return db.runTransaction(async tx=>{
        const {actor}=await readyTransaction(tx,uid);
        if(actor.role!=='narrador')deny('moderation_not_allowed',403);
        const original=await tx.get(stage.collection('letters')
          .doc(hash('letter:'+input.letterId)));
        const source=original.exists?original.data():null;
        if(!source||source.sourceId!==input.letterId||
           source.publicationState!=='delivered'||source.deletedAt!==null)
          deny('letter_not_found',404);
        const ref=importedModeration.doc(hash('legacy-mail:'+input.letterId));
        const existing=await tx.get(ref),marker=existing.exists?existing.data():null;
        if(marker&&(marker.letterId!==input.letterId||
          marker.sourceSnapshotId!==snapshotId||
          !Number.isSafeInteger(marker.version)||marker.version<1))
          deny('invalid_legacy_moderation',409);
        if(input.action==='remove'&&marker?.deletedAt)
          return {removed:true,alreadyRemoved:true,version:marker.version};
        if(input.action==='restore'&&!marker?.deletedAt)
          return {restored:true,alreadyActive:true,version:marker?.version??0};
        const version=(marker?.version??0)+1,at=serverTime();
        const next={letterId:input.letterId,sourceSnapshotId:snapshotId,
          version,deletedAt:input.action==='remove'?at:null,
          removalKind:input.action==='remove'?'excluida':null,
          changedAt:at,actorUid:uid};
        if(existing.exists)tx.update(ref,next);
        else tx.create(ref,next);
        tx.create(audits.doc(hash('legacy-mail-'+input.action+':'+input.letterId+':'+version)),{
          action:input.action==='remove'?'legacy_remove':'legacy_restore',
          actorUid:uid,source:'imported',letterId:input.letterId,
          version,occurredAt:at});
        return input.action==='remove'
          ?{removed:true,alreadyRemoved:false,version,removalKind:'excluida'}
          :{restored:true,alreadyActive:false,version};
      });
    },

    /** Narrator restores anything; an author restores own cancellation
     * while the delivery week is still open. */
    async restore(idToken,input){
      const uid=await uidFromToken(idToken);
      const {letterId,expectedVersion}=lifecycleInput(input,['letterId','expectedVersion']);
      const ref=letters.doc(letterId);
      return db.runTransaction(async tx=>{
        const {actor,round}=await readyTransaction(tx,uid);
        writerOnly(actor);
        const v=cloudLetterOf(await tx.get(ref),letterId,round);
        if(v.deletedAt===null)
          return {restored:true,alreadyActive:true,version:v.version};
        checkVersion(v,expectedVersion);
        const ownCancel=v.removalKind==='cancelada'&&v.deletedByUid===uid&&
          authorInOpenWeek(actor,uid,v,round);
        if(actor.role!=='narrador'&&!ownCancel){
          const closedOwn=v.removalKind==='cancelada'&&v.deletedByUid===uid;
          deny(closedOwn?'mail_week_closed':'restore_not_allowed',closedOwn?409:403);
        }
        const at=serverTime(),version=v.version+1;
        tx.update(ref,{deletedAt:null,deletedByUid:null,removalKind:null,
          restoredAt:at,restoredByUid:uid,version,updatedAt:at});
        tx.create(audits.doc(hash('mail-restore:'+letterId+':'+version)),{
          action:'restore',actorUid:uid,letterId,version,occurredAt:at});
        return {restored:true,alreadyActive:false,version};
      });
    },

    /**
     * Author edits a delivered message during its open week. The replaced
     * text is kept as an immutable version; optimistic version prevents
     * overwriting a concurrent change. Reply subjects stay derived.
     */
    async edit(idToken,input){
      const uid=await uidFromToken(idToken);
      const req=lifecycleInput(input,['letterId','expectedVersion','subject','content',
        'courtMemberId','courtAssignment','unitId']);
      const links=deliveryOptions({courtMemberId:req.courtMemberId,
        courtAssignment:req.courtAssignment,unitId:req.unitId},
        ()=>deny('invalid_mail_lifecycle_request',400));
      const linkEdit=['courtMemberId','courtAssignment','unitId'].some(k=>k in req);
      if(!validText(req.subject,MAX_SUBJECT_BYTES)||
         !validText(req.content,MAX_CONTENT_BYTES))
        deny('invalid_mail_lifecycle_request',400);
      const subject=req.subject.trim();
      const ref=letters.doc(req.letterId);
      return db.runTransaction(async tx=>{
        const {actor,round}=await readyTransaction(tx,uid);
        writerOnly(actor);
        const v=cloudLetterOf(await tx.get(ref),req.letterId,round);
        if(v.deletedAt!==null)deny('letter_removed',409);
        checkVersion(v,req.expectedVersion);
        if(!authorInOpenWeek(actor,uid,v,round))
          deny(v.senderUid===uid?'mail_week_closed':'edit_not_allowed',
            v.senderUid===uid?409:403);
        if(v.replyToId!==undefined&&subject!==v.subject)
          deny('reply_subject_fixed',400);
        // Court and unit links are part of the order: only while a draft.
        if(linkEdit&&(v.publicationState!=='draft'||actor.role!=='jogador'))
          deny('links_not_allowed',400);
        const linksChanged=linkEdit&&(links.courtMemberId!==v.courtMemberId||
          links.courtAssignment!==v.courtAssignment||links.unitId!==v.unitId);
        if(subject===v.subject&&req.content===v.content&&!linksChanged)
          return {edited:false,unchanged:true,version:v.version};
        const at=serverTime(),version=v.version+1;
        tx.create(versions.doc(hash('mail-version:'+req.letterId+':'+v.version)),{
          letterId:req.letterId,version:v.version,subject:v.subject,
          content:v.content,replacedAt:at,actorUid:uid,schemaVersion:1});
        tx.update(ref,{subject,content:req.content,version,editedAt:at,updatedAt:at,
          ...(linkEdit?{courtMemberId:links.courtMemberId??null,
            courtAssignment:links.courtAssignment??null,unitId:links.unitId??null}:{})});
        tx.create(audits.doc(hash('mail-edit:'+req.letterId+':'+version)),{
          action:'edit',actorUid:uid,letterId:req.letterId,version,
          contentFingerprint:hash(JSON.stringify({subject,content:req.content})),
          occurredAt:at});
        return {edited:true,unchanged:false,version};
      });
    },

    /**
     * Author releases a draft: now (open round) or scheduled for a later
     * round within the same limits as a new message.
     */
    async schedule(idToken,input){
      const uid=await uidFromToken(idToken);
      const req=lifecycleInput(input,['letterId','expectedVersion','deliveryRound']);
      if(req.deliveryRound!==null&&req.deliveryRound!==undefined&&
         (!Number.isSafeInteger(req.deliveryRound)||req.deliveryRound<1))
        deny('invalid_mail_lifecycle_request',400);
      const ref=letters.doc(req.letterId);
      return db.runTransaction(async tx=>{
        const {actor,round}=await readyTransaction(tx,uid);
        writerOnly(actor);
        const v=cloudLetterOf(await tx.get(ref),req.letterId,round);
        if(v.deletedAt!==null)deny('letter_removed',409);
        if(v.publicationState!=='draft')deny('not_a_draft',409);
        checkVersion(v,req.expectedVersion);
        if(!authorOfPending(actor,uid,v,round))deny('schedule_not_allowed',403);
        const plan=deliveryPlan(actor.role,{deliveryRound:req.deliveryRound??v.deliveryRound??null},round);
        if(plan.error)deny(plan.error,400);
        const at=serverTime(),version=v.version+1;
        tx.update(ref,{publicationState:plan.state,deliveryRound:plan.deliveryRound,
          deliveredAt:plan.state==='delivered'?at:null,scheduledAt:at,version,updatedAt:at});
        tx.create(audits.doc(hash('mail-schedule:'+req.letterId+':'+version)),{
          action:'schedule',actorUid:uid,letterId:req.letterId,version,
          state:plan.state,deliveryRound:plan.deliveryRound,occurredAt:at});
        return {state:plan.state,deliveryRound:plan.deliveryRound,version};
      });
    },

    /** Removes only the caller's own receipt: reading counts only when marked. */
    async markUnread(idToken,input){
      const uid=await uidFromToken(idToken);
      const source=input?.source;
      const letterId=input?.letterId;
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(k=>!['source','letterId'].includes(k))||
         !validMailIdentity(source,letterId))
        deny('invalid_receipt_request',400);
      const target=source==='imported'
        ?stage.collection('letters').doc(hash('letter:'+letterId))
        :letters.doc(letterId);
      const receipt=readReceipts.doc(mailReceiptId(uid,source,letterId));
      return db.runTransaction(async tx=>{
        const {actor,round}=await readyTransaction(tx,uid);
        const [mail,previous]=await Promise.all([tx.get(target),tx.get(receipt)]);
        if(!mail.exists||!canAcknowledgeMail(actor,
          source==='firebase-cloud'?effectiveCloudMail(mail.data(),round):mail.data(),source,letterId))
          deny('access_denied',403);
        if(!previous.exists)return {recorded:false,alreadyUnread:true};
        const row=previous.data();
        if(row?.viewerUid!==uid||row?.source!==source||row?.letterId!==letterId)
          deny('invalid_existing_receipt',409);
        tx.delete(receipt);
        return {recorded:false,alreadyUnread:false};
      });
    },

    async markRead(idToken,input){
      const uid=await uidFromToken(idToken);
      const source=input?.source;
      const letterId=input?.letterId;
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(k=>!['source','letterId'].includes(k))||
         !validMailIdentity(source,letterId))
        deny('invalid_receipt_request',400);
      const receiptId=mailReceiptId(uid,source,letterId);
      const target=source==='imported'
        ?stage.collection('letters').doc(hash('letter:'+letterId))
        :letters.doc(letterId);
      const receipt=readReceipts.doc(receiptId);
      return db.runTransaction(async tx=>{
        const {actor,round}=await readyTransaction(tx,uid);
        const [mail,previous]=await Promise.all([tx.get(target),tx.get(receipt)]);
        if(!mail.exists||!canAcknowledgeMail(actor,
          source==='firebase-cloud'?effectiveCloudMail(mail.data(),round):mail.data(),source,letterId))
          deny('access_denied',403);
        if(previous.exists){
          const row=previous.data();
          if(row?.viewerUid!==uid||row?.source!==source||
             row?.letterId!==letterId||typeof row?.readAt!=='string')
            deny('invalid_existing_receipt',409);
          return {recorded:true,alreadyRecorded:true,readAt:row.readAt};
        }
        const readAt=clock();
        if(typeof readAt!=='string'||!Number.isFinite(Date.parse(readAt)))
          deny('invalid_server_clock',503);
        tx.create(receipt,{
          source,letterId,viewerUid:uid,readAt,
          schemaVersion:1,
        });
        return {recorded:true,alreadyRecorded:false,readAt};
      });
    },

    /**
     * Full multi-recipient atomic delivery. Auth, every target House, each
     * idempotency document and the per-round quota are read before any write.
     * Retrying an already-complete batch never duplicates a recipient.
     */
    async sendBatch(idToken,input){
      const uid=await uidFromToken(idToken);
      if(!Array.isArray(input)||input.length<2||input.length>20)
        deny('invalid_mail_batch',400);
      const requests=input.map(validateRequest);
      const first=requests[0];
      const targets=new Set(),keys=new Set();
      for(const req of requests){
        const target=req.recipientKind+':'+(req.recipientHouseId??'narrator');
        const sameOptions=OPTION_KEYS.every(k=>req[k]===first[k]);
        if(keys.has(req.requestKey)||targets.has(target)||!sameOptions||
           req.originHouseId!==first.originHouseId||
           req.subject!==first.subject||req.content!==first.content||
           req.expectedCampaignDate!==first.expectedCampaignDate)
          deny('invalid_mail_batch',400);
        keys.add(req.requestKey);targets.add(target);
      }
      return db.runTransaction(async tx=>{
        const {actor,date,round}=await readyTransaction(tx,uid);
        if(first.expectedCampaignDate!==undefined&&
           first.expectedCampaignDate!==date)
          deny('campaign_date_changed',409);
        writerOnly(actor);
        if(actor.role==='narrador'){
          if(first.originHouseId!==null||
             requests.some(req=>req.recipientKind!=='house'))
            deny('recipient_not_allowed');
        }else if(!actor.editHouses.includes(first.originHouseId)){
          deny('origin_house_not_authorized');
        }
        checkRoleOptions(actor,first);
        const plan=deliveryPlan(actor.role,first,round);
        if(plan.error)deny(plan.error,400);
        const houseIds=[...new Set(requests.flatMap(req=>[
          req.originHouseId,req.recipientKind==='house'?req.recipientHouseId:null,
        ]).filter(Boolean))];
        const docRefs=houseIds.map(h=>
          stage.collection('houses').doc(hash('house:'+h)));
        const ids=requests.map(req=>hash('cloud-mail:'+uid+':'+req.requestKey));
        const mailRefs=ids.map(id=>letters.doc(id));
        const limitRef=limits.doc(hash('mail-count:'+uid+':'+round));
        const [houses,existing,counter]=await Promise.all([
          Promise.all(docRefs.map(ref=>tx.get(ref))),
          Promise.all(mailRefs.map(ref=>tx.get(ref))),
          tx.get(limitRef),
        ]);
        if(houses.some((doc,i)=>!doc.exists||doc.data()?.active!==true||
           doc.data()?.season!==2||doc.data()?.sourceId!==houseIds[i]))
          deny('house_unavailable',404);
        const fingerprints=requests.map(req=>hash(JSON.stringify(req)));
        const countExisting=existing.filter(d=>d.exists).length;
        if(countExisting!==0&&countExisting!==requests.length)
          deny('batch_partial_exists',409);
        if(countExisting===requests.length){
          if(existing.some((doc,i)=>doc.data()?.id!==ids[i]||
             doc.data()?.senderUid!==uid||
             doc.data()?.requestFingerprint!==fingerprints[i]))
            deny('request_key_conflict',409);
          return {ids,duplicate:true,state:existing[0].data().publicationState,
            deliveryRound:existing[0].data().deliveryRound};
        }
        for(const req of requests){
          try{await verifyMediaReferences({tx,root:runtime,snapshotId,uid,
            content:req.content});}
          catch(e){if(e instanceof MediaReferenceError)
            deny(e.code,e.status);throw e;}
        }
        const count=counter.exists?counter.data()?.count:0;
        if(!Number.isSafeInteger(count)||count<0||
           count+requests.length>MAX_MAIL_PER_ROUND)
          deny('mail_round_limit',429);
        const timestamp=clock();
        if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))
          deny('invalid_server_clock',503);
        // All Firestore reads above; only writes below.
        requests.forEach((req,i)=>{
          const id=ids[i],requestFingerprint=fingerprints[i];
          tx.create(mailRefs[i],{
            id,source:'firebase-cloud',sourceSnapshotId:snapshotId,
            requestKey:req.requestKey,requestFingerprint,
            senderUid:uid,senderPlayerId:actor.playerId,
            senderName:actor.role==='narrador'?'Narrador':'Jogador',
            originHouseId:req.originHouseId,recipientKind:req.recipientKind,
            recipientHouseId:req.recipientKind==='house'?req.recipientHouseId:null,
            recipientPlayerId:null,subject:req.subject,content:req.content,
            ...storedOptions(req),
            createdAt:timestamp,deliveredAt:plan.state==='delivered'?timestamp:null,
            campaignDate:date,creationRound:round,deliveryRound:plan.deliveryRound,
            publicationState:plan.state,deletedAt:null,version:1,
            batchKey:first.requestKey,
          });
          tx.create(audits.doc(id),{
            action:'send',actorUid:uid,letterId:id,requestFingerprint,
            occurredAt:timestamp,batchKey:first.requestKey,
          });
        });
        if(counter.exists)tx.update(limitRef,{count:count+requests.length});
        else tx.create(limitRef,{count:requests.length,round,actorUid:uid});
        return {ids,duplicate:false,state:plan.state,deliveryRound:plan.deliveryRound};
      });
    },

    async send(idToken,input){
      const uid=await uidFromToken(idToken);
      const req=validateRequest(input);
      if(req.recipientKind==='narrator'&&req.originHouseId===null)
        deny('invalid_origin_house',400);
      return db.runTransaction(async tx=>{
        const {actor,date,round}=await readyTransaction(tx,uid);
        return persist(tx,{uid,actor,date,round,req});
      });
    },

    async reply(idToken,input){
      const uid=await uidFromToken(idToken);
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(k=>!['requestKey','letterId','replyId','content','expectedCampaignDate','draft','signedBy'].includes(k))||
         (input.expectedCampaignDate!==undefined&&
          (typeof input.expectedCampaignDate!=='string'||
           !/^\d{4}-(?:\d{2}-\d{2}|F-[a-z-]+)$/.test(input.expectedCampaignDate)))||
         !validId(input.letterId)||
      (input.replyId!==undefined&&!validId(input.replyId))||
         typeof input.requestKey!=='string'||!REQUEST_KEY.test(input.requestKey)||
         !validText(input.content,MAX_CONTENT_BYTES))
        deny('invalid_reply_request',400);
      return db.runTransaction(async tx=>{
        const {actor,date,round}=await readyTransaction(tx,uid);
        writerOnly(actor);
        if(input.expectedCampaignDate!==undefined&&
           input.expectedCampaignDate!==date)
          deny('campaign_date_changed',409);
        const {parent,route,replyToId,threadRootId}=
          await resolveReply(tx,actor,input,round);
        // Subject and delivery address come solely from the original letter.
        const base=parent.subject;
        const prefix=/^Re:\s/i.test(base)?'':'Re: ';
        const chars=Array.from(base);
        while(chars.length&&Buffer.byteLength(prefix+chars.join(''),'utf8')>
              MAX_SUBJECT_BYTES)chars.pop();
        const req=validateRequest({
          requestKey:input.requestKey,...route,
          subject:prefix+chars.join(''),content:input.content,
          ...(input.draft!==undefined?{draft:input.draft}:{}),
          ...(input.signedBy!==undefined?{signedBy:input.signedBy}:{}),
          ...(input.expectedCampaignDate!==undefined?
            {expectedCampaignDate:input.expectedCampaignDate}:{}),
        });
        return persist(tx,{uid,actor,date,round,req,replyToId,threadRootId});
      });
    },
  };
}

