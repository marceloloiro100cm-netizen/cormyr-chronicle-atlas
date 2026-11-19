import {validateEditorialContent} from './cloud-editorial-content.mjs';
import {effectiveCloudCalendar} from './cloud-operational-calendar.mjs';
import {currentAccountAccess,chooseCurrentAccountAccess} from './operational-account-access.mjs';
/**
 * Firebase Cloud-only newspaper publishing. Preserves imported editions.
 *
 * Approval requires server flag + reconciled stage roots + a separately
 * approved mutable runtime. No user endpoint provisions an approval flag.
 */
import {createHash} from 'node:crypto';
import {validateHarptosDate,harptosKey} from './stage-temporal-emulator.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f]{1,128}$/;
const KEY=/^[a-zA-Z0-9_-]{8,128}$/;
const validId=value=>typeof value==='string'&&ID.test(value);
const digest=s=>createHash('sha256').update(s).digest('hex');
const deny=(code,status=403)=>{throw new CloudNewspaperError(code,status);};
const number=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const requiredText=(s,max)=>typeof s==='string'&&s.trim().length>0&&
  Buffer.byteLength(s,'utf8')<=max;
const optionalText=(s,max)=>typeof s==='string'&&
  Buffer.byteLength(s,'utf8')<=max;

export class CloudNewspaperError extends Error{
  constructor(code,status=403){super(code);this.name='CloudNewspaperError';
    this.code=code;this.status=status;}
}

function validateInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>!['action','requestKey','title','subtitle','article'].includes(k))||
     input.action!=='publish'||typeof input.requestKey!=='string'||
     !KEY.test(input.requestKey)||!requiredText(input.title,180)||
     !optionalText(input.subtitle,280)||!requiredText(input.article,12000))
    deny('invalid_newspaper_request',400);
  return {requestKey:input.requestKey,title:input.title.trim(),
    subtitle:input.subtitle.trim(),article:input.article};
}
function authorized(uid,scope){
  if(!scope||scope.userId!==uid||scope.active!==true||
     scope.requirePasswordChange!==false||
     (scope.profile!=='editor'&&scope.profile!=='narrador')||
     scope.admin!==(scope.profile==='narrador')||
     !Array.isArray(scope.memberHouseIds)||scope.memberHouseIds.length!==0||
     !Array.isArray(scope.editHouseIds)||scope.editHouseIds.length!==0)
    deny('editor_not_authorized',403);
}
function readyRoots(roots){
  if(roots.some(doc=>!doc.exists||doc.data()?.status!=='complete'||
      doc.data()?.private!==true))deny('migration_stage_not_ready',503);
}
function readyRuntime(v,snapshot,calendar){
  if(!v||v.status!=='active'||v.private!==true||
     v.sourceSnapshotId!==snapshot||v.sourceSnapshotReconciled!==true||
     v.applicationEnabled!==true||v.newspaperWriteApproved!==true||
     v.newspaperSequenceReconciled!==true||
     !number(v.newspaperImportedMaxEditionNo,0,99999999)||
     !number(v.nextNewspaperEditionNo,1,99999999)||
     v.nextNewspaperEditionNo<=v.newspaperImportedMaxEditionNo||
     v.calendarVersion!==calendar.version)
    deny('newspaper_runtime_not_approved',503);
}
function calendarKey(calendar){
  if(!number(calendar?.version,1,2147483647)||
     !validateHarptosDate(calendar.year,calendar.month,
       calendar.day,calendar.festival??null))
    deny('calendar_unavailable',503);
  return harptosKey(calendar.year,calendar.month,calendar.day,
    calendar.festival??null);
}

