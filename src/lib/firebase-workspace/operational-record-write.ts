/**
 * Escrita transacional do item 6. O snapshot migrado nunca é alterado.
 * A identidade do autor e as Casas editáveis são recebidas do Firebase Admin.
 */
import {createHash,randomUUID} from 'node:crypto';
import {chooseCurrentAccountAccess} from '../../../scripts/firebase/operational-account-access.mjs';
import type {Scope} from './service';
import {projectOperationalRecords,type RecordRow,type OperationalRecord} from './operational-records';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[^/\u0000-\u001f\u007f]{1,128}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isRow=(x:unknown):x is RecordRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
export class RecordWriteError extends Error{
 constructor(readonly code:string,readonly status:number){super(code);}
}
const fail=(code:string,status=400):never=>{throw new RecordWriteError(code,status);};
export type RecordWriteInput=
 | {action:'create';row:RecordRow}
 | {action:'save';recordId:string;expectedVersion:number;title:string;content:string;requestKey?:string};

function editable(actor:Scope,row:RecordRow){
 if(actor.profile==='narrador')return true;
 const house=row['house_id'];
 if(actor.profile!=='jogador'||typeof house!=='string'||!actor.editHouseIds.includes(house))
  return false;
 return row['visibility']==='house'||
   row['visibility']==='player'&&row['player_id']===actor.playerId;
}
const sameIdentity=(a:RecordRow,b:RecordRow)=>
 ['house_id','player_id','kind','visibility'].every(k=>(a[k]??null)===(b[k]??null));
const text=(v:unknown,max:number,empty=false):v is string=>
 typeof v==='string'&&(empty||v.trim().length>0)&&Buffer.byteLength(v,'utf8')<=max;
