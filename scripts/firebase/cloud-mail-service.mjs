/**
 * Firebase CLOUD mail writes, separate from immutable migration* snapshots.
 *
 * This endpoint has no Supabase fallback or emulator adapter. No self-service
 * activation: campaignRuntime/<snapshot> must be explicitly initialized by a
 * privileged operator after source reconciliation and Firebase-only cutover.
 * Client Firestore SDK rules must continue to deny these collections.
 */
import {createHash} from 'node:crypto';

const HASH=/^[a-f0-9]{64}$/;
const SAFE_ID=/^[^/\u0000-\u001f]{1,128}$/;
const OPERATION_KEY=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_BODY=20_000;
const DAILY_QUOTA=50;
const MIN_INTERVAL_MS=5000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);

export class CloudMailError extends Error {
  constructor(code,status=403){
    super(code);
    this.name='CloudMailError';
    this.code=code;
    this.status=status;
  }
}
const deny=(code,status)=>{throw new CloudMailError(code,status);};
const isText=(value,max)=>typeof value==='string'&&
  value.trim().length>0&&Buffer.byteLength(value,'utf8')<=max;
const isId=value=>typeof value==='string'&&SAFE_ID.test(value);

export function validateCloudMailRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>![
       'requestKey','originHouseId','recipientHouseId','toNarrator','subject','content',
     ].includes(k)))deny('invalid_request',400);

  const {requestKey,originHouseId=null,recipientHouseId=null,
    toNarrator=false,subject,content}=input;

  if(typeof requestKey!=='string'||!OPERATION_KEY.test(requestKey)||
     !isText(subject,180)||!isText(content,MAX_BODY)||
     (originHouseId!==null&&!isId(originHouseId))||
     (recipientHouseId!==null&&!isId(recipientHouseId))||
     typeof toNarrator!=='boolean'||
     Boolean(recipientHouseId)===toNarrator)
    deny('invalid_request',400);

  return {
    requestKey:requestKey.toLowerCase(),originHouseId,recipientHouseId,
    toNarrator,subject:subject.trim(),content,
  };
}