export function createFirebaseCloudNewspaper({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
  clock=()=>new Date().toISOString(),
}){
  if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId??'')||
     env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    deny('cloud_newspaper_disabled',503);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const roots=[
    domain,db.collection('migrationAuthStage').doc(snapshotId),
    db.collection('migrationTimeEngineStage').doc(snapshotId),
    db.collection('migrationNewspaperRuntimeStage').doc(snapshotId),
  ];
  const calendar=roots[2].collection('calendar').doc('current');
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  const editions=runtime.collection('publishedNewspapers');
  const audits=runtime.collection('newspaperAudits');
  const readReceipts=runtime.collection('newspaperReadReceipts');
  async function actorId(token){
    if(typeof token!=='string'||token.length<10||token.length>10000)
      deny('authentication_required',401);
    let identity,user;
    try{
      identity=await auth.verifyIdToken(token,true);
      if(typeof identity?.uid!=='string'||!ID.test(identity.uid))
        deny('authentication_required',401);
      user=await auth.getUser(identity.uid);
    }catch{deny('authentication_required',401);}
    if(user?.uid!==identity.uid||user.disabled===true)
      deny('authentication_required',401);
    return identity.uid;
  }
  async function readApproval(uid,tx){
    const docs=await Promise.all([
      ...roots.map(ref=>tx.get(ref)),tx.get(calendar),
      tx.get(domain.collection('access').doc(uid)),
       tx.get(runtime.collection('accountAccess').doc(uid)),tx.get(runtime),
    ]);
    readyRoots(docs.slice(0,4));
    const cal=effectiveCloudCalendar(docs[4]?.data(),docs[7]?.data(),snapshotId);
    const date=calendarKey(cal);
    authorized(uid,chooseCurrentAccountAccess(uid,docs[5]?.data(),
       docs[6].exists?docs[6].data():null,docs[7]?.data()));
    readyRuntime(docs[7]?.data(),snapshotId,cal);
    return {calendarDate:date,config:docs[7].data()};
  }
  const receiptId=(uid,editionId)=>digest('newspaper-read:'+uid+':'+editionId);
  function readerScope(uid,scope){
    if(!scope||scope.userId!==uid||scope.active!==true||
       scope.requirePasswordChange!==false||
       !['jogador','narrador','editor'].includes(scope.profile)||
       scope.admin!==(scope.profile==='narrador')||
       !Array.isArray(scope.memberHouseIds)||
       !Array.isArray(scope.editHouseIds)||
       scope.memberHouseIds.some(x=>!validId(x))||
       scope.editHouseIds.some(x=>!validId(x))||
       (scope.profile==='jogador'&&
        (!validId(scope.playerId)||scope.memberHouseIds.length===0))||
       (scope.profile==='editor'&&
        (scope.memberHouseIds.length!==0||scope.editHouseIds.length!==0)))
      deny('reader_not_authorized',403);
  }
  function verifiedPaper(row,id,cloudId){
    if(!row||row.id!==id||
       !['published','archived'].includes(row.state)||
       typeof row.publishedAt!=='string'||row.cancelledAt!=null||
       (cloudId&&(row.source!=='firebase-cloud'||
         row.sourceSnapshotId!==snapshotId)))
      deny('edition_unavailable',404);
    const version=cloudId?row.version:row.publicationRevision;
    if(!number(version,0,2147483646))
      deny('edition_integrity_unverified',503);
    return version;
  }
  async function readerTransaction(tx,uid,id,receiptRef){
    const cloudId=id.startsWith('cloud-');
    const target=cloudId?editions.doc(id):
      roots[3].collection('editions').doc(id);
    const [stageDocs,cal,scope,overlay,live,paper,receipt]=await Promise.all([
      Promise.all(roots.map(ref=>tx.get(ref))),tx.get(calendar),
      tx.get(domain.collection('access').doc(uid)),
      tx.get(runtime.collection('accountAccess').doc(uid)),tx.get(runtime),
      tx.get(target),tx.get(receiptRef),
    ]);
    readyRoots(stageDocs);
    readerScope(uid,chooseCurrentAccountAccess(uid,scope.data(),
       overlay.exists?overlay.data():null,live.data()));
    const effective=effectiveCloudCalendar(cal.data(),live.data(),snapshotId);
    calendarKey(effective);
    readyRuntime(live.data(),snapshotId,effective);
    if(!paper.exists)deny('edition_unavailable',404);
    return {version:verifiedPaper(paper.data(),id,cloudId),receipt};
  }
  const editorialView=v=>({
    id:v.id,editionNo:v.editionNo,title:v.title,subtitle:v.subtitle??'',
    blocks:v.blocks,version:v.version,state:v.state,
    ...(v.template?{template:v.template}:{}),
    ...(v.font_style?{font_style:v.font_style}:{}),
    campaignDate:v.campaignDate,publishedAt:v.publishedAt,
  });
  return {
    async listReaderReceipts(token){
      const uid=await actorId(token);
      const [scope,...rootDocs]=await Promise.all([
        currentAccountAccess(db,snapshotId,uid),
        ...roots.map(ref=>ref.get()),calendar.get(),runtime.get(),
      ]);
      readerScope(uid,scope);
      readyRoots(rootDocs.slice(0,4));
      const effective=effectiveCloudCalendar(rootDocs[4].data(),
        rootDocs[5].data(),snapshotId);
      calendarKey(effective);
      readyRuntime(rootDocs[5].data(),snapshotId,effective);
      const result=await readReceipts.where('viewerUid','==',uid).limit(501).get();
      if(!Array.isArray(result.docs)||result.docs.length>500)
        deny('newspaper_receipts_too_large',503);
      return {items:result.docs.map(d=>{
        const v=d.data();
        if(!v||v.viewerUid!==uid||!validId(v.editionId)||
           d.id!==receiptId(uid,v.editionId)||
           !number(v.readVersion,0,2147483646)||
           typeof v.readAt!=='string'||!Number.isFinite(Date.parse(v.readAt)))
          deny('newspaper_receipt_unverified',503);
        return {newspaper_id:v.editionId,user_id:uid,
          read_version:v.readVersion,read_at:v.readAt};
      })};
    },
    async markReader(token,input){
      const uid=await actorId(token);
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(k=>!['action','id'].includes(k))||
         !['markRead','markUnread'].includes(input.action)||
         !validId(input.id))
        deny('invalid_receipt_request',400);
      const id=input.id;
      const receiptRef=readReceipts.doc(receiptId(uid,id));
      return db.runTransaction(async tx=>{
        const {version,receipt}=await readerTransaction(tx,uid,id,receiptRef);
        const old=receipt.data();
        if(receipt.exists&&
           (old?.viewerUid!==uid||old.editionId!==id||
            !number(old.readVersion,0,2147483646)))
          deny('invalid_existing_receipt',409);
        if(input.action==='markUnread'){
          if(receipt.exists)tx.delete(receiptRef);
          return {recorded:false,alreadyRecorded:!receipt.exists};
        }
        if(receipt.exists&&old.readVersion>=version)
          return {recorded:true,alreadyRecorded:true};
        const now=clock();
        if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))
          deny('invalid_server_clock',503);
        const next={viewerUid:uid,editionId:id,readVersion:version,readAt:now};
        if(receipt.exists)tx.update(receiptRef,next);
        else tx.create(receiptRef,next);
        return {recorded:true,alreadyRecorded:false};
      });
    },

    async listEditorial(token){
      const uid=await actorId(token);
      return db.runTransaction(async tx=>{
        await readApproval(uid,tx);
        const docs=await tx.get(editions.limit(101));
        if(docs.docs.length>100)deny('editorial_response_too_large',503);
        return {items:docs.docs.map(d=>d.data()).filter(v=>
          v?.source==='firebase-cloud'&&v.sourceSnapshotId===snapshotId)
          .sort((a,b)=>b.editionNo-a.editionNo)
          .map(v=>({id:v.id,editionNo:v.editionNo,title:v.title,state:v.state,version:v.version}))};
      });
    },
    async getEditorial(token,input){
      const uid=await actorId(token);
      if(!input||Object.keys(input).some(k=>!['action','id'].includes(k))||
         input.action!=='getEditorial'||typeof input.id!=='string'||
         !/^cloud-[a-f0-9]{64}$/.test(input.id))deny('invalid_editorial_request',400);
      return db.runTransaction(async tx=>{
        await readApproval(uid,tx);
        const doc=await tx.get(editions.doc(input.id)),v=doc.data();
        if(!doc.exists||v?.source!=='firebase-cloud'||v.sourceSnapshotId!==snapshotId)
          deny('edition_unavailable',404);
        return editorialView(v);
      });
    },
    async saveEdition(token,input){
      const uid=await actorId(token);
      if(!input||Object.keys(input).some(k=>!['action','requestKey','id','expectedVersion','state','content'].includes(k))||
         input.action!=='saveEdition'||typeof input.requestKey!=='string'||!KEY.test(input.requestKey)||
         !number(input.expectedVersion,0,2147483646)||
         !['draft','published','archived','cancelled'].includes(input.state)||
         (input.id!==null&&(typeof input.id!=='string'||!/^cloud-[a-f0-9]{64}$/.test(input.id))))
        deny('invalid_editorial_request',400);
      let content;
      try{content=validateEditorialContent(input.content);}
      catch{deny('invalid_editorial_content',400);}
      const id=input.id??'cloud-'+digest('editorial:'+uid+':'+input.requestKey);
      const ref=editions.doc(id),audit=audits.doc('edit-'+digest(uid+':'+input.requestKey));
      const fingerprint=digest(JSON.stringify({...input,content}));
      return db.runTransaction(async tx=>{
        const {calendarDate,config}=await readApproval(uid,tx);
        const [oldDoc,auditDoc]=await Promise.all([tx.get(ref),tx.get(audit)]);
        if(auditDoc.exists){
          const prior=auditDoc.data();
          if(prior.actorUid!==uid||prior.requestFingerprint!==fingerprint)
            deny('request_key_conflict',409);
          return {...editorialView(prior.after),duplicate:true};
        }
        const old=oldDoc.data();
        if((oldDoc.exists&&(old?.source!=='firebase-cloud'||
             old.sourceSnapshotId!==snapshotId||old.id!==id))||
           (oldDoc.exists?old.version:0)!==input.expectedVersion||
           (input.id!==null&&!oldDoc.exists))
          deny('edition_version_conflict',409);
        if(['archived','cancelled'].includes(input.state)&&!old?.publishedAt)
          deny('edition_not_published',409);
        const now=clock();
        if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))
          deny('invalid_server_clock',503);
        const published=input.state==='published';
        const next={...(old??{}),...content,id,source:'firebase-cloud',
          sourceSnapshotId:snapshotId,editionNo:old?.editionNo??config.nextNewspaperEditionNo,
          state:input.state,version:input.expectedVersion+1,
          campaignDate:published&&!old?.publishedAt?calendarDate:old?.campaignDate??calendarDate,
          publishedAt:published?old?.publishedAt??now:old?.publishedAt??null,
          cancelledAt:input.state==='cancelled'?now:null,
          createdBy:old?.createdBy??uid,updatedBy:uid,updatedAt:now};
        if(oldDoc.exists)tx.update(ref,next);else tx.create(ref,next);
        tx.create(audit,{action:'save_edition',actorUid:uid,occurredAt:now,
          editionId:id,requestFingerprint:fingerprint,before:old??null,after:next});
        if(!oldDoc.exists)tx.update(runtime,{nextNewspaperEditionNo:config.nextNewspaperEditionNo+1});
        return {...editorialView(next),duplicate:false};
      });
    },
    async status(token){
      const uid=await actorId(token);
      // Status is read-only. Do not leak private stage details, UID or
      // write approval settings to an unauthenticated caller.
      const [scope,...documents]=await Promise.all([
        currentAccountAccess(db,snapshotId,uid),
        ...roots.map(ref=>ref.get()),calendar.get(),runtime.get(),
      ]);
      authorized(uid,scope);
      const rootsOk=documents.slice(0,4).every(d=>
        d.exists&&d.data()?.status==='complete'&&d.data()?.private===true);
      let available=false;
      if(rootsOk){
        try{
          const cal=effectiveCloudCalendar(documents[4].data(),documents[5].data(),snapshotId);
          calendarKey(cal);
          readyRuntime(documents[5].data(),snapshotId,cal);
          available=true;
        }catch(e){if(!(e instanceof CloudNewspaperError))throw e;}
      }
      return {enabled:available,canPublish:available,readOnly:!available};
    },
    async publish(token,input){
      const uid=await actorId(token);
      const data=validateInput(input);
      const fingerprint=digest(JSON.stringify(data));
      const id='cloud-'+digest('newspaper:'+uid+':'+data.requestKey);
      const ref=editions.doc(id),audit=audits.doc(id);
      return db.runTransaction(async tx=>{
        const {calendarDate,config}=await readApproval(uid,tx);
        // All Firestore reads must precede writes in this transaction.
        const prev=await tx.get(ref);
        if(prev.exists){
          const p=prev.data();
          if(p?.createdBy!==uid||p.requestFingerprint!==fingerprint||
             p?.id!==id||p?.state!=='published')
            deny('request_key_conflict',409);
          return {id,editionNo:p.editionNo,duplicate:true,state:'published'};
        }
        const now=clock();
        if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))
          deny('invalid_server_clock',503);
        const no=config.nextNewspaperEditionNo;
        const doc={
          id,source:'firebase-cloud',sourceSnapshotId:snapshotId,
          editionNo:no,title:data.title,subtitle:data.subtitle,
          state:'published',blocks:[{id:'article-1',type:'article',text:data.article}],
          publishedAt:now,campaignDate:calendarDate,cancelledAt:null,
          createdBy:uid,requestFingerprint:fingerprint,version:1,
        };
        tx.create(ref,doc);
        tx.create(audit,{action:'publish',editionId:id,actorUid:uid,
          requestFingerprint:fingerprint,occurredAt:now,editionNo:no});
        tx.update(runtime,{nextNewspaperEditionNo:no+1});
        return {id,editionNo:no,duplicate:false,state:'published'};
      });
    },
  };
}

