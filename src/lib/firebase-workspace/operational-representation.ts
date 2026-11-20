/* eslint-disable @typescript-eslint/no-explicit-any -- fronteira Firebase Admin. */
/** Item 8: representação pelo Narrador, sem autenticar como o jogador. */
import {randomUUID,createHash} from 'node:crypto';
import type {Scope} from './service';
import {chooseCurrentAccountAccess}
 from '../../../scripts/firebase/operational-account-access.mjs';
import {activeSeason2HouseScopeValid}
 from '../../../scripts/firebase/cloud-season2-house-scope.mjs';

const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const safe=(s:unknown):s is string=>typeof s==='string'&&
 s.length>0&&s.length<=128&&!/[\/\u0000-\u001f\u007f]/.test(s);
export const REPRESENTATION_DURATION_MS=30*60*1000;
export class RepresentationError extends Error{
 constructor(readonly code:string,readonly status=403){super(code);}
}
const deny=(code:string,status=403):never=>{throw new RepresentationError(code,status);};
export const representationSessionDoc=(db:any,snapshotId:string,uid:string)=>
 db.collection('campaignCloudRuntime').doc(snapshotId)
 .collection('representationSessions').doc(uid);
export const representationAuditDoc=(root:any)=>root.collection('representationAudits').doc(randomUUID());
type Context={db:any;snapshotId:string;actor:Scope;players:Record<string,any>[]};
type Session={actorUid:string;representedUid:string;playerId:string;
 nonce:string;startedAt:string;expiresAt:string;sourceSnapshotId:string};
