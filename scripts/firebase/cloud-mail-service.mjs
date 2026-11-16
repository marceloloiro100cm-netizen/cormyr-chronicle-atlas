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
     (v.recipientKind==='narrator'&&v.recipientHouseId!==null))
    deny('invalid_mail_request',400);
  return {
    requestKey:v.requestKey,
    originHouseId:v.originHouseId,
    recipientKind:v.recipientKind,
    recipientHouseId:v.recipientHouseId,
    subject:v.subject.trim(),
    content:v.content,
  };
}

function runtimeActive(v,snapshotId,calendar){
  if(!v||v.status!=='active'||v.private!==true||
     v.sourceSnapshotId!==snapshotId||
     v.sourceSnapshotReconciled!==true||
     v.mailWriteApproved!==true||v.applicationEnabled!==true||
     !Number.isInteger(v.openRound)||v.openRound<1||
     !Number.isInteger(v.calendarVersion)||
     v.calendarVersion!==calendar.version)
    deny('mail_runtime_not_approved',503);
}

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
  const access=stage.collection('access');
  const letters=runtime.collection('letters');
  const audits=runtime.collection('mailAudits');
  const limits=runtime.collection('mailSenderRoundCounts');

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
  async function readyTransaction(tx,uid){
    const [domain,authRoot,temporal,scopeDoc,calendar,live]=await Promise.all([
      tx.get(stage),tx.get(authStage),tx.get(timeStage),
      tx.get(access.doc(uid)),
      tx.get(timeStage.collection('calendar').doc('current')),tx.get(runtime),
    ]);
    for(const doc of [domain,authRoot,temporal])
      if(!doc.exists||doc.data()?.status!=='complete'||
         doc.data()?.private!==true)
        deny('migration_stage_not_ready',503);
    if(!calendar.exists||!Number.isInteger(calendar.data()?.version))
      deny('calendar_unavailable',503);
    const campaignDate=campaignDateOf(calendar.data());
    const actor=accessOf(uid,scopeDoc.data());
    runtimeActive(live.data(),snapshotId,calendar.data());
    return {actor,date:campaignDate,round:live.data().openRound};
  }

  return {
    async status(idToken){
      const uid=await uidFromToken(idToken);
      const doc=await access.doc(uid).get();
      const actor=accessOf(uid,doc.data());
      // Do not expose runtime metadata, UIDs or unreconciled documents.
      const live=await runtime.get();
      const writable=live.exists&&live.data()?.status==='active'&&
        live.data()?.sourceSnapshotReconciled===true&&
        live.data()?.mailWriteApproved===true&&
        live.data()?.applicationEnabled===true;
      return {enabled:Boolean(writable),
        canSend:Boolean(writable&&(actor.role==='narrador'||actor.editHouses.length>0)),
        originHouseIds:actor.editHouses,
        readOnly:!writable};
    },

    async send(idToken,input){
      const uid=await uidFromToken(idToken);
      const req=validateRequest(input);
      if(req.recipientKind==='narrator'&&req.originHouseId===null)
        deny('invalid_origin_house',400);
      const fingerprint=hash(JSON.stringify(req));
      const id=hash('cloud-mail:'+uid+':'+req.requestKey);
      const ref=letters.doc(id);
      const audit=audits.doc(id);
      return db.runTransaction(async tx=>{
        const {actor,date,round}=await readyTransaction(tx,uid);
        if(actor.role==='narrador'){
          if(req.originHouseId!==null||req.recipientKind!=='house')
            deny('recipient_not_allowed');
        }else{
          if(!actor.editHouses.includes(req.originHouseId))
            deny('origin_house_not_authorized');
        }
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
          subject:req.subject,content:req.content,
          createdAt:timestamp,deliveredAt:timestamp,
          campaignDate:date,creationRound:round,deliveryRound:round,
          publicationState:'delivered',deletedAt:null,version:1,
        });
        tx.create(audit,{action:'send',actorUid:uid,letterId:id,
          requestFingerprint:fingerprint,occurredAt:timestamp});
        if(counter.exists)tx.update(limitRef,{count:n+1});
        else tx.create(limitRef,{count:1,round,actorUid:uid});
        return {id,duplicate:false,state:'delivered',deliveryRound:round};
      });
    },
  };
}