/** Entire service is server-only. It never accepts a client selected snapshot. */
export function createCloudMailService({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,clock=()=>new Date(),
}){
  if(!enabled||projectId!=='cormyr'||!HASH.test(snapshotId||'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||
     typeof auth?.getUser!=='function')
    deny('firebase_cloud_mail_disabled',503);

  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const authStage=db.collection('migrationAuthStage').doc(snapshotId);
  const calendarRoot=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const runtime=db.collection('campaignRuntime').doc(snapshotId);
  const access=domain.collection('access');
  const houses=domain.collection('houses');
  const mail=runtime.collection('letters');
  const quotas=runtime.collection('mailQuotas');

  async function verify(idToken){
    if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
      deny('authentication_required',401);
    let token,user;
    try{
      token=await auth.verifyIdToken(idToken,true);
      if(!isId(token?.uid))throw Error('invalid_uid');
      user=await auth.getUser(token.uid);
    }catch{deny('authentication_required',401);}
    if(user?.disabled===true||user?.uid!==token.uid)
      deny('authentication_required',401);
    return token.uid;
  }

  function ensureScope(uid,doc){
    if(!doc?.exists)deny('access_denied',403);
    const v=doc.data();
    if(!v||v.userId!==uid||v.active!==true||
       v.requirePasswordChange!==false)deny('access_denied',403);
    if(v.profile==='narrador'&&v.admin===true)
      return {uid,role:'narrador',editHouseIds:new Set()};
    if(v.profile!=='jogador'||v.admin!==false||
       typeof v.playerId!=='string'||!isId(v.playerId)||
       !Array.isArray(v.memberHouseIds)||!Array.isArray(v.editHouseIds)||
       !v.memberHouseIds.every(isId)||!v.editHouseIds.every(isId)||
       v.editHouseIds.some(id=>!v.memberHouseIds.includes(id)))
      deny('access_denied',403);
    return {uid,role:'jogador',editHouseIds:new Set(v.editHouseIds)};
  }

  function complete(root){
    return root?.exists&&root.data()?.status==='complete'&&
      root.data()?.private===true;
  }
  function activated(root,calendar){
    const data=root?.data();
    return root?.exists&&data?.status==='active'&&
      data?.private===true&&data?.sourceSnapshotId===snapshotId&&
      data?.mode==='firebase-only'&&data?.writesEnabled===true&&
      data?.sourceLiveReconciled===true&&data?.readyForCutover===true&&
      Number.isInteger(data?.calendarVersion)&&
      data.calendarVersion===calendar.version;
  }
  function dateOf(snap){
    const c=snap?.data();
    if(!snap?.exists||!Number.isInteger(c?.year)||!Number.isInteger(c?.month)||
       !Number.isInteger(c?.day)||!Number.isInteger(c?.version)||
       c.year<1||c.month<0||c.month>11||c.day<1||c.day>30)
      deny('calendar_not_ready',503);
    return c;
  }
  const ready=async()=>{
    const [a,b,c,d,e]=await Promise.all([
      domain.get(),authStage.get(),calendarRoot.get(),runtime.get(),
      calendarRoot.collection('calendar').doc('current').get(),
    ]);
    if(!complete(a)||!complete(b)||!complete(c))deny('migration_stage_not_ready',503);
    const calendar=dateOf(e);
    if(!activated(d,calendar))deny('cloud_mail_cutover_not_ready',503);
    return calendar;
  };

  async function send(idToken,input){
    const request=validateCloudMailRequest(input);
    const uid=await verify(idToken);
    // Fail before starting transaction if the explicit cutover gate is absent.
    await ready();
    const id=digest('cloud-mail:'+uid+':'+request.requestKey);
    const fingerprint=digest(JSON.stringify(request));
    const doc=mail.doc(id);
    const quota=quotas.doc(digest('cloud-mail-quota:'+uid));
    const time=clock();
    if(!(time instanceof Date)||!Number.isFinite(time.getTime()))
      deny('clock_unavailable',503);
    const now=time.toISOString();
    const day=now.slice(0,10);

    return db.runTransaction(async tx=>{
      const [stage,authRoot,timeRoot,root,calendarDoc,scopeDoc,existing,limit]=
        await Promise.all([
          tx.get(domain),tx.get(authStage),tx.get(calendarRoot),
          tx.get(runtime),
          tx.get(calendarRoot.collection('calendar').doc('current')),
          tx.get(access.doc(uid)),tx.get(doc),tx.get(quota),
        ]);
      if(!complete(stage)||!complete(authRoot)||!complete(timeRoot))
        deny('migration_stage_not_ready',503);
      const calendar=dateOf(calendarDoc);
      if(!activated(root,calendar))deny('cloud_mail_cutover_not_ready',503);

      const actor=ensureScope(uid,scopeDoc);
      if(existing.exists){
        const old=existing.data();
        if(old?.senderUid!==uid||old?.requestFingerprint!==fingerprint)
          deny('idempotency_conflict',409);
        return {id,duplicate:true,publicationState:old.publicationState,
          campaignDate:old.campaignDate};
      }
      if(actor.role==='narrador'){
        if(request.originHouseId!==null||request.toNarrator)
          deny('access_denied',403);
      }else if(!request.originHouseId||
        !actor.editHouseIds.has(request.originHouseId))
        deny('access_denied',403);

      const required=actor.role==='jogador'?[
        houses.doc(digest('house:'+request.originHouseId)),
      ]:[];
      if(!request.toNarrator)
        required.push(houses.doc(digest('house:'+request.recipientHouseId)));
      const houseDocs=await Promise.all(required.map(ref=>tx.get(ref)));
      if(houseDocs.some((doc,i)=>!doc.exists||doc.data()?.active!==true||
         doc.data()?.sourceId!==(
           actor.role==='jogador'&&i===0?request.originHouseId:request.recipientHouseId
         )||doc.data()?.season!==2))
        deny('house_unavailable',404);

      const q=limit.exists?limit.data():null;
      const count=q?.day===day?(q.count??0):0;
      if(!Number.isInteger(count)||count<0||count>=DAILY_QUOTA)
        deny('mail_quota_exceeded',429);
      if(q?.day===day&&typeof q.lastSendAt==='string'&&
         time.getTime()-Date.parse(q.lastSendAt)<MIN_INTERVAL_MS)
        deny('mail_rate_limited',429);

      const campaignDate={year:calendar.year,month:calendar.month,
        day:calendar.day,festival:calendar.festival??null,
        calendarVersion:calendar.version};
      tx.create(doc,{
        id,senderUid:uid,originHouseId:request.originHouseId,
        recipientKind:request.toNarrator?'narrator':'house',
        recipientHouseId:request.recipientHouseId,
        senderName:actor.role==='narrador'?'Narrador':null,
        subject:request.subject,content:request.content,
        createdAt:now,deliveredAt:now,publicationState:'delivered',
        deletedAt:null,requestFingerprint:fingerprint,
        requestKeyHash:digest(request.requestKey),
        campaignDate,version:1,
      });
      tx.set(quota,{day,count:count+1,lastSendAt:now});
      return {id,duplicate:false,publicationState:'delivered',campaignDate};
    });
  }
  return Object.freeze({send});
}
