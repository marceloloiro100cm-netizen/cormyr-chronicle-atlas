/**
 * Narrator-private content and audited representation. Firestore Emulator
 * ONLY; no public endpoint. Authorization comes from server-side access docs.
 * Mail actions (send/reply/draft/delete) are wired by app integration via
 * `handlers`; without a handler they are refused, never improvised.
 */
import {randomUUID,createHash} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT,gmDocId,vassalDocId} from './stage-private-gm-emulator.mjs';
import {ROOT as RECORD_ROOT,versionDocId} from './stage-records-emulator.mjs';
import {requireNarrator,startRepresentation,stopRepresentation,requireSession,readAs,saveRecordAs,
  auditFor,ACTIONS,PrivateGmError} from './private-gm-core.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const h=(t,id)=>createHash('sha256').update(t+':'+id).digest('hex');

export function createEmulatorPrivateGmService({db,auth,snapshotId,handlers={},env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated private GM configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const content=stage.collection('content'),vassal=stage.collection('vassal'),
    auditCol=stage.collection('audit'),sessions=stage.collection('sessions');
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const access=domain.collection('access'),players=domain.collection('players'),houses=domain.collection('houses');
  const recStage=db.collection(RECORD_ROOT).doc(snapshotId);
  const records=recStage.collection('records'),versions=recStage.collection('versions');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new PrivateGmError('denied','Acesso restrito ao Narrador');}
  };
  const narrator=async(tx,uid)=>{
    const raw=(await tx.get(access.doc(uid))).data();
    if(!raw||raw.userId!==uid)throw new PrivateGmError('denied','Acesso restrito ao Narrador');
    requireNarrator(raw);
  };
  const playerDoc=async(tx,playerId)=>{
    const s=await tx.get(players.doc(h('player',playerId)));
    return s.exists?s.data():null;
  };
  const writeAudit=(tx,a)=>tx.set(auditCol.doc(randomUUID()),a);
  return {
    async getGmContent(idToken,id){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const s=await tx.get(content.doc(gmDocId(String(id))));
        if(!s.exists)throw new PrivateGmError('invalid','Conteúdo não encontrado');
        return s.data();
      });
    },
    async listGmContent(idToken){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        return (await tx.get(content)).docs.map(d=>({id:d.data().id,updatedAt:d.data().updatedAt}))
          .sort((a,b)=>a.id.localeCompare(b.id));
      });
    },
    /** Server-side only (Edge-function equivalent): service_role-only vassal workbooks. */
    async serverGetVassalWorkbook({parentHouseId,vassalHouseId}){
      const s=await vassal.doc(vassalDocId(String(parentHouseId),String(vassalHouseId))).get();
      return s.exists?s.data():null;
    },
    async startRepresentation(idToken,playerId){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const player=await playerDoc(tx,String(playerId));
        const pa=player&&player.userId?(await tx.get(access.doc(player.userId))).data():null;
        const r=startRepresentation({actorUid:uid,player,playerAccess:pa});
        tx.set(sessions.doc(uid),r.session);
        writeAudit(tx,r.audit);
        return {playerId:r.session.playerId,expiresAt:r.session.expiresAt};
      });
    },
    async stopRepresentation(idToken){
      const uid=await uidOf(idToken);
      return db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const s=await tx.get(sessions.doc(uid));
        const r=stopRepresentation({actorUid:uid,session:s.exists?s.data():null});
        if(r.audit)writeAudit(tx,r.audit);
        if(s.exists)tx.delete(sessions.doc(uid));
        return {stopped:s.exists};
      });
    },
    async representationAction(idToken,action,args={}){
      const uid=await uidOf(idToken);
      if(!ACTIONS.has(action))throw new PrivateGmError('invalid','Action não autorizada');
      const external=action!=='read'&&action!=='save_record';
      if(external&&typeof handlers[action]!=='function')
        throw new PrivateGmError('invalid','Ação ainda não disponível neste ambiente');
      let ctx=null;
      const result=await db.runTransaction(async tx=>{
        await narrator(tx,uid);
        const s=await tx.get(sessions.doc(uid));
        const session=s.exists?s.data():null;
        const player=session?await playerDoc(tx,session.playerId):null;
        const pa=player&&player.userId?(await tx.get(access.doc(player.userId))).data():null;
        const scope=requireSession({session,player,playerAccess:pa});
        ctx={player,scope};
        if(action==='read'){
          const [hs,rs]=await Promise.all([tx.get(houses),tx.get(records)]);
          return readAs({scope,player,houses:hs.docs.map(d=>d.data()),records:rs.docs.map(d=>d.data())});
        }
        if(action==='save_record'){
          const id=args&&typeof args.id==='string'?args.id:null;
          if(!id)throw new PrivateGmError('invalid','Registro inválido');
          const snap=await tx.get(records.doc(id));
          const r=saveRecordAs({scope,record:snap.exists?snap.data():null,args});
          tx.set(records.doc(id),r.record);
          tx.set(versions.doc(versionDocId(r.version.recordId,r.version.version)),r.version);
          writeAudit(tx,auditFor({actorUid:uid,player,action,args,resultId:id}));
          return {id,version:r.record.version};
        }
        return null;
      });
      if(!external)return result;
      // External (mail) actions run as the represented player; audited after success.
      const out=await handlers[action]({playerId:ctx.player.id,userId:ctx.player.userId,actorUid:uid,args});
      await db.runTransaction(async tx=>{
        writeAudit(tx,auditFor({actorUid:uid,player:ctx.player,action,args,resultId:out&&out.id}));
      });
      return out;
    },
  };
}
