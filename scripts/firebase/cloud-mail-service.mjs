/**
 * Cormyr Firebase Cloud — opt-in mail writes to a SEPARATE operational area.
 *
 * Historical migration* snapshots are NEVER mutated. This is NOT the
 * emulator command service. Enabling the environment flag alone is
 * insufficient: the private operational root must explicitly attest that the
 * source has been reconciled and that mail writes are approved.
 * No Supabase code, credentials, imports, or fallback exists here.
 */
import {createHash} from 'node:crypto';
import {createFirebaseCloudReadonly,CloudAccessError} from './cloud-readonly-service.mjs';

const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SAFE_ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const hex=value=>createHash('sha256').update(value).digest('hex');
const reject=(code,status=403)=>{throw new CloudAccessError(code,status);};

export const CLOUD_MAIL_RUNTIME='campaignMailRuntime';

/** Runtime root is a deliberate authorization switch, not a staging marker. */
export function mailRuntimeReady(data,snapshotId){
  return data?.status==='active'&&data.private===true&&
    data.sourceSnapshotId===snapshotId&&data.sourceLiveReconciled===true&&
    data.applicationEnabled===true&&data.mailEnabled===true;
}

function normalizeSend(input){
  if(!input||typeof input!=='object'||Array.isArray(input))reject('invalid_request',400);
  const allowed=['requestKey','originHouseId','recipient','subject','content'];
  if(Object.keys(input).some(key=>!allowed.includes(key)))
    reject('invalid_request',400);
  const requestKey=input.requestKey;
  const originHouseId=input.originHouseId??null;
  const recipient=input.recipient;
  const subject=input.subject;
  const content=input.content;
  if(typeof requestKey!=='string'||!UUID.test(requestKey)||
     (originHouseId!==null&&(typeof originHouseId!=='string'||!SAFE_ID.test(originHouseId)))||
     typeof recipient!=='string'||!(
       recipient==='narrator'||recipient.startsWith('h:')&&SAFE_ID.test(recipient.slice(2))
     )||
     typeof subject!=='string'||subject.trim().length<1||subject.trim().length>180||
     Buffer.byteLength(subject,'utf8')>540||
     typeof content!=='string'||content.trim().length<1||
     Buffer.byteLength(content,'utf8')>12000)
    reject('invalid_request',400);
  return {requestKey,originHouseId,recipient,subject:subject.trim(),content};
}

function currentScope(uid,data){
  if(!data||data.userId!==uid||data.active!==true||
     data.requirePasswordChange!==false)reject('access_denied');
  if(data.profile==='narrador'&&data.admin===true)
    return {uid,profile:'narrador',editHouseIds:[]};
  if(data.profile!=='jogador'||data.admin!==false||
     typeof data.playerId!=='string'||!SAFE_ID.test(data.playerId)||
     !Array.isArray(data.memberHouseIds)||!Array.isArray(data.editHouseIds)||
     data.memberHouseIds.some(id=>typeof id!=='string'||!SAFE_ID.test(id))||
     data.editHouseIds.some(id=>typeof id!=='string'||!SAFE_ID.test(id)||
       !data.memberHouseIds.includes(id)))
    reject('access_denied');
  return {uid,profile:'jogador',editHouseIds:data.editHouseIds};
}

function gameDate(cal){
  if(!cal||!Number.isInteger(cal.year)||cal.year<1||cal.year>9999||
     !Number.isInteger(cal.month)||cal.month<0||cal.month>11||
     !Number.isInteger(cal.day)||cal.day<1||cal.day>30)
    reject('calendar_unavailable',503);
  const y=String(cal.year).padStart(4,'0');
  if(cal.festival!==null&&cal.festival!==undefined){
    if(typeof cal.festival!=='string'||
       !/^(midwinter|greengrass|midsummer|shieldmeet|highharvestide|feast-moon)$/.test(cal.festival))
      reject('calendar_unavailable',503);
    return y+'-F-'+cal.festival;
  }
  return y+'-'+String(cal.month+1).padStart(2,'0')+'-'+String(cal.day).padStart(2,'0');
}

