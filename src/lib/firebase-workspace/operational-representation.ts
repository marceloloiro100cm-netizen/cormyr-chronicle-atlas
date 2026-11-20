/* eslint-disable @typescript-eslint/no-explicit-any -- fronteira segura do Firebase Admin. */
/** Representação administrativa: o Narrador nunca autentica como o jogador. */
import {randomUUID,createHash} from 'node:crypto';
import type {Scope} from './service';
import {chooseCurrentAccountAccess} from '../../../scripts/firebase/operational-account-access.mjs';
import {startRepresentation,requireSession}
 from '../../../scripts/firebase/private-gm-core.mjs';

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const valid=(s:unknown):s is string=>typeof s==='string'&&
 s.length>0&&s.length<=128&&!/[\/\u0000-\u001f\u007f]/.test(s);
const SNAP=/^[a-f0-9]{64}$/;
export class RepresentationError extends Error{
 constructor(readonly code:string,readonly status:number=403){super(code);}
}
const deny=(code:string,status=403):never=>{throw new RepresentationError(code,status);};
const enabled=()=>process.env['CORMYR_FIREBASE_REPRESENTATION_ENABLED']==='true';
export type RepresentationIdentity={
 playerId:string;representedUid:string;actorUid:string;sessionId:string;
 expiresAt:string;scope:Scope;
};
export type RepresentationGate={
 actorUid:string;representedUid:string;playerId:string;sessionId:string;
};
type Input={db:any;auth:any;snapshotId:string;actor:Scope;
 importedPlayers:{id:unknown;user_id:unknown;name?:unknown}[]};
