/**
 * Cormyr Firebase — mail command engine. Isolated Firestore Emulator ONLY.
 *
 * No public endpoint. Source letters/replies, Supabase, Firebase Cloud and
 * historic archive remain immutable. Client SDKs cannot write this namespace.
 * New messages are immutable once delivered, except soft-delete/restore
 * (audited and restricted); edits require a draft + expected version.
 */
import {createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {validateHarptosDate} from './stage-temporal-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const KEY=/^[a-zA-Z0-9_-]{8,128}$/;
const MAX_SCAN=2000;
const MAX_CONTENT=100_000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
const deny=()=>{throw new MailCommandDenied();};
const validText=(v,max=MAX_CONTENT)=>typeof v==='string'&&
  v.trim().length>0&&Buffer.byteLength(v,'utf8')<=max;
const dateKey=v=>{
  if(typeof v!=='string')return false;
  const regular=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if(regular)return validateHarptosDate(
    Number(regular[1]),Number(regular[2])-1,Number(regular[3]),null);
  const festivals=/^(\d{4})-F-(midwinter|greengrass|midsummer|shieldmeet|highharvestide|feast-moon)$/.exec(v);
  if(!festivals)return false;
  const month={
    midwinter:0,greengrass:3,midsummer:6,shieldmeet:6,
    highharvestide:8,'feast-moon':10,
  }[festivals[2]];
  return validateHarptosDate(Number(festivals[1]),month,1,festivals[2]);
};
const id=v=>typeof v==='string'&&HASH.test(v);
const key=v=>typeof v==='string'&&KEY.test(v);
const canSee=(record,actor)=>{
  if(!record||record.deletedAt!==null)return false;
  if(record.publicationState!=='delivered'&&record.senderUid!==actor.uid)
    return false;
  if(actor.role==='narrador')return true;
  if(record.senderUid===actor.uid)return true;
  if(record.recipientKind==='narrator')return false;
  if(record.recipientKind==='house')
    return actor.memberHouseIds.has(record.recipientHouseId);
  return record.recipientKind==='player'&&
    record.recipientPlayerId===actor.playerId;
};
const canReadImported=(letter,actor)=>{
  if(!letter||letter.publicationState!=='delivered'||
     letter.deletedAt!==null||typeof letter.senderUid!=='string')return false;
  const toPlayer=typeof letter.recipientPlayerId==='string'&&
    letter.recipientPlayerId.length>0;
  const toHouse=typeof letter.recipientHouseId==='string'&&
    letter.recipientHouseId.length>0;
  if(toPlayer===toHouse)return false;
  return actor.role==='narrador'||letter.senderUid===actor.uid||
    (toPlayer&&letter.recipientPlayerId===actor.playerId)||
    (toHouse&&actor.memberHouseIds.has(letter.recipientHouseId));
};
const eligibleToSend=(actor,origin)=>{
  if(actor.role==='narrador')return true;
  return typeof origin==='string'&&actor.editHouseIds.has(origin);
};
export class MailCommandDenied extends Error {
  constructor(){super('Mail command access denied');this.name='MailCommandDenied';}
}
function scope(uid,raw){
  if(!raw||raw.userId!==uid||raw.active!==true||
     raw.requirePasswordChange===true)deny();
  if(raw.profile==='narrador'&&raw.admin===true)
    return {role:'narrador',uid,playerId:null,
      memberHouseIds:new Set(),editHouseIds:new Set()};
  if(raw.profile!=='jogador'||raw.admin!==false||
     typeof raw.playerId!=='string'||!raw.playerId||
     !Array.isArray(raw.memberHouseIds)||!Array.isArray(raw.editHouseIds)||
     !raw.memberHouseIds.every(x=>typeof x==='string'&&x.length>0&&x.length<=512)||
     !raw.editHouseIds.every(x=>typeof x==='string'&&x.length>0&&x.length<=512)||
     raw.editHouseIds.some(x=>!raw.memberHouseIds.includes(x)))deny();
  return {role:'jogador',uid,playerId:raw.playerId,
    memberHouseIds:new Set(raw.memberHouseIds),
    editHouseIds:new Set(raw.editHouseIds)};
}
const targetOf=value=>{
  if(value==='narrator')return {kind:'narrator',id:'narrator'};
  if(typeof value==='string'&&value.startsWith('h:')&&
     value.length>2&&value.length<=514)
    return {kind:'house',id:value.slice(2)};
  throw Error('Invalid mail recipient');
};
const preview=r=>({
  id:r.id,kind:r.kind||'letter',subject:r.subject??null,
  content:r.content,createdAt:r.createdAt,
  campaignDate:r.campaignDate??null,senderUid:r.senderUid,
  originHouseId:r.originHouseId??null,
  creationRound:r.creationRound??null,
  deliveredAt:r.deliveredAt??null,
  senderName:r.senderName,recipientKind:r.recipientKind??null,
  recipientHouseId:r.recipientHouseId??null,
  recipientPlayerId:r.recipientPlayerId??null,
  recipientUid:r.recipientUid??null,
  parentId:r.parentId??null,replyToId:r.replyToId??null,
  publicationState:r.publicationState,deliveryRound:r.deliveryRound??null,
  version:r.version,deletedAt:r.deletedAt,
});

export function createEmulatorMailCommands({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!id(snapshotId)||typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||
     typeof auth?.getUser!=='function')
    throw Error('Invalid isolated mail configuration');
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const temporal=db.collection('migrationTemporalStage').doc(snapshotId);
  const history=db.collection('migrationMailHistoryStage').doc(snapshotId);
  const runtime=db.collection('migrationMailRuntimeStage').doc(snapshotId);
  const access=domain.collection('access');
  const sourceLetters=domain.collection('letters');
  const letters=runtime.collection('letters');
  const replies=runtime.collection('replies');
  const rounds=runtime.collection('rounds');
  const audits=runtime.collection('audits');

  async function identify(idToken){
    if(typeof idToken!=='string'||!idToken||idToken.length>10000)deny();
    let decoded,user;
    try{
      decoded=await auth.verifyIdToken(idToken,true);
      if(typeof decoded?.uid!=='string'||!decoded.uid)deny();
      user=await auth.getUser(decoded.uid);
    }catch{deny();}
    if(!user||user.uid!==decoded.uid||user.disabled)deny();
    const [ready,current]=await Promise.all([
      domain.get(),access.doc(decoded.uid).get(),
    ]);
    if(!ready.exists||ready.data()?.status!=='complete'||!current.exists)
      deny();
    return scope(decoded.uid,current.data());
  }
  async function inTransaction(transaction,actor){
    const [ready,current,state]=await Promise.all([
      transaction.get(domain),transaction.get(access.doc(actor.uid)),
      transaction.get(runtime),
    ]);
    if(!ready.exists||ready.data()?.status!=='complete'||
       !current.exists||!state.exists||
       state.data()?.status!=='active')deny();
    const fresh=scope(actor.uid,current.data());
    if(fresh.role!==actor.role)deny();
    return {actor:fresh,state:state.data()};
  }
  /** Minimal form options, from current server permissions, never token claims. */
  async function session({idToken}={}){
    const actor=await identify(idToken);
    return db.runTransaction(async t=>{
      const [ready,current,runtimeDoc,houses]=await Promise.all([
        t.get(domain),t.get(access.doc(actor.uid)),t.get(runtime),
        t.get(domain.collection('houses').where('active','==',true)
          .where('season','==',2).limit(MAX_SCAN+1)),
      ]);
      if(!ready.exists||ready.data()?.status!=='complete'||!current.exists)deny();
      const fresh=scope(actor.uid,current.data());
      if(fresh.role!==actor.role||houses.size>MAX_SCAN)deny();
      const options=houses.docs.map(d=>d.data()).filter(h=>
        typeof h.sourceId==='string'&&typeof h.name==='string')
        .map(h=>({id:h.sourceId,name:h.name}))
        .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
      const readyToUse=runtimeDoc.exists&&runtimeDoc.data()?.status==='active';
      const state=readyToUse?runtimeDoc.data():null;
      return {role:fresh.role,initialized:readyToUse,
        canCompose:fresh.role==='narrador'||options.some(h=>fresh.editHouseIds.has(h.id)),
        originHouses:options.filter(h=>fresh.editHouseIds.has(h.id)),
        recipientHouses:options,
        openRound:state?.openRound??null,lastRound:state?.lastRound??null,
      };
    });
  }
  /**
   * Narrator explicitly initializes a distinct TEST runtime. The source
   * Harptos clock and historical imported letters are never mutated.
   */
  async function initialize({idToken}={}){
    const actor=await identify(idToken);
    if(actor.role!=='narrador')deny();
    const [cal,hist]=await Promise.all([temporal.get(),history.get()]);
    if(!cal.exists||cal.data()?.status!=='complete'||
       !hist.exists||hist.data()?.status!=='complete')deny();
    const projection=await temporal.collection('calendar').doc('current').get();
    if(!projection.exists||projection.data()?.calendarType!=='harptos')deny();
    const last=projection.data().lastRound;
    if(last!==null&&(!Number.isInteger(last)||last<1))deny();
    return db.runTransaction(async t=>{
      const [fresh,existing]=await Promise.all([
        t.get(access.doc(actor.uid)),t.get(runtime),
      ]);
      if(!fresh.exists||scope(actor.uid,fresh.data()).role!=='narrador')
        deny();
      if(existing.exists){
        if(existing.data()?.status!=='active')deny();
        return {initialized:true,alreadyInitialized:true};
      }
      t.create(runtime,{
        status:'active',formatVersion:1,private:true,
        sourceSnapshotId:snapshotId,openRound:null,
        lastRound:last??0,calendarVersion:projection.data().version,
        createdAt:now(),emulatorOnly:true,
      });
      return {initialized:true,alreadyInitialized:false};
    });
  }
  async function send({idToken,requestKey,originHouseId=null,
    recipients,subject,content,campaignDate,asDraft=false,deliveryRound=null}={}){
    const actor=await identify(idToken);
    if(!key(requestKey)||!validText(subject,180)||
       !validText(content)||!dateKey(campaignDate)||
       !Array.isArray(recipients)||recipients.length<1||
       recipients.length>25||typeof asDraft!=='boolean')
      throw Error('Invalid mail request');
    const targets=recipients.map(targetOf);
    if(new Set(targets.map(t=>t.kind+':'+t.id)).size!==targets.length)
      throw Error('Duplicate mail recipients');
    if(actor.role==='narrador'&&targets.some(x=>x.kind!=='house'))deny();
    if(targets.some(x=>x.kind==='narrator')&&
       (actor.role!=='jogador'||targets.length!==1))deny();
    if(originHouseId!==null&&(typeof originHouseId!=='string'||
      !originHouseId||originHouseId.length>512))throw Error('Invalid origin House');
    if(actor.role==='jogador'&&!originHouseId)deny();
    if(deliveryRound!==null&&(!Number.isInteger(deliveryRound)||
       deliveryRound<1||deliveryRound>2147483647))
      throw Error('Invalid delivery round');
    const normalized={
      originHouseId,targets:targets.map(t=>t.kind+':'+t.id),
      subject:subject.trim(),content,campaignDate,asDraft,deliveryRound,
    };
    const fingerprint=digest(JSON.stringify(normalized));
    const refs=targets.map(t=>{
      const target=t.kind==='narrator'?'narrator':'h:'+t.id;
      const hash=digest('mail:'+actor.uid+':'+requestKey+':'+target);
      return {target:t,id:hash,ref:letters.doc(hash)};
    });
    return db.runTransaction(async transaction=>{
      const {actor:fresh,state}=await inTransaction(transaction,actor);
      if(!eligibleToSend(fresh,originHouseId))deny();
      const originRef=originHouseId?
        domain.collection('houses').doc(digest('house:'+originHouseId)):null;
      const targetRefs=targets.filter(t=>t.kind==='house')
        .map(t=>domain.collection('houses').doc(digest('house:'+t.id)));
      const [origin,...targetDocs]=await Promise.all([
        originRef?transaction.get(originRef):Promise.resolve(null),
        ...targetRefs.map(ref=>transaction.get(ref)),
      ]);
      if(originRef&&(!origin?.exists||!origin.data()?.active))deny();
      if(targetDocs.some(x=>!x.exists||!x.data()?.active||x.data().season!==2))
        deny();
      const existing=await Promise.all(refs.map(x=>transaction.get(x.ref)));
      if(existing.some(x=>x.exists)){
        if(existing.some(x=>!x.exists||
           x.data()?.requestFingerprint!==fingerprint||
           x.data()?.senderUid!==fresh.uid))
          throw Error('Idempotency key already used for another message');
        return {ids:refs.map(x=>x.id),
          state:existing[0].data().publicationState,
          week:existing[0].data().deliveryRound,duplicate:true};
      }
      if(!asDraft&&state.openRound===null&&fresh.role!=='narrador')
        throw Error('No open mail round');
      const week=asDraft?null:(fresh.role==='narrador'?
        (deliveryRound??(state.openRound??state.lastRound+1)):
        state.openRound);
      if(!asDraft&&fresh.role==='narrador'&&
        (week<(state.openRound??state.lastRound+1)))deny();
      if(!asDraft&&(!Number.isInteger(week)||week<1))deny();
      const publicationState=asDraft?'draft':
        (state.openRound!==null&&week===state.openRound?'delivered':'scheduled');
      const stamp=now();
      refs.forEach(x=>transaction.create(x.ref,{
        id:x.id,kind:'letter',requestKey,requestFingerprint:fingerprint,
        batchId:digest('batch:'+fresh.uid+':'+requestKey),
        senderUid:fresh.uid,
        senderName:fresh.role==='narrador'?'Narrador':'Jogador',
        senderPlayerId:fresh.playerId,
        originHouseId,recipientKind:x.target.kind,
        recipientHouseId:x.target.kind==='house'?x.target.id:null,
        recipientPlayerId:null,recipientUid:null,
        subject:normalized.subject,content,
        campaignDate,createdAt:stamp,updatedAt:stamp,
        deliveredAt:publicationState==='delivered'?stamp:null,
        publicationState,deliveryRound:week,creationRound:state.openRound,
        deletedAt:null,version:1,source:'firebase-runtime',snapshotId,
      }));
      const auditId=digest('send:'+fresh.uid+':'+requestKey);
      transaction.create(audits.doc(auditId),{
        action:'send',actorUid:fresh.uid,letterIds:refs.map(x=>x.id),
        fingerprint,occurredAt:stamp,
      });
      return {ids:refs.map(x=>x.id),state:publicationState,
        week,duplicate:false};
    });
  }
  async function findLetter(t,letterId){
    const current=await t.get(letters.doc(letterId));
    if(current.exists)return {source:'runtime',doc:current};
    const legacy=await t.get(sourceLetters.doc(letterId));
    if(legacy.exists)return {source:'imported',doc:legacy};
    return null;
  }
  async function reply({idToken,requestKey,letterId,replyToId=null,
    content,campaignDate,asDraft=false}={}){
    const actor=await identify(idToken);
    if(!key(requestKey)||!id(letterId)||
       (replyToId!==null&&!id(replyToId))||
       !validText(content)||!dateKey(campaignDate)||
       typeof asDraft!=='boolean')
      throw Error('Invalid reply request');
    const rid=digest('reply:'+actor.uid+':'+requestKey);
    const ref=replies.doc(rid);
    const fingerprint=digest(JSON.stringify({letterId,replyToId,content,
      campaignDate,asDraft}));
    return db.runTransaction(async t=>{
      const {actor:fresh,state}=await inTransaction(t,actor);
      const parent=await findLetter(t,letterId);
      if(!parent)deny();
      const letter=parent.doc.data();
      if(parent.source==='runtime'?!canSee(letter,fresh):
        !canReadImported(letter,fresh))deny();
      if(letter.publicationState!=='delivered'||letter.deletedAt!==null)
        deny();
      const ancestor=replyToId?await t.get(replies.doc(replyToId)):null;
      if(replyToId&&(!ancestor.exists||
         ancestor.data()?.letterId!==letterId||
         ancestor.data()?.publicationState!=='delivered'||
         ancestor.data()?.deletedAt!==null||
         (fresh.role!=='narrador'&&
           ancestor.data()?.authorUid!==fresh.uid&&
           ancestor.data()?.recipientUid!==fresh.uid)))deny();
      const recipientUid=ancestor?ancestor.data().authorUid:letter.senderUid;
      if(recipientUid===fresh.uid)deny();
      if(fresh.role==='jogador'&&parent.source==='runtime'&&
         letter.recipientKind==='house'&&letter.senderUid!==fresh.uid&&
         !fresh.editHouseIds.has(letter.recipientHouseId))deny();
      const recipient=await t.get(access.doc(recipientUid));
      if(!recipient.exists)deny();
      const recipientScope=scope(recipientUid,recipient.data());
      if(parent.source==='runtime'&&!canSee(letter,recipientScope))deny();
      if(recipientScope.role==='jogador'&&!canReadImported({
        publicationState:'delivered',deletedAt:null,senderUid:letter.senderUid,
        recipientPlayerId:letter.recipientPlayerId,
        recipientHouseId:letter.recipientHouseId,
      },recipientScope)&&parent.source==='imported')deny();
      const previous=await t.get(ref);
      if(previous.exists){
        if(previous.data()?.requestFingerprint!==fingerprint||
           previous.data()?.authorUid!==fresh.uid)
          throw Error('Idempotency key already used for another reply');
        return {id:rid,state:previous.data().publicationState,
          week:previous.data().deliveryRound,duplicate:true};
      }
      if(!asDraft&&state.openRound===null)throw Error('No open mail round');
      const week=asDraft?null:(recipientScope.role==='narrador'?
        state.openRound:state.openRound+1);
      const publicationState=asDraft?'draft':
        (week===state.openRound?'delivered':'scheduled');
      const stamp=now();
      t.create(ref,{
        id:rid,kind:'reply',letterId,replyToId,
        authorUid:fresh.uid,authorName:fresh.role==='narrador'?
          'Narrador':'Jogador',recipientUid,
        senderUid:fresh.uid,senderName:fresh.role==='narrador'?
          'Narrador':'Jogador',subject:null,content,
        campaignDate,recipientKind:'player',recipientPlayerId:recipientScope.playerId,
        recipientHouseId:null,
        requestKey,requestFingerprint:fingerprint,source:'firebase-runtime',
        createdAt:stamp,updatedAt:stamp,
        deliveredAt:publicationState==='delivered'?stamp:null,
        publicationState,deliveryRound:week,creationRound:state.openRound,
        deletedAt:null,version:1,
      });
      t.create(audits.doc(digest('reply:'+fresh.uid+':'+requestKey)),{
        action:'reply',actorUid:fresh.uid,letterId,replyId:rid,
        fingerprint,occurredAt:stamp,
      });
      return {id:rid,state:publicationState,week,duplicate:false};
    });
  }
  async function editDraft({idToken,id:docId,kind='letter',version,
    subject=null,content}={}){
    const actor=await identify(idToken);
    if(!id(docId)||!['letter','reply'].includes(kind)||
       !Number.isInteger(version)||version<1||!validText(content)||
       (kind==='letter'&&!validText(subject,180)))
      throw Error('Invalid draft update');
    return db.runTransaction(async t=>{
      const {actor:fresh}=await inTransaction(t,actor);
      const ref=kind==='letter'?letters.doc(docId):replies.doc(docId);
      const doc=await t.get(ref);
      if(!doc.exists||doc.data()?.senderUid!==fresh.uid||
         doc.data()?.publicationState!=='draft'||doc.data()?.deletedAt!==null)
        deny();
      if(doc.data().version!==version)throw Error('Mail version conflict');
      const updated={content,updatedAt:now(),version:version+1};
      if(kind==='letter')updated.subject=subject.trim();
      t.create(audits.doc(digest('version:'+kind+':'+docId+':'+version)),{
        action:'edit-draft',kind,docId,actorUid:fresh.uid,
        previousVersion:version,previousContent:doc.data().content,
        previousSubject:doc.data().subject??null,
        occurredAt:updated.updatedAt,
      });
      t.update(ref,updated);
      return {id:docId,version:version+1,state:'draft'};
    });
  }
  async function scheduleDraft({idToken,id:docId,kind='letter',version,
    deliveryRound=null}={}){
    const actor=await identify(idToken);
    if(!id(docId)||!['letter','reply'].includes(kind)||
       !Number.isInteger(version)||version<1||
       (deliveryRound!==null&&(!Number.isInteger(deliveryRound)||
         deliveryRound<1)))throw Error('Invalid scheduling request');
    return db.runTransaction(async t=>{
      const {actor:fresh,state}=await inTransaction(t,actor);
      const ref=kind==='letter'?letters.doc(docId):replies.doc(docId);
      const doc=await t.get(ref);
      if(!doc.exists||doc.data()?.senderUid!==fresh.uid||
         doc.data()?.publicationState!=='draft'||doc.data()?.deletedAt!==null)
        deny();
      if(doc.data().version!==version)throw Error('Mail version conflict');
      if(state.openRound===null&&fresh.role==='jogador')
        throw Error('No open mail round');
      let round;
      if(kind==='letter'){
        if(!eligibleToSend(fresh,doc.data().originHouseId))deny();
        round=fresh.role==='narrador'?
          (deliveryRound??state.openRound??state.lastRound+1):state.openRound;
        if(fresh.role==='narrador'&&round<(state.openRound??state.lastRound+1))deny();
      }else{
        const recipient=await t.get(access.doc(doc.data().recipientUid));
        if(!recipient.exists)deny();
        const rs=scope(doc.data().recipientUid,recipient.data());
        round=rs.role==='narrador'?state.openRound:state.openRound+1;
      }
      if(!Number.isInteger(round)||round<1)deny();
      const updated={
        publicationState:round===state.openRound?'delivered':'scheduled',
        deliveryRound:round,updatedAt:now(),version:version+1,
        deliveredAt:round===state.openRound?now():null,
      };
      t.update(ref,updated);
      t.create(audits.doc(digest('schedule:'+kind+':'+docId+':'+version)),{
        action:'schedule-draft',kind,docId,actorUid:fresh.uid,
        deliveryRound:round,occurredAt:updated.updatedAt,
      });
      return {id:docId,version:version+1,
        state:updated.publicationState,week:round};
    });
  }
  async function changeTrash({idToken,id:docId,kind='letter',
    version,restore=false}={}){
    const actor=await identify(idToken);
    if(!id(docId)||!['letter','reply'].includes(kind)||
       !Number.isInteger(version)||version<1||typeof restore!=='boolean')
      throw Error('Invalid trash operation');
    return db.runTransaction(async t=>{
      const {actor:fresh}=await inTransaction(t,actor);
      const ref=kind==='letter'?letters.doc(docId):replies.doc(docId);
      const doc=await t.get(ref);
      if(!doc.exists||doc.data()?.version!==version)deny();
      const record=doc.data();
      if(fresh.role!=='narrador'&&
         (record.senderUid!==fresh.uid||
          record.publicationState!=='draft'))deny();
      if(restore?!record.deletedAt:record.deletedAt!==null)deny();
      if(kind==='reply'&&restore){
        const parent=await findLetter(t,record.letterId);
        if(!parent||parent.doc.data().deletedAt!==null)deny();
      }
      const stamp=now();
      t.update(ref,{deletedAt:restore?null:stamp,
        updatedAt:stamp,version:version+1});
      t.create(audits.doc(digest('trash:'+kind+':'+docId+':'+version)),{
        action:restore?'restore':'trash',kind,docId,
        actorUid:fresh.uid,occurredAt:stamp,
      });
      return {id:docId,version:version+1,
        deleted:!restore};
    });
  }
  async function openRound({idToken,number}={}){
    const actor=await identify(idToken);
    if(actor.role!=='narrador'||!Number.isInteger(number)||number<1)
      deny();
    return db.runTransaction(async t=>{
      const {actor:fresh,state}=await inTransaction(t,actor);
      if(fresh.role!=='narrador'||state.openRound!==null||
         number!==state.lastRound+1)deny();
      const [existing,scheduledLetters,scheduledReplies]=await Promise.all([
        t.get(rounds.doc(String(number))),
        t.get(letters.where('publicationState','==','scheduled')
          .where('deliveryRound','==',number).limit(MAX_SCAN+1)),
        t.get(replies.where('publicationState','==','scheduled')
          .where('deliveryRound','==',number).limit(MAX_SCAN+1)),
      ]);
      if(existing.exists||scheduledLetters.size>MAX_SCAN||
         scheduledReplies.size>MAX_SCAN)deny();
      const stamp=now();
      t.update(runtime,{openRound:number,lastRound:number,
        updatedAt:stamp});
      t.create(rounds.doc(String(number)),{
        number,status:'open',openedAt:stamp,openedBy:fresh.uid,
        closedAt:null,closedBy:null,
      });
      for(const batch of [scheduledLetters,scheduledReplies])
        for(const doc of batch.docs)
          t.update(doc.ref,{publicationState:'delivered',
            deliveredAt:stamp,updatedAt:stamp,version:doc.data().version+1});
      t.create(audits.doc(digest('open-round:'+number)),{
        action:'open-round',actorUid:fresh.uid,round:number,
        deliveredLetters:scheduledLetters.size,
        deliveredReplies:scheduledReplies.size,occurredAt:stamp,
      });
      return {number,status:'open',
        deliveredLetters:scheduledLetters.size,
        deliveredReplies:scheduledReplies.size};
    });
  }
  async function closeRound({idToken,number}={}){
    const actor=await identify(idToken);
    if(actor.role!=='narrador'||!Number.isInteger(number)||number<1)deny();
    return db.runTransaction(async t=>{
      const {actor:fresh,state}=await inTransaction(t,actor);
      const doc=await t.get(rounds.doc(String(number)));
      if(fresh.role!=='narrador'||state.openRound!==number||
         !doc.exists||doc.data()?.status!=='open')deny();
      const stamp=now();
      t.update(runtime,{openRound:null,updatedAt:stamp});
      t.update(doc.ref,{status:'closed',closedAt:stamp,closedBy:fresh.uid});
      t.create(audits.doc(digest('close-round:'+number)),{
        action:'close-round',actorUid:fresh.uid,
        round:number,occurredAt:stamp,
      });
      return {number,status:'closed'};
    });
  }
  async function list({idToken,includeDrafts=false}={}){
    const actor=await identify(idToken);
    if(typeof includeDrafts!=='boolean')throw Error('Invalid mail list option');
    const status=await runtime.get();
    if(!status.exists||status.data()?.status!=='active')deny();
    const collected=[];
    const read=async q=>{
      const snapshot=await q.limit(MAX_SCAN+1).get();
      if(snapshot.size>MAX_SCAN)throw Error('Mail preview scan limit reached');
      collected.push(...snapshot.docs);
    };
    if(actor.role==='narrador'){
      await read(letters);
    }else{
      await Promise.all([
        read(letters.where('senderUid','==',actor.uid)),
        ...[...actor.memberHouseIds].map(h=>
          read(letters.where('recipientHouseId','==',h))),
        read(letters.where('recipientKind','==','narrator')
          .where('senderUid','==',actor.uid)),
      ]);
    }
    const unique=new Map(collected.map(doc=>[doc.id,doc]));
    const visible=[...unique.values()].filter(doc=>
      canSee(doc.data(),actor)||(includeDrafts&&
        doc.data().senderUid===actor.uid&&
        doc.data().deletedAt===null))
      .map(doc=>preview({id:doc.id,...doc.data()}));
    return visible.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||
      b.id.localeCompare(a.id));
  }
  async function get({idToken,letterId}={}){
    const actor=await identify(idToken);
    if(!id(letterId))throw Error('Invalid letter id');
    const doc=await letters.doc(letterId).get();
    if(doc.exists&&canSee(doc.data(),actor))
      return preview({id:doc.id,...doc.data()});
    const imported=await sourceLetters.doc(letterId).get();
    if(imported.exists&&canReadImported(imported.data(),actor))
      return {id:imported.id,source:'imported',readOnly:true,
        ...preview({id:imported.id,...imported.data()})};
    return null;
  }
  async function listReplies({idToken,letterId}={}){
    const actor=await identify(idToken);
    if(!id(letterId))throw Error('Invalid letter id');
    const parent=await get({idToken,letterId});
    if(!parent)return null;
    const query=await replies.where('letterId','==',letterId)
      .limit(MAX_SCAN+1).get();
    if(query.size>MAX_SCAN)throw Error('Reply preview scan limit reached');
    return query.docs.filter(doc=>{
      const r=doc.data();
      if(r.deletedAt!==null)return false;
      if(r.publicationState!=='delivered'&&r.authorUid!==actor.uid)
        return false;
      return actor.role==='narrador'||
        r.authorUid===actor.uid||r.recipientUid===actor.uid;
    }).map(doc=>preview({id:doc.id,...doc.data()}))
      .sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  }
  /**
   * Runtime read receipts are per account, never per House. Narrator may
   * acknowledge only mail explicitly addressed to the Narrator, rather
   * than marking arbitrary monitored correspondence on behalf of players.
   */
  async function markRead({idToken,letterId}={}){
    const actor=await identify(idToken);
    if(!id(letterId))throw Error('Invalid letter id');
    const receiptRef=runtime.collection('readReceipts')
      .doc(digest(letterId+':'+actor.uid));
    return db.runTransaction(async t=>{
      const {actor:fresh}=await inTransaction(t,actor);
      const [letter,receipt]=await Promise.all([
        t.get(letters.doc(letterId)),t.get(receiptRef),
      ]);
      if(!letter.exists)deny();
      const record=letter.data();
      if(record.publicationState!=='delivered'||record.deletedAt!==null||
         record.senderUid===fresh.uid)deny();
      const reader=record.recipientKind==='narrator'
        ?fresh.role==='narrador'
        :fresh.role==='jogador'&&(
          (record.recipientKind==='house'&&
            fresh.memberHouseIds.has(record.recipientHouseId))||
          (record.recipientKind==='player'&&
            fresh.playerId===record.recipientPlayerId));
      if(!reader)deny();
      if(receipt.exists){
        if(receipt.data()?.letterId!==letterId||
           receipt.data()?.viewerUid!==fresh.uid)deny();
        return {recorded:true,alreadyRecorded:true};
      }
      t.create(receiptRef,{
        schemaVersion:1,letterId,viewerUid:fresh.uid,
        readAt:now(),runtime:true,
      });
      return {recorded:true,alreadyRecorded:false};
    });
  }
  async function listReceipts({idToken,letterId}={}){
    const actor=await identify(idToken);
    if(!id(letterId))throw Error('Invalid letter id');
    const letter=await letters.doc(letterId).get();
    if(!letter.exists||letter.data()?.publicationState!=='delivered'||
       letter.data()?.deletedAt!==null||
       (actor.role!=='narrador'&&letter.data()?.senderUid!==actor.uid))
      deny();
    const rows=await runtime.collection('readReceipts')
      .where('letterId','==',letterId).limit(MAX_SCAN+1).get();
    if(rows.size>MAX_SCAN)throw Error('Receipt preview scan limit reached');
    return rows.docs.map(doc=>({
      viewerUid:doc.data().viewerUid,readAt:doc.data().readAt,
    })).sort((a,b)=>a.readAt.localeCompare(b.readAt));
  }
  async function note({idToken,letterId,text,requestKey}={}){
    const actor=await identify(idToken);
    if(actor.role!=='narrador')deny();
    if(!id(letterId)||!key(requestKey)||!validText(text,10000))
      throw Error('Invalid private note');
    const ref=runtime.collection('narratorNotes')
      .doc(digest('note:'+actor.uid+':'+requestKey));
    const fingerprint=digest(letterId+':'+text);
    return db.runTransaction(async t=>{
      const {actor:fresh}=await inTransaction(t,actor);
      if(fresh.role!=='narrador')deny();
      const parent=await findLetter(t,letterId);
      if(!parent)deny();
      const exists=await t.get(ref);
      if(exists.exists){
        if(exists.data().fingerprint!==fingerprint)deny();
        return {saved:true,duplicate:true};
      }
      t.create(ref,{
        letterId,actorUid:fresh.uid,text,fingerprint,createdAt:now(),
      });
      return {saved:true,duplicate:false};
    });
  }
  return Object.freeze({
    session,initialize,send,reply,editDraft,scheduleDraft,
    changeTrash,openRound,closeRound,list,get,listReplies,
    markRead,listReceipts,note,
  });
}