function assertRuntime(data:any,snapshotId:string){
 if(!data||data.status!=='active'||data.private!==true||
   data.applicationEnabled!==true||data.sourceSnapshotId!==snapshotId||
   data.sourceSnapshotReconciled!==true||data.recordsReadApproved!==true||
   data.recordsWriteApproved!==true)
   fail('record_write_not_approved',503);
}
function validateDraft(actor:Scope,row:RecordRow){
 if(!uuid(row['id'])||!validId(row['house_id'])||
   !['document','character','details'].includes(String(row['kind']))||
   !['player','house','gm'].includes(String(row['visibility']))||
   !text(row['title'],500)||!text(row['content'],400000,true)||
   row['created_by']!==actor.uid||row['updated_by']!==actor.uid||
   (row['version']!==undefined&&row['version']!==1)||
   (row['sync_state']!==undefined&&row['sync_state']!=='pending'))
    fail('record_invalid',400);
 if(row['visibility']==='player'&&!validId(row['player_id']))
   fail('record_invalid',400);
 if(row['visibility']!=='player'&&row['player_id']!=null)
   fail('record_invalid',400);
 if(!editable(actor,row))fail('access_denied',403);
}
export function canonicalRecordRequest(actor:Scope,input:RecordWriteInput){
 if(!validId(actor.uid)||!['narrador','jogador'].includes(actor.profile))
   fail('access_denied',403);
 if(input.action==='create'){
  validateDraft(actor,input.row);
  return sha(JSON.stringify(['create',actor.uid,input.row['id'],input.row['house_id'],
   input.row['player_id']??null,input.row['visibility'],input.row['kind'],
   input.row['title'],input.row['content']]));
 }
 if(input.action==='save'){
  if(!uuid(input.recordId)||!Number.isSafeInteger(input.expectedVersion)||
    input.expectedVersion<1||!text(input.title,500)||!text(input.content,400000,true)||
    input.requestKey!==undefined&&!uuid(input.requestKey))fail('record_invalid',400);
  return sha(JSON.stringify(['save',actor.uid,input.recordId,input.expectedVersion,
   input.title,input.content,input.requestKey??null]));
 }
 return fail('record_invalid',400);
}
export async function commitOperationalRecord({
 db,snapshotId,actor,imported,input,representation,
}:{
 db:any;snapshotId:string;actor:Scope;imported:RecordRow[];input:RecordWriteInput;
 representation?:{realActorUid:string;sessionNonce:string};
}):Promise<RecordRow>{
 if(process.env['CORMYR_FIREBASE_RECORDS_ENABLED']!=='true')
  fail('record_write_disabled',501);
 if(!/^[a-f0-9]{64}$/.test(snapshotId)||!Array.isArray(imported))
  fail('record_source_unavailable',503);
 const requestDigest=canonicalRecordRequest(actor,input);
 const id=input.action==='create'?input.row['id'] as string:input.recordId;
 const matching=imported.filter(row=>row['id']===id);
 if(matching.length>1)fail('record_source_conflict',503);
 const source=matching[0]??null;
 if(input.action==='create'&&source)fail('record_exists',409);
 if(input.action==='save'&&!source&&!validId(id))fail('record_not_found',404);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const doc=root.collection('records').doc(sha('record:'+id));
 const request=root.collection('recordRequests').doc(sha('record-request:'+actor.uid+':'+requestDigest));
 return db.runTransaction(async(tx:any)=>{
  const [rt,attempt,currentDoc]=await Promise.all([
   tx.get(root),tx.get(request),tx.get(doc),
  ]);
  assertRuntime(rt.exists?rt.data():null,snapshotId);
  if(representation){
   if(actor.profile!=='jogador'||actor.uid===representation.realActorUid||
     !validId(representation.realActorUid)||!uuid(representation.sessionNonce))
    fail('representation_denied',403);
   // Todas as leituras precedem a gravação. A permissão é revalidada na transação.
   const stage=db.collection('migrationDomainStage').doc(snapshotId);
   const [session,realAdmin,archive,accountOverlay]=await Promise.all([
    tx.get(root.collection('representationSessions').doc(representation.realActorUid)),
    tx.get(stage.collection('access').doc(representation.realActorUid)),
    tx.get(stage.collection('access').doc(actor.uid)),
    tx.get(root.collection('accountAccess').doc(actor.uid)),
   ]);
   const s=session.data(),gm=realAdmin.data();
   if(!session.exists||s?.actorUid!==representation.realActorUid||
     s?.representedUid!==actor.uid||s?.playerId!==actor.playerId||
     s?.nonce!==representation.sessionNonce||
     s?.sourceSnapshotId!==snapshotId||
     !Number.isFinite(Date.parse(s?.expiresAt))||Date.parse(s.expiresAt)<=Date.now()||
     gm?.userId!==representation.realActorUid||
     gm?.profile!=='narrador'||gm?.admin!==true||
     gm?.active!==true||gm?.requirePasswordChange!==false)
    fail('representation_expired',403);
   let effective:any;
   try{effective=chooseCurrentAccountAccess(actor.uid,
     archive.exists?archive.data():null,
     accountOverlay.exists?accountOverlay.data():null,rt.data());}
   catch{fail('representation_scope_invalid',403);}
   if(effective?.profile!=='jogador'||effective?.admin!==false||
     effective?.active!==true||effective?.requirePasswordChange!==false||
     effective?.playerId!==actor.playerId||
     JSON.stringify(effective.memberHouseIds)!==JSON.stringify(actor.memberHouseIds)||
     JSON.stringify(effective.editHouseIds)!==JSON.stringify(actor.editHouseIds))
    fail('representation_scope_invalid',403);
  }
  if(attempt.exists){
   const saved=attempt.data();
   if(saved?.actor!==actor.uid||saved?.digest!==requestDigest||!isRow(saved.record))
    fail('record_request_conflict',409);
   return saved.record;
  }
  const current=currentDoc.exists?currentDoc.data() as OperationalRecord&{sourceSnapshotId:string}:null;
  if(current){
   if(current.sourceSnapshotId!==snapshotId)fail('record_source_conflict',503);
   try{projectOperationalRecords(actor,source?[source]:[],[current]);}
   catch{fail('record_source_conflict',503);}
  }
  if(input.action==='create'&&current)fail('record_exists',409);
  if(input.action==='save'&&!source&&!current)fail('record_not_found',404);
  const before=current?.record??source;
  let next:RecordRow,baseVersion:number;
  if(input.action==='create'){
   const now=new Date().toISOString(),r=input.row;
   next={id,house_id:r['house_id'],player_id:r['player_id']??null,
    visibility:r['visibility'],kind:r['kind'],title:r['title'],
    content:r['content'],version:1,created_by:actor.uid,
    updated_by:actor.uid,created_at:now,updated_at:now,
    sync_state:'pending',last_synced_at:null,
    source_file_id:null,source_modified_at:null};
   baseVersion=0;
  }else{
   if(before===null)throw new RecordWriteError('access_denied',403);
   if(!editable(actor,before))throw new RecordWriteError('access_denied',403);
   if(before['version']!==input.expectedVersion)fail('record_version_conflict',409);
   if(current&&source&&!sameIdentity(source,current.record))fail('record_source_conflict',503);
   const now=new Date().toISOString();
   next={...before,title:input.title,content:input.content,
    version:input.expectedVersion+1,updated_by:actor.uid,
    updated_at:now,sync_state:'pending'};
   baseVersion=current?.baseVersion??Number(source?.['version']??0);
  }
  if(!editable(actor,next))fail('access_denied',403);
  const prior=before?{...before}:null;
  const overlay:OperationalRecord&{sourceSnapshotId:string}={
   id,baseVersion,version:next['version'] as number,record:next,
   previous:prior,updatedBy:actor.uid,
   updatedAt:next['updated_at'] as string,sourceSnapshotId:snapshotId,
  };
  const vkey=id+'|'+next['version'];
  const versionDoc=root.collection('recordVersions').doc(sha('record-version:'+vkey));
  const audit=root.collection('recordAudits').doc(sha('record-audit:'+requestDigest));
  const originalVersion=source&&!current?root.collection('recordVersions')
   .doc(sha('record-version:'+id+'|'+source['version'])):null;
  const [existingVersion,existingOriginal]=await Promise.all([
   tx.get(versionDoc),originalVersion?tx.get(originalVersion):Promise.resolve(null),
  ]);
  if(existingVersion.exists)fail('record_version_conflict',409);
  if(originalVersion&&!existingOriginal?.exists){
   tx.set(originalVersion,{record_id:id,version:source!['version'],
    snapshot:source,author:source!['updated_by']??null,
    created_at:source!['updated_at']??source!['created_at']??null,
    sourceSnapshotId:snapshotId});
  }
  tx.set(doc,overlay);
  tx.set(versionDoc,{record_id:id,version:next['version'],snapshot:next,
   author:actor.uid,created_at:next['updated_at'],sourceSnapshotId:snapshotId});
  tx.set(request,{actor:actor.uid,digest:requestDigest,record:next,
   recordId:id,version:next['version'],at:next['updated_at'],sourceSnapshotId:snapshotId});
  tx.set(audit,{actor:representation?.realActorUid??actor.uid,
   representedUid:representation?actor.uid:null,
   sessionNonce:representation?.sessionNonce??null,
   recordId:id,previousVersion:prior?.['version']??0,
   version:next['version'],action:input.action,at:next['updated_at'],
   sourceSnapshotId:snapshotId,requestDigest});
  if(representation)tx.create(root.collection('representationAudits').doc(randomUUID()),{
   action:'representation_save_record',realActorUid:representation.realActorUid,
   representedUid:actor.uid,playerId:actor.playerId,recordId:id,
   recordVersion:next['version'],sessionNonce:representation.sessionNonce,
   occurredAt:next['updated_at'],sourceSnapshotId:snapshotId,
  });
  return next;
 });
}