export function createFirebaseCloudMail({
  auth,db,snapshotId,projectId,enabled=false,env=process.env,
  clock=()=>new Date(),
}){
  if(enabled!==true||projectId!=='cormyr'||!HASH.test(snapshotId??'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function')
    reject('firebase_mail_disabled',503);
  const reads=createFirebaseCloudReadonly({
    auth,db,snapshotId,projectId,enabled:true,env,
  });
  const root=db.collection(CLOUD_MAIL_RUNTIME).doc(snapshotId);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const engine=db.collection('migrationTimeEngineStage').doc(snapshotId);

  async function status(idToken){
    const scope=await reads.authorize(idToken);
    const state=await root.get();
    const ready=state.exists&&mailRuntimeReady(state.data(),snapshotId);
    return {ready:Boolean(ready),
      canCompose:Boolean(ready&&(scope.profile==='narrador'||
        scope.profile==='jogador'&&scope.editHouseIds.length>0)),
      originHouseIds:scope.profile==='jogador'?scope.editHouseIds:[],
      readOnly:!ready};
  }

  async function send(idToken,input){
    const original=await reads.authorize(idToken);
    if(original.profile==='editor')reject('access_denied');
    const data=normalizeSend(input);
    if(original.profile==='narrador'&&
       (data.originHouseId!==null||data.recipient==='narrator'))
      reject('access_denied');
    if(original.profile==='jogador'&&
       (!data.originHouseId||!original.editHouseIds.includes(data.originHouseId)))
      reject('access_denied');
    const recipientHouse=data.recipient.startsWith('h:')?data.recipient.slice(2):null;
    const opId=hex('firebase-mail-v1:'+original.uid+':'+data.requestKey);
    const fingerprint=hex(JSON.stringify({
      originHouseId:data.originHouseId,recipient:data.recipient,
      subject:data.subject,content:data.content,
    }));
    const letterRef=root.collection('letters').doc(opId);
    const throttleRef=root.collection('sendThrottle').doc(original.uid);
    const accessRef=domain.collection('access').doc(original.uid);
    const calRef=engine.collection('calendar').doc('current');
    const houseRef=recipientHouse?domain.collection('houses')
      .doc(hex('house:'+recipientHouse)):null;
    const originRef=data.originHouseId?domain.collection('houses')
      .doc(hex('house:'+data.originHouseId)):null;
    return db.runTransaction(async transaction=>{
      // Every authorization is re-read within the transaction; replay cannot
      // bypass permission changes or produce a duplicate write.
      const [runtime,stage,time,access,calendar,existing,throttle,target,origin]=
        await Promise.all([
          transaction.get(root),transaction.get(domain),transaction.get(engine),
          transaction.get(accessRef),transaction.get(calRef),
          transaction.get(letterRef),transaction.get(throttleRef),
          houseRef?transaction.get(houseRef):Promise.resolve(null),
          originRef?transaction.get(originRef):Promise.resolve(null),
        ]);
      if(!runtime.exists||!mailRuntimeReady(runtime.data(),snapshotId)||
         !stage.exists||stage.data()?.status!=='complete'||stage.data()?.private!==true||
         !time.exists||time.data()?.status!=='complete'||time.data()?.private!==true||
         !access.exists)
        reject('firebase_mail_not_ready',503);
      const actor=currentScope(original.uid,access.data());
      if(actor.profile!==original.profile)reject('access_denied');
      if(actor.profile==='jogador'&&(!data.originHouseId||
         !actor.editHouseIds.includes(data.originHouseId)))reject('access_denied');
      if(actor.profile==='narrador'&&
         (data.originHouseId!==null||data.recipient==='narrator'))
        reject('access_denied');
      if(originRef&&(!origin?.exists||origin.data()?.active!==true||
         origin.data()?.sourceId!==data.originHouseId))reject('invalid_origin_house',400);
      if(houseRef&&(!target?.exists||target.data()?.active!==true||
         target.data()?.sourceId!==recipientHouse))reject('invalid_recipient',400);
      if(existing.exists){
        const old=existing.data();
        if(old?.senderUid!==actor.uid||old?.requestFingerprint!==fingerprint)
          reject('operation_key_conflict',409);
        return {id:opId,duplicate:true,delivered:true};
      }
      const date=gameDate(calendar.data());
      const value=clock();
      if(!(value instanceof Date)||!Number.isFinite(value.getTime()))
        reject('clock_unavailable',503);
      const nowMs=value.getTime();
      const last=throttle.data()?.lastSentAtMs;
      if(throttle.exists&&Number.isFinite(last)&&
         nowMs-last<10000)reject('send_rate_limited',429);
      const at=value.toISOString();
      transaction.create(letterRef,{
        id:opId,source:'firebase-cloud',schemaVersion:1,
        senderUid:actor.uid,senderName:actor.profile==='narrador'?'Narrador':null,
        originHouseId:data.originHouseId,
        recipientKind:recipientHouse?'house':'narrator',
        recipientHouseId:recipientHouse,
        recipientPlayerId:null,
        subject:data.subject,content:data.content,
        publicationState:'delivered',createdAt:at,deliveredAt:at,
        deletedAt:null,campaignDate:date,
        requestKey:data.requestKey,requestFingerprint:fingerprint,
      });
      transaction.set(throttleRef,{uid:actor.uid,lastSentAtMs:nowMs});
      return {id:opId,duplicate:false,delivered:true};
    });
  }

  return Object.freeze({status,send});
}
