/**
 * Transactional battle service. Firestore Emulator ONLY; no public endpoint.
 * Authorization comes from server-side access docs at request time. The game
 * rules stay in the TypeScript engine, injected as `engine`:
 *   verifyReplay(file) -> final state      (throws when the file is not valid)
 *   applyCommand(state,command,actor) -> next state
 *   replayLive(file) -> live game          applyLiveStep(game,step) -> next game
 *   captureLive(game) -> replay file with finalHash
 * This service owns persistence, CAS, idempotency, hash chain and permissions.
 */
import {createHash,randomUUID} from 'node:crypto';
import {ROOT} from './stage-battle-emulator.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import * as core from './battle-core.mjs';

const {BattleError}=core;
const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const houseDocId=id=>createHash('sha256').update('house:'+id).digest('hex');

export function createEmulatorBattleService({db,auth,snapshotId,engine={},env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated battle configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const C=n=>stage.collection(n);
  const sessions=C('sessions'),states=C('states'),events=C('events'),scenarios=C('scenarios'),invitations=C('invitations'),
    live=C('live'),liveReplays=C('liveReplays'),roster=C('roster'),monsters=C('monsters'),dndSessions=C('dndSessions'),
    overrides=C('overrides'),custom=C('custom'),verified=C('verified');
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const access=domain.collection('access'),houses=domain.collection('houses');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new BattleError('denied','Acesso negado');}
  };
  const run=async(idToken,fn)=>{
    const uid=await uidOf(idToken);
    return db.runTransaction(async tx=>fn(tx,core.battleScope(uid,(await tx.get(access.doc(uid))).data())));
  };
  const data=s=>s&&s.exists?s.data():null;
  const docs=async(tx,q)=>(await tx.get(q)).docs.map(d=>d.data());
  const need=(fn,name)=>{if(typeof engine[fn]!=='function')throw new BattleError('invalid','Motor de regras não configurado: '+name);return engine[fn];};
  const duplicateOf=async(tx,sessionId,commandId)=>{
    const q=await tx.get(events.where('sessionId','==',sessionId).where('commandId','==',commandId).limit(1));
    return q.empty?null:q.docs[0].data();
  };
  const writeStep=(tx,plan)=>{
    tx.set(events.doc(plan.event.sessionId+':'+plan.event.seq),plan.event);
    tx.set(sessions.doc(plan.session.id),plan.session);
    tx.set(states.doc('current:'+plan.session.id),{sessionId:plan.session.id,kind:'current',json:plan.currentJson});
  };
  const houseActive=async(tx,id)=>{
    const h=data(await tx.get(houses.doc(houseDocId(String(id)))));
    return !!h&&h.active===true&&h.season===2;
  };

  return {
    /* ---- saved simulation sessions ---- */
    async commitReplay(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const p=core.commitReplay({actor,...input,newId:randomUUID});
        tx.set(sessions.doc(p.id),p.session);
        for(const s of p.states)tx.set(states.doc(s.id),s);
        for(const e of p.events)tx.set(events.doc(e.sessionId+':'+e.seq),e);
        return {id:p.id,stateVersion:p.session.stateVersion};
      });
    },
    async commitStep(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const id=String(input.sessionId);
        const [s,dup]=await Promise.all([tx.get(sessions.doc(id)),duplicateOf(tx,id,String(input.commandId))]);
        const r=core.commitStep({actor,session:data(s),duplicate:dup,expected:input.expectedVersion,commandId:input.commandId,
          command:input.command,receipt:input.receipt,current:input.current,prevHash:input.prevHash,stateHash:input.stateHash});
        if(!r.duplicate)writeStep(tx,r);
        return r.result;
      });
    },
    async listSaved(idToken){
      return run(idToken,async(tx,actor)=>core.listSaved({actor,sessions:await docs(tx,sessions)}));
    },
    async readSaved(idToken,sessionId){
      const verify=need('verifyReplay','verifyReplay');
      return run(idToken,async(tx,actor)=>{
        const id=String(sessionId);
        const [s,ini,cur,evs]=await Promise.all([tx.get(sessions.doc(id)),tx.get(states.doc('initial:'+id)),
          tx.get(states.doc('current:'+id)),docs(tx,events.where('sessionId','==',id))]);
        const file=core.assembleReplay({actor,session:data(s),initial:data(ini),events:evs});
        const state=verify(file);
        core.checkSavedIntegrity({session:data(s),current:data(cur),verifiedState:state});
        return {id,name:data(s).name,status:data(s).status,stateVersion:data(s).stateVersion,replay:file};
      });
    },
    async applySavedCommand(idToken,input){
      const applyCommand=need('applyCommand','applyCommand');
      return run(idToken,async(tx,actor)=>{
        const id=String(input.sessionId);
        const [s,cur,dup]=await Promise.all([tx.get(sessions.doc(id)),tx.get(states.doc('current:'+id)),
          duplicateOf(tx,id,String(input.commandId))]);
        const plan=core.planSavedCommand({actor,session:data(s),current:data(cur),duplicate:dup,expectedVersion:input.expectedVersion,
          commandId:input.commandId,command:input.command,applyCommand});
        if(plan.duplicate)return plan.result;
        const r=core.commitStep({actor,session:data(s),duplicate:null,...plan.commitArgs});
        writeStep(tx,r);
        return r.result;
      });
    },

    /* ---- live V3 matches ---- */
    async liveCreate(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const [a,d]=await Promise.all([houseActive(tx,input.attackerHouseId),houseActive(tx,input.defenderHouseId)]);
        const p=core.createLive({actor,...input,housesActive:{[input.attackerHouseId]:a,[input.defenderHouseId]:d},newId:randomUUID});
        tx.set(live.doc(p.match.id),p.match);
        tx.set(liveReplays.doc(p.replay.id),{matchId:p.replay.id,json:p.replay.json});
        return {id:p.match.id};
      });
    },
    async liveList(idToken){
      return run(idToken,async(tx,actor)=>core.listLive({actor,matches:await docs(tx,live)}));
    },
    async liveGet(idToken,matchId){
      const replayLive=need('replayLive','replayLive');
      return run(idToken,async(tx,actor)=>{
        const id=String(matchId);
        const [m,r]=await Promise.all([tx.get(live.doc(id)),tx.get(liveReplays.doc(id))]);
        const match=core.visibleLive(actor,data(m));
        return core.liveView({actor,match,game:replayLive(JSON.parse(data(r).json))});
      });
    },
    async livePlay(idToken,input){
      const replayLive=need('replayLive','replayLive'),applyStep=need('applyLiveStep','applyLiveStep'),capture=need('captureLive','captureLive');
      return run(idToken,async(tx,actor)=>{
        const id=String(input.matchId);
        const [m,r]=await Promise.all([tx.get(live.doc(id)),tx.get(liveReplays.doc(id))]);
        const match=core.visibleLive(actor,data(m));
        const out=core.playLive({actor,match,game:replayLive(JSON.parse(data(r).json)),expectedVersion:input.expectedVersion,
          step:input.step,applyStep,capture});
        tx.set(live.doc(id),out.match);
        tx.set(liveReplays.doc(id),{matchId:id,json:out.replay.json});
        return out.result;
      });
    },

    /* ---- invitations ---- */
    async inviteCreate(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const active=typeof input?.houseId==='string'&&input.houseId?await houseActive(tx,input.houseId):false;
        const p=core.createInvitation({actor,input,houseActive:active,newId:randomUUID});
        tx.set(invitations.doc(p.id),p.doc);
        return {id:p.id};
      });
    },
    async inviteList(idToken){
      return run(idToken,async(tx,actor)=>core.listInvitations({actor,invitations:await docs(tx,invitations)}));
    },
    async inviteClose(idToken,id){
      return run(idToken,async(tx,actor)=>{
        const inv=data(await tx.get(invitations.doc(String(id))));
        const next=core.closeInvitation({actor,invitation:inv});
        tx.set(invitations.doc(String(id)),next);
        return {id:String(id),status:'closed'};
      });
    },

    /* ---- narrator-only D&D stores ---- */
    async dndSave(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const row=core.dndSave({actor,...input});
        tx.set(dndSessions.doc(core.dndSessionDocId(row.ownerId,row.battleId)),row);
        return {battleId:row.battleId};
      });
    },
    async dndList(idToken){
      return run(idToken,async(tx,actor)=>core.dndList({actor,sessions:await docs(tx,dndSessions.where('ownerId','==',actor.uid))}));
    },
    async dndLoad(idToken,battleId){
      return run(idToken,async(tx,actor)=>{
        const s=data(await tx.get(dndSessions.doc(core.dndSessionDocId(actor.uid,String(battleId)))));
        return core.dndLoad({actor,battleId,session:s});
      });
    },
    async dndSaveOverride(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const exists=(await tx.get(monsters.doc(String(input?.monsterId)))).exists;
        core.dndRequireMonster(exists);
        const row=core.dndSaveOverride({actor,...input});
        tx.set(overrides.doc(row.monsterId),row);
        return {monsterId:row.monsterId};
      });
    },
    async dndResetOverride(idToken,monsterId){
      return run(idToken,async(tx,actor)=>{
        core.dndResetOverride({actor});
        tx.delete(overrides.doc(String(monsterId)));
        return {monsterId:String(monsterId)};
      });
    },
    async dndOverrides(idToken){
      return run(idToken,async(tx,actor)=>core.dndListOverrides({actor,overrides:await docs(tx,overrides)}));
    },
    async dndSaveCustom(idToken,input){
      return run(idToken,async(tx,actor)=>{
        const row=core.dndSaveCustom({actor,...input});
        const existing=await tx.get(custom);
        const known=existing.docs.some(d=>d.id===row.id);
        if(!known&&existing.size>=200)throw new BattleError('invalid','Catálogo V2 excede 200 criaturas extras.');
        tx.set(custom.doc(row.id),row);
        return {id:row.id};
      });
    },
    async dndDeleteCustom(idToken,id){
      return run(idToken,async(tx,actor)=>{
        core.dndDeleteCustom({actor,id});
        tx.delete(custom.doc(id));
        return {id};
      });
    },
    async dndCustom(idToken){
      return run(idToken,async(tx,actor)=>core.dndListCustom({actor,items:await docs(tx,custom)}));
    },
    async dndCatalog(idToken){
      return run(idToken,async(tx,actor)=>core.dndCatalog({actor,monsters:await docs(tx,monsters)}));
    },
    async dndVerified(idToken){
      return run(idToken,async(tx,actor)=>core.dndVerified({actor,rows:await docs(tx,verified)}));
    },
    async rosterFor(idToken,houseId){
      return run(idToken,async(tx,actor)=>core.rosterFor({actor,houseId,
        rows:await docs(tx,roster.where('houseId','==',String(houseId)))}));
    },
  };
}