const rootReady=(d:any,snapshot:string,write:boolean)=>{
 if(!d||d.status!=='active'||d.private!==true||
   d.applicationEnabled!==true||d.sourceSnapshotId!==snapshot||
   d.sourceSnapshotReconciled!==true||d.representationReadApproved!==true||
   write&&d.representationWriteApproved!==true)
  deny('representation_not_approved',503);
};
function mapError(e:unknown):never{
 if(e instanceof RepresentationError)throw e;
 const code=(e as {code?:string})?.code;
 if(code==='denied')deny('representation_access_denied',403);
 if(code==='invalid')deny('representation_player_invalid',400);
 throw e;
}
export function createRepresentationService({db,auth,snapshotId,actor,importedPlayers}:Input){
 if(!SNAP.test(snapshotId)||typeof db?.runTransaction!=='function'||
   typeof auth?.getUser!=='function')deny('representation_unavailable',503);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const sessions=root.collection('representationSessions');
 const audits=root.collection('representationAudits');
 const archive=db.collection('migrationDomainStage').doc(snapshotId);
 const archiveAccess=archive.collection('access');
 const activePlayer=(playerId:string,uid:string)=>({
  id:playerId,userId:uid,active:true,requirePasswordChange:false,
 });
 const requireActor=()=>{
  if(actor.profile!=='narrador')deny('representation_access_denied',403);
  if(!enabled())deny('representation_disabled',501);
 };
 const verifiedUser=async(uid:string)=>{
  if(!valid(uid))deny('representation_player_invalid',400);
  try{const user=await auth.getUser(uid);
   if(user?.uid!==uid||user.disabled===true)deny('representation_player_inactive',403);
  }catch(e){if(e instanceof RepresentationError)throw e;
   deny('representation_player_inactive',403);}
 };
 const effective=async(tx:any,uid:string,rt:any)=>{
  const [archived,overlay]=await Promise.all([
   tx.get(archiveAccess.doc(uid)),tx.get(root.collection('accountAccess').doc(uid)),
  ]);
  let access:any;
  try{access=chooseCurrentAccountAccess(uid,
   archived.exists?archived.data():null,
   overlay.exists?overlay.data():null,rt);}
  catch{return deny('representation_access_invalid',403);}
  if(!access||access.userId!==uid||access.profile!=='jogador'||
     access.admin!==false||access.active!==true||
     access.requirePasswordChange!==false||
     !valid(access.playerId)||!Array.isArray(access.memberHouseIds)||
     !Array.isArray(access.editHouseIds)||
     !access.memberHouseIds.every(valid)||!access.editHouseIds.every(valid)||
     access.editHouseIds.some((h:string)=>!access.memberHouseIds.includes(h)))
    deny('representation_access_invalid',403);
  const houseDocs=await Promise.all(access.memberHouseIds.map((id:string)=>
   tx.get(archive.collection('houses').doc(hash('house:'+id)))));
  if(houseDocs.some((d:any,i:number)=>!d.exists||
    d.data()?.sourceId!==access.memberHouseIds[i]||
    d.data()?.active!==true||d.data()?.season!==2))
    deny('representation_house_not_approved',403);
  return access;
 };
 const getSession=async(tx:any,rt:any,raw:any):Promise<RepresentationIdentity>=>{
  if(!raw||raw.actor!==actor.uid||!valid(raw.representedUid)||
     !valid(raw.sessionId)||!valid(raw.playerId))
   deny('representation_session_missing',403);
  const access=await effective(tx,raw.representedUid,rt);
  if(access.playerId!==raw.playerId)deny('representation_access_changed',403);
  let playerScope:any;
  try{playerScope=requireSession({session:raw,
   player:activePlayer(raw.playerId,raw.representedUid),
   playerAccess:access,now:new Date()});}
  catch(e){return mapError(e);}
  return {playerId:raw.playerId,representedUid:raw.representedUid,
   actorUid:actor.uid,sessionId:raw.sessionId,expiresAt:raw.expiresAt,
   scope:{uid:raw.representedUid,profile:'jogador',
    playerId:playerScope.playerId,
    memberHouseIds:[...playerScope.memberHouseIds],
    editHouseIds:[...playerScope.editHouseIds]}};
 };
 return {
  async start(playerId:unknown){
   requireActor();
   if(!valid(playerId))return deny('representation_player_invalid',400);
   // Não basta confiar na lista exibida no navegador.
   const fromArchive=importedPlayers.find(p=>p.id===playerId);
   const uid=fromArchive?.user_id;
   if(!valid(uid))return deny('representation_player_invalid',404);
   await verifiedUser(uid);
   return db.runTransaction(async(tx:any)=>{
    const rt=await tx.get(root);
    rootReady(rt.data(),snapshotId,true);
    const access=await effective(tx,uid,rt.data());
    if(access.playerId!==playerId)deny('representation_player_invalid',403);
    let proposed:any;
    try{proposed=startRepresentation({actorUid:actor.uid,
     player:activePlayer(playerId,uid),playerAccess:access});}
    catch(e){return mapError(e);}
    const sessionId=randomUUID(),session={...proposed.session,
     representedUid:uid,sessionId,sourceSnapshotId:snapshotId};
    const now=new Date().toISOString();
    const prior=await tx.get(sessions.doc(actor.uid));
    if(prior.exists&&prior.data()?.actor!==actor.uid)
     deny('representation_session_invalid',503);
    // O encerramento anterior é registrado ao trocar de jogador.
    if(prior.exists)tx.create(audits.doc(randomUUID()),{
     actorUid:actor.uid,representedUid:prior.data()?.representedUid??null,
     playerId:prior.data()?.playerId??null,sessionId:prior.data()?.sessionId??null,
     action:'representation_stop',at:now,reason:'switch_player',
     sourceSnapshotId:snapshotId});
    tx.set(sessions.doc(actor.uid),session);
    tx.create(audits.doc(randomUUID()),{
     actorUid:actor.uid,representedUid:uid,playerId,
     sessionId,action:'representation_start',at:now,
     sourceSnapshotId:snapshotId});
    return {playerId,sessionId,expiresAt:session.expiresAt};
   });
  },
  async stop(){
   requireActor();
   return db.runTransaction(async(tx:any)=>{
    const [rt,snap]=await Promise.all([
     tx.get(root),tx.get(sessions.doc(actor.uid)),
    ]);
    rootReady(rt.data(),snapshotId,false);
    if(!snap.exists)return {stopped:false};
    const session=snap.data();
    if(session?.actor!==actor.uid)deny('representation_session_invalid',503);
    const at=new Date().toISOString();
    tx.delete(sessions.doc(actor.uid));
    tx.create(audits.doc(randomUUID()),{
     actorUid:actor.uid,representedUid:session.representedUid,
     playerId:session.playerId,sessionId:session.sessionId,
     action:'representation_stop',at,sourceSnapshotId:snapshotId});
    return {stopped:true};
   });
  },
  async identity({write=false}:{write?:boolean}={}):Promise<RepresentationIdentity>{
   requireActor();
   // A conta representada é checada novamente, sem reutilizar autenticação.
   const snap=await sessions.doc(actor.uid).get();
   if(!snap.exists||snap.data()?.actor!==actor.uid)
    deny('representation_session_missing',403);
   await verifiedUser(snap.data().representedUid);
   return db.runTransaction(async(tx:any)=>{
    const [rt,current]=await Promise.all([
     tx.get(root),tx.get(sessions.doc(actor.uid)),
    ]);
    rootReady(rt.data(),snapshotId,write);
    if(!current.exists||current.data()?.sessionId!==snap.data()?.sessionId)
     deny('representation_session_changed',409);
    return getSession(tx,rt.data(),current.data());
   });
  },
 };
}