function narrator(scope:Scope){
 if(scope.profile!=='narrador'||!safe(scope.uid))deny('representation_denied');
}
function runtime(v:any,snapshot:string){
 if(!v||v.status!=='active'||v.private!==true||
 v.applicationEnabled!==true||v.sourceSnapshotId!==snapshot||
 v.sourceSnapshotReconciled!==true||v.representationReadApproved!==true)
  deny('representation_not_approved',503);
}
async function proof(tx:any,db:any,root:any,snapshot:string,
 actor:Scope,targetUid:string,playerId:string){
 const archived=db.collection('migrationDomainStage').doc(snapshot).collection('access');
 const [actorDoc,archivedTarget,overlayTarget,rt]=await Promise.all([
  tx.get(archived.doc(actor.uid)),tx.get(archived.doc(targetUid)),
  tx.get(root.collection('accountAccess').doc(targetUid)),tx.get(root),
 ]);
 runtime(rt.data(),snapshot);
 const narratorAccount=actorDoc.data();
 if(!actorDoc.exists||narratorAccount?.userId!==actor.uid||
  narratorAccount?.admin!==true||narratorAccount?.profile!=='narrador'||
  narratorAccount?.active!==true||
  narratorAccount?.requirePasswordChange!==false)
  deny('representation_denied');
 let target:any;
 try{target=chooseCurrentAccountAccess(targetUid,
  archivedTarget.exists?archivedTarget.data():null,
  overlayTarget.exists?overlayTarget.data():null,rt.data());}
 catch{deny('representation_scope_invalid');}
 if(!target||target.userId!==targetUid||target.playerId!==playerId||
  target.profile!=='jogador'||target.admin!==false||
  target.active!==true||target.requirePasswordChange!==false||
  !Array.isArray(target.memberHouseIds)||!Array.isArray(target.editHouseIds)||
  target.memberHouseIds.length<1||target.memberHouseIds.some((h:unknown)=>!safe(h))||
  target.editHouseIds.some((h:unknown)=>!target.memberHouseIds.includes(h)))
  deny('representation_player_inactive');
 const houses=db.collection('migrationDomainStage').doc(snapshot).collection('houses');
 const docs=await Promise.all(target.memberHouseIds.map((id:string)=>
  tx.get(houses.doc(digest('house:'+id)))));
 if(!activeSeason2HouseScopeValid({
  memberHouseIds:target.memberHouseIds,editHouseIds:target.editHouseIds,
  houseDocuments:docs,
 }))deny('representation_house_invalid');
 return {uid:targetUid,profile:'jogador' as const,playerId,
  memberHouseIds:[...target.memberHouseIds] as string[],
  editHouseIds:[...target.editHouseIds] as string[]};
}
function sourcePlayer(players:Record<string,any>[],id:string,targetUid:string){
 const p=players.find(row=>row['id']===id);
 if(!p||p['user_id']!==targetUid||p['active']!==true||
  p['require_password_change']===true)
  deny('representation_player_inactive');
 return p;
}
function validSession(value:any,actor:Scope,snapshot:string){
 const session=value as Session|null;
 if(!session||session.actorUid!==actor.uid||
  session.sourceSnapshotId!==snapshot||!safe(session.playerId)||
  !safe(session.representedUid)||!safe(session.nonce)||
  !Number.isFinite(Date.parse(session.expiresAt))||
  Date.parse(session.expiresAt)<=Date.now())
  return deny('representation_expired',409);
 return session;
}
export async function startRepresentation({db,snapshotId,actor,players}:Context,playerId:unknown){
 narrator(actor);
 if(process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']!=='true')
  deny('representation_disabled',501);
 if(!safe(playerId))return deny('representation_player_invalid',400);
 const row=players.find(p=>p['id']===playerId);
 const targetUid=row?.['user_id'];
 if(!safe(targetUid)||targetUid===actor.uid)
  return deny('representation_player_inactive',404);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 return db.runTransaction(async(tx:any)=>{
  const scope=await proof(tx,db,root,snapshotId,actor,targetUid,playerId);
  sourcePlayer(players,playerId,scope.uid);
  const ref=representationSessionDoc(db,snapshotId,actor.uid);
  const old=await tx.get(ref);
  if(old.exists&&old.data()?.playerId!==playerId)
   deny('representation_already_active',409);
  if(old.exists&&Date.parse(old.data()?.expiresAt)>Date.now()){
   return {playerId,expiresAt:old.data().expiresAt,alreadyActive:true};
  }
  const now=new Date(),session:Session={
   actorUid:actor.uid,representedUid:scope.uid,playerId,nonce:randomUUID(),
   startedAt:now.toISOString(),
   expiresAt:new Date(now.getTime()+REPRESENTATION_DURATION_MS).toISOString(),
   sourceSnapshotId:snapshotId,
  };
  tx.set(ref,session);
  tx.create(representationAuditDoc(root),{
   action:'representation_start',realActorUid:actor.uid,
   representedUid:scope.uid,playerId,sessionNonce:session.nonce,
   occurredAt:session.startedAt,sourceSnapshotId:snapshotId,
  });
  return {playerId,expiresAt:session.expiresAt,alreadyActive:false};
 });
}
export async function stopRepresentation({db,snapshotId,actor}:Omit<Context,'players'>){
 narrator(actor);
 if(process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']!=='true')
  deny('representation_disabled',501);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 return db.runTransaction(async(tx:any)=>{
  const [runtimeDoc,adminDoc,doc]=await Promise.all([
   tx.get(root),tx.get(db.collection('migrationDomainStage').doc(snapshotId)
    .collection('access').doc(actor.uid)),
   tx.get(representationSessionDoc(db,snapshotId,actor.uid)),
  ]);
  runtime(runtimeDoc.data(),snapshotId);
  const current=adminDoc.data();
  if(current?.admin!==true||current?.profile!=='narrador'||
     current?.active!==true||current?.requirePasswordChange!==false)
   deny('representation_denied');
  if(!doc.exists)return {stopped:false};
  const session=doc.data();
  if(session?.actorUid!==actor.uid||session?.sourceSnapshotId!==snapshotId)
   deny('representation_corrupted',503);
  const at=new Date().toISOString();
  tx.delete(representationSessionDoc(db,snapshotId,actor.uid));
  tx.create(representationAuditDoc(root),{
   action:'representation_stop',realActorUid:actor.uid,
   representedUid:session.representedUid,playerId:session.playerId,
   sessionNonce:session.nonce,occurredAt:at,sourceSnapshotId:snapshotId,
  });
  return {stopped:true};
 });
}
export async function loadRepresentation({db,snapshotId,actor,players}:Context){
 narrator(actor);
 if(process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']!=='true')
  deny('representation_disabled',501);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 return db.runTransaction(async(tx:any)=>{
  const doc=await tx.get(representationSessionDoc(db,snapshotId,actor.uid));
  const session=validSession(doc.exists?doc.data():null,actor,snapshotId);
  const scope=await proof(tx,db,root,snapshotId,actor,
   session.representedUid,session.playerId);
  const player=sourcePlayer(players,session.playerId,scope.uid);
  return {scope,session,player};
 });
}
