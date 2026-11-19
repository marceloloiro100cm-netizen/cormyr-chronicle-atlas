/** Contas do Firebase, com alterações somente no runtime operacional.
 * Não reescreve migrationDomainStage, migração de senhas, fichas ou histórico.
 * Falha fechado quando o runtime ou as permissões não estão reconciliados.
 */
import {createHash,randomUUID} from 'node:crypto';
import {currentAccountAccess,listCurrentAccountAccess,
  operationalAccessCollection} from './operational-account-access.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const EMAIL=/^[^\s@]{1,100}@[^\s@]{1,150}\.[^\s@]{2,24}$/;
const KEY=/^[a-zA-Z0-9_-]{8,128}$/;
const hash=text=>createHash('sha256').update(text).digest('hex');
const error=(code,status=400)=>Object.assign(Error(code),{code,status});
const deny=(code,status)=>{throw error(code,status);};
const asObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
const listIds=v=>Array.isArray(v)&&v.length<=10&&
 v.every(x=>typeof x==='string'&&ID.test(x))&&new Set(v).size===v.length;
const asPassword=v=>typeof v==='string'&&v.length>=10&&v.length<=128;
const truth=v=>v===true||v===false;
const runtimeReady=(root,snapshot)=>root?.status==='active'&&root.private===true&&
 root.applicationEnabled===true&&root.sourceSnapshotId===snapshot&&
 root.sourceSnapshotReconciled===true;
const publicResult=a=>({
 uid:a.userId,playerId:a.playerId??null,name:a.name??null,
 profile:a.profile,active:a.active,memberHouseIds:a.memberHouseIds,
 editHouseIds:a.editHouseIds,attrHouseIds:a.attrHouseIds??[],
 rosterHouseId:a.rosterHouseId??null,
 requirePasswordChange:a.requirePasswordChange,version:a.version??0,
});

