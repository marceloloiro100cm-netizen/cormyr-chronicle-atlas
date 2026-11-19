import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
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

const SNAPSHOT=/^[a-f0-9]{64}$/;
const SAFE_ID=/^[^/\u0000-\u001f]{1,128}$/;
const REQUEST_KEY=/^[a-zA-Z0-9_-]{8,128}$/;
const MAX_CONTENT_BYTES=20_000;
const MAX_SUBJECT_BYTES=180;
const MAX_MAIL_PER_ROUND=100;

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
  if(v.profile!=='jogador'||v.admin!==false||!validId(v.playerId)||
     !Array.isArray(v.memberHouseIds)||!Array.isArray(v.editHouseIds)||
     v.memberHouseIds.length>250||v.editHouseIds.length>250||
     !v.memberHouseIds.every(validId)||!v.editHouseIds.every(validId)||
     v.editHouseIds.some(x=>!v.memberHouseIds.includes(x)))
    deny('access_denied');
  return {uid,role:'jogador',playerId:v.playerId,
    memberHouses:v.memberHouseIds,editHouses:v.editHouseIds};
}

function validateRequest(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
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
  return {
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
    const [domain,authRoot,temporal,scopeDoc,calendar,live,mailGate]=await Promise.all([
      tx.get(stage),tx.get(authStage),tx.get(timeStage),
      tx.get(access.doc(uid)),
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
    const actor=accessOf(uid,scopeDoc.data());
    // Every active player membership is verified against its exact House
    // document INSIDE the same transaction as mail authorization.
    await verifyMemberHouses(actor,ref=>tx.get(ref));
    if(!cloudMailRuntimeApproved(live.data(),mailGate.data(),
      calendar.data(),snapshotId))deny('mail_runtime_not_approved',503);
    return {actor,date:campaignDate,round:live.data().openRound};
  }


  // All Cloud writes use the same atomic idempotency, House validation,
  // rate limit and immutable migration-source safeguards.
  async function persist(tx,{uid,actor,date,round,req,replyToId=null}){
    // Original composer submits an explicit campaign date. Compare it inside
    // the same transaction to prevent a clock rollover from misdating a letter.
    if(req.expectedCampaignDate!==undefined&&req.expectedCampaignDate!==date)
      deny('campaign_date_changed',409);
    if(actor.role==='narrador'){
      if(req.originHouseId!==null||req.recipientKind!=='house')
        deny('recipient_not_allowed');
    }else if(!actor.editHouses.includes(req.originHouseId)){
      deny('origin_house_not_authorized');
    }
    const fingerprint=hash(JSON.stringify(replyToId?{...req,replyToId}:req));
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
          senderName:actor.role==='narrador'?'Narrador':'Jogador',
          originHouseId:req.originHouseId,
          recipientKind:req.recipientKind,
          recipientHouseId:req.recipientKind==='house'?req.recipientHouseId:null,
          recipientPlayerId:null,
          ...(replyToId?{replyToId,threadRootId:replyToId}:{}),
          subject:req.subject,content:req.content,
          createdAt:timestamp,deliveredAt:timestamp,
          campaignDate:date,creationRound:round,deliveryRound:round,
          publicationState:'delivered',deletedAt:null,version:1,
        });
        tx.create(audit,{action:replyToId?'reply':'send',actorUid:uid,letterId:id,
          ...(replyToId?{replyToId}:{}),
          requestFingerprint:fingerprint,occurredAt:timestamp});
        if(counter.exists)tx.update(limitRef,{count:n+1});
        else tx.create(limitRef,{count:1,round,actorUid:uid});
        return {id,duplicate:false,state:'delivered',deliveryRound:round};

  }

  return {
    async status(idToken){
      const uid=await uidFromToken(idToken);
      const [doc,domain,authRoot,temporal,cal,live,mailGate]=await Promise.all([
        access.doc(uid).get(),stage.get(),authStage.get(),timeStage.get(),
        timeStage.collection('calendar').doc('current').get(),runtime.get(),
        mailRuntime.get(),
      ]);
      const actor=accessOf(uid,doc.data());
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
        const {actor}=await readyTransaction(tx,uid);
        const [mail,previous]=await Promise.all([tx.get(target),tx.get(receipt)]);
        if(!mail.exists||!canAcknowledgeMail(actor,mail.data(),source,letterId))
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
         Object.keys(input).some(k=>!['requestKey','letterId','content'].includes(k))||
         typeof input.letterId!=='string'||!SNAPSHOT.test(input.letterId)||
         typeof input.requestKey!=='string'||!REQUEST_KEY.test(input.requestKey)||
         !validText(input.content,MAX_CONTENT_BYTES))
        deny('invalid_reply_request',400);
      return db.runTransaction(async tx=>{
        const {actor,date,round}=await readyTransaction(tx,uid);
        const original=await tx.get(letters.doc(input.letterId));
        const route=original.exists
          ?cloudReplyRoute(actor,original.data(),snapshotId):null;
        if(!route||original.data()?.id!==input.letterId)
          deny('reply_not_authorized',403);
        // Subject and delivery address come solely from the original letter.
        const base=original.data().subject;
        const prefix=/^Re:\s/i.test(base)?'':'Re: ';
        const chars=Array.from(base);
        while(chars.length&&Buffer.byteLength(prefix+chars.join(''),'utf8')>
              MAX_SUBJECT_BYTES)chars.pop();
        const req=validateRequest({
          requestKey:input.requestKey,...route,
          subject:prefix+chars.join(''),content:input.content,
        });
        return persist(tx,{uid,actor,date,round,req,replyToId:input.letterId});
      });
    },
  };
}

