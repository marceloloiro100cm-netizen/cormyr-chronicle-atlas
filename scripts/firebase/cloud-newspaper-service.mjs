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
      tx.get(domain.collection('access').doc(uid)),tx.get(runtime),
    ]);
    readyRoots(docs.slice(0,4));
    const cal=docs[4]?.data();
    const date=calendarKey(cal);
    authorized(uid,docs[5]?.data());
    readyRuntime(docs[6]?.data(),snapshotId,cal);
    return {calendarDate:date,config:docs[6].data()};
  }
  return {
    async status(token){
      const uid=await actorId(token);
      // Status is read-only. Do not leak private stage details, UID or
      // write approval settings to an unauthenticated caller.
      const [scope,...documents]=await Promise.all([
        domain.collection('access').doc(uid).get(),
        ...roots.map(ref=>ref.get()),calendar.get(),runtime.get(),
      ]);
      authorized(uid,scope.data());
      const rootsOk=documents.slice(0,4).every(d=>
        d.exists&&d.data()?.status==='complete'&&d.data()?.private===true);
      let available=false;
      if(rootsOk){
        try{
          const cal=documents[4].data();
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