export function createFirebaseAccountService({
 db,auth,snapshotId,enabled=false,projectId,env=process.env,
 now=()=>new Date().toISOString(),
}={}){
 if(!enabled||projectId!=='cormyr'||!SHA.test(snapshotId??'')||
   env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||
   typeof db?.runTransaction!=='function'||
   typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
   deny('account_service_disabled',503);
 const domain=db.collection('migrationDomainStage').doc(snapshotId);
 const authStage=db.collection('migrationAuthStage').doc(snapshotId);
 const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
 const accounts=operationalAccessCollection(db,snapshotId);
 const requests=runtime.collection('accountRequests');
 const audit=runtime.collection('accountAudits');
 async function actor(token){
  if(typeof token!=='string'||token.length<10||token.length>10000)
   deny('authentication_required',401);
  let decoded,u;
  try{
   decoded=await auth.verifyIdToken(token,true);
   if(!ID.test(decoded?.uid))deny('authentication_required',401);
   u=await auth.getUser(decoded.uid);
  }catch{deny('authentication_required',401);}
  if(!u||u.uid!==decoded.uid||u.disabled)deny('authentication_required',401);
  return decoded.uid;
 }
 async function gate(){
  const docs=await Promise.all([domain.get(),authStage.get(),runtime.get()]);
  if(docs.slice(0,2).some(d=>!d.exists||d.data()?.status!=='complete'||d.data()?.private!==true)||
    !docs[2].exists||!runtimeReady(docs[2].data(),snapshotId))
   deny('account_runtime_not_ready',503);
 }
 async function narrator(token){
  const uid=await actor(token);
  const access=await currentAccountAccess(db,snapshotId,uid);
  if(access?.userId!==uid||access.profile!=='narrador'||access.admin!==true||
     access.active!==true||access.requirePasswordChange!==false||
     !listIds(access.memberHouseIds)||access.memberHouseIds.length||
     !listIds(access.editHouseIds)||access.editHouseIds.length)
   deny('narrator_required',403);
  await gate();
  return uid;
 }
 async function allowedHouses(member,edit,attr){
  if(!listIds(member)||!listIds(edit)||!listIds(attr)||
     edit.some(id=>!member.includes(id))||
     attr.some(id=>!edit.includes(id)))deny('invalid_house_scope');
  const docs=await Promise.all(member.map(id=>
   domain.collection('houses').doc(hash('house:'+id)).get()));
  if(docs.some((d,i)=>!d.exists||d.data()?.sourceId!==member[i]||
     d.data()?.active!==true||d.data()?.season!==2))
   deny('invalid_house_scope',403);
 }
 function normalizeAccount(input,old){
  if(!asObject(input)||!['jogador','editor'].includes(input.profile)||
     typeof input.name!=='string'||input.name.trim().length<2||
     input.name.length>160||!truth(input.active)||
     !truth(input.requireChange)||!listIds(input.memberHouseIds)||
     !listIds(input.editHouseIds)||!listIds(input.attrHouseIds))
   deny('invalid_account_request');
  if(input.profile==='editor'&&(input.memberHouseIds.length||
     input.editHouseIds.length||input.attrHouseIds.length))
   deny('editor_without_house_required');
  if(input.profile==='jogador'&&!input.memberHouseIds.length)
   deny('player_house_required');
  if(old&&(old.profile==='narrador'||old.admin===true))
   deny('narrator_cannot_be_reassigned',403);
  if(old&&old.profile!==input.profile&&old.profile!==null&&
     old.profile!==undefined)deny('role_transfer_requires_review',409);
  if(typeof input.email!=='string'||!EMAIL.test(input.email.trim().toLowerCase()))
   deny('invalid_account_email');
  const initial=!old;
  if(initial&&!asPassword(input.password))deny('initial_password_required');
  if(input.password!==undefined&&!asPassword(input.password))
   deny('invalid_initial_password');
  const members=[...input.memberHouseIds],edits=[...input.editHouseIds];
  const attrs=[...input.attrHouseIds];
  return {userId:old?.userId??null,name:input.name.trim(),email:input.email.trim().toLowerCase(),
   profile:input.profile,admin:false,
   active:input.active,
   playerId:input.profile==='editor'?null:old?.playerId??randomUUID(),
   memberHouseIds:members,editHouseIds:edits,attrHouseIds:attrs,
   rosterHouseId:input.profile==='editor'?null:members[0],
   // Admin cannot silently waive an outstanding required password rotation.
   requirePasswordChange:initial||Boolean(input.password)||
     old?.requirePasswordChange===true||input.requireChange===true,
  };
 }
 function digestInput(a){
  // Nunca persistir senha, nem hash reutilizável de senha.
  return hash(JSON.stringify([
   a.name,a.email,a.profile,a.active,a.playerId,
   a.memberHouseIds,a.editHouseIds,a.attrHouseIds,a.requirePasswordChange,
  ]));
 }
 async function submit(token,input){
  const actorUid=await narrator(token);
  if(!asObject(input)||!KEY.test(input.requestKey??'')||
     (input.targetUid!==undefined&&!ID.test(input.targetUid))||
     !Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)
   deny('invalid_account_request');
  const requestRef=requests.doc(hash('accounts:'+actorUid+':'+input.requestKey));
  const already=await requestRef.get();
  if(already.exists){
   if(already.data()?.actorUid!==actorUid||
      already.data()?.targetUid!==(input.targetUid??null))
    deny('request_key_conflict',409);
   const prior=already.data().result;
   // Uma falha de rede após o commit não pode deixar uma conta criada
   // desabilitada sem possibilidade de recuperação idempotente.
   if(!prior||!ID.test(prior.uid))deny('request_key_conflict',409);
   let user;
   try{user=await auth.getUser(prior.uid);}catch{deny('account_recovery_pending',503);}
   if(user.disabled===prior.active){
     try{await auth.updateUser(prior.uid,{disabled:!prior.active});}
     catch{deny('account_recovery_pending',503);}
   }
   return {...prior,duplicate:true};
  }
  const target=input.targetUid??null;
  const old=target?await currentAccountAccess(db,snapshotId,target):null;
  if(target&&(!old||old.profile==='narrador'))
   deny('account_not_found',404);
  if((old?.version??0)!==input.expectedVersion)deny('version_conflict',409);
  const next=normalizeAccount(input,old);
  await allowedHouses(next.memberHouseIds,next.editHouseIds,next.attrHouseIds);
  let person=null,created=false;
  if(target){
   try{person=await auth.getUser(target);}catch{deny('account_not_found',404);}
   if(person.email?.toLowerCase()!==next.email)
    deny('email_change_requires_separate_review',409);
  }else{
   try{person=await auth.getUserByEmail(next.email);}catch(e){
    if(e?.code!=='auth/user-not-found')deny('account_lookup_unavailable',503);
   }
   if(person)deny('email_already_registered',409);
   try{
    person=await auth.createUser({
      email:next.email,password:input.password,displayName:next.name,disabled:true,
    });
    created=true;
   }catch{deny('account_creation_failed',503);}
  }
  const uid=person.uid;
  const nowAt=now();
  const account={...next,userId:uid,version:(old?.version??0)+1,
    updatedBy:actorUid,updatedAt:nowAt,source:'firebase-account-operations'};
  const f=digestInput(account);
  const key=hash('account-event:'+uid+':'+input.requestKey);
  try{
   if(!created&&next.active===false&&person.disabled!==true)
     await auth.updateUser(uid,{disabled:true});
   if(!created&&input.password)
     await auth.updateUser(uid,{password:input.password,displayName:next.name});
   await db.runTransaction(async tx=>{
     const [live,source,previous,request]=await Promise.all([
       tx.get(runtime),tx.get(domain.collection('access').doc(uid)),
       tx.get(accounts.doc(uid)),tx.get(requestRef),
     ]);
     if(!runtimeReady(live.data(),snapshotId))deny('account_runtime_not_ready',503);
     if(request.exists)deny('request_key_conflict',409);
     if(source.data()?.profile==='narrador')deny('narrator_cannot_be_reassigned',403);
     const version=previous.exists?previous.data()?.version??0:source.data()?.version??0;
     if(version!==input.expectedVersion)deny('version_conflict',409);
     if(created&&source.exists)deny('source_account_conflict',409);
     const result=publicResult(account);
     tx.set(accounts.doc(uid),account);
     tx.create(requestRef,{actorUid,targetUid:target,result,
       operationFingerprint:f,at:nowAt});
     tx.create(audit.doc(key),{actorUid,targetUid:uid,
       action:created?'create':'update',version:account.version,
       requestKeyDigest:hash(input.requestKey),at:nowAt});
   });
   // Sem habilitar uma conta antes de sua autorização estar persistida.
   await auth.updateUser(uid,{displayName:next.name,disabled:!next.active});
   if(!created&&typeof auth.revokeRefreshTokens==='function')
     await auth.revokeRefreshTokens(uid);
   return {...publicResult(account),duplicate:false};
  }catch{
   // Uma conta criada que não concluiu a autorização segue desabilitada.
   if(created)try{await auth.updateUser(uid,{disabled:true});}catch{/* revisão */ }
   deny('account_operation_incomplete',503);
  }
 }
 async function list(token){
  await narrator(token);
  const [all,users]=await Promise.all([
    listCurrentAccountAccess(db,snapshotId),auth.listUsers(1000),
  ]);
  if(!Array.isArray(users?.users)||users.pageToken)
    deny('account_inventory_unavailable',503);
  const byUid=new Map(users.users.map(u=>[u.uid,u]));
  return {items:all.filter(a=>
    a.profile!=='narrador'&&a.admin===false&&byUid.has(a.userId))
   .map(a=>{
     const user=byUid.get(a.userId);
     return {...publicResult(a),email:user.email??null,
       name:a.name??user.displayName??null};
   }),readOnly:true};
 }
 async function status(token){
  const uid=await actor(token);
  const v=await currentAccountAccess(db,snapshotId,uid);
  if(!v||v.userId!==uid)deny('access_denied',403);
  return {profile:v.profile,active:v.active===true,
   requirePasswordChange:v.requirePasswordChange===true};
 }
 async function completePassword(token,input){
  const uid=await actor(token);
  if(!asObject(input)||!asPassword(input.password)||!KEY.test(input.requestKey??''))
    deny('invalid_password_request');
  await gate();
  const access=await currentAccountAccess(db,snapshotId,uid);
  if(!access||access.userId!==uid||access.active!==true||
     !['jogador','editor'].includes(access.profile))
   deny('password_change_not_required',403);
  // Mudança de senha acontece no Firebase Admin, não no Supabase.
  try{await auth.updateUser(uid,{password:input.password});}
  catch{deny('password_update_failed',503);}
  const nowAt=now(),ref=accounts.doc(uid),auditRef=audit.doc(hash('password:'+uid+':'+input.requestKey));
  try{
   await db.runTransaction(async tx=>{
     const [live,prev]=await Promise.all([tx.get(runtime),tx.get(ref)]);
     if(!runtimeReady(live.data(),snapshotId))deny('account_runtime_not_ready',503);
     const current=prev.exists?prev.data():access;
     if(current.userId!==uid||current.active!==true||
        current.profile==='narrador')deny('access_denied',403);
     const updated={...current,requirePasswordChange:false,
       version:(current.version??0)+1,updatedBy:uid,updatedAt:nowAt};
     tx.set(ref,updated);
     tx.create(auditRef,{actorUid:uid,targetUid:uid,
       action:'password_completed',version:updated.version,at:nowAt});
   });
   if(typeof auth.revokeRefreshTokens==='function')
     await auth.revokeRefreshTokens(uid);
   return {changed:true,loginRequired:true};
  }catch{deny('password_updated_access_pending',503);}
 }
 return {submit,list,status,completePassword};
}
