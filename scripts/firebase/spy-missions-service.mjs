/**
 * Transactional espionage mission service. Firestore Emulator ONLY; no public
 * endpoint. Authorization comes from server-side access docs at request time.
 * Shares the agent/operation/event/history collections of the spy stage.
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT} from './stage-spy-emulator.mjs';
import {ROOT as NOBLE_ROOT,sheetDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME_ROOT} from './stage-time-engine-emulator.mjs';
import * as core from './spy-missions-core.mjs';

const {SpyError}=core;
const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN=op=>op.status!=='completed'&&op.status!=='cancelled';

export function createEmulatorSpyMissionsService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated spy missions configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const C=n=>stage.collection(n);
  const assets=C('assets'),history=C('history'),upgrades=C('upgrades'),locations=C('locations'),operations=C('operations'),
    segments=C('segments'),events=C('events'),catalog=C('catalog'),nobleStats=C('nobleStats'),decisions=C('decisions'),
    timeline=C('timeline');
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  const sheets=db.collection(NOBLE_ROOT).doc(snapshotId).collection('sheets');
  const calendar=db.collection(TIME_ROOT).doc(snapshotId).collection('calendar').doc('current');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new SpyError('denied','Acesso negado');}
  };
  const run=async(idToken,fn)=>{
    const uid=await uidOf(idToken);
    return db.runTransaction(async tx=>fn(tx,core.spyScope(uid,(await tx.get(access.doc(uid))).data())));
  };
  const data=s=>s&&s.exists?s.data():null;
  const docs=async(tx,q)=>(await tx.get(q)).docs.map(d=>d.data());
  const keyOf=k=>typeof k==='string'&&UUID.test(k)?k:null;
  const sheetOf=async(tx,houseId)=>data(await tx.get(sheets.doc(sheetDocId(houseId))));
  const eventByKey=async(tx,k)=>k?data(await tx.get(events.doc(k))):null;
  const putEvent=(tx,e)=>tx.set(events.doc(e.requestKey),e);

  return {
    async startMission(idToken,{houseId,agentId,targetHouseId,destination,expectedAgentVersion,expectedCalendarVersion,key}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const k=keyOf(key),a=String(agentId),t=String(targetHouseId);
        const [agent,locs,cal,target,ops,keyEvent]=await Promise.all([tx.get(assets.doc(a)),docs(tx,locations),tx.get(calendar),
          tx.get(catalog.doc(t)),docs(tx,operations.where('assetId','==',a)),eventByKey(tx,k)]);
        const agentRow=data(agent);
        const existingOp=ops.find(o=>o.ownerHouseId===h&&o.operationKey===k)||null;
        const existingTimeline=existingOp?data(await tx.get(timeline.doc(existingOp.id))):null;
        const r=core.startMission({actor,houseId:h,agent:agentRow,target:data(target),destination,expectedAgentVersion,
          expectedCalendarVersion,key:k,existingOp,existingTimeline,keyEvent,
          agentLocation:agentRow&&agentRow.currentLocationId?locs.find(l=>l.id===agentRow.currentLocationId)||null:null,
          locations:locs,hasOpenOperation:ops.some(o=>o.ownerHouseId===h&&OPEN(o)),calendar:data(cal),newId:randomUUID});
        if(r.alreadyApplied)return r.result;
        tx.set(operations.doc(r.operation.id),r.operation);
        tx.set(timeline.doc(r.operation.id),r.timeline);
        tx.set(assets.doc(a),r.agent);
        putEvent(tx,r.event);
        return r.result;
      });
    },
    async cancelMission(idToken,{houseId,operationId,expectedVersion,key}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const k=keyOf(key);
        const op=data(await tx.get(operations.doc(String(operationId))));
        if(!op||op.ownerHouseId!==h)throw new SpyError('invalid','Missão não pertence à Casa');
        const [agent,cal,previousEvent]=await Promise.all([tx.get(assets.doc(op.assetId)),tx.get(calendar),eventByKey(tx,k)]);
        const r=core.cancelMission({actor,houseId:h,operation:op,agent:data(agent),previousEvent,expectedVersion,key:k,
          calendar:data(cal),newId:randomUUID});
        if(r.alreadyApplied)return r.result;
        tx.set(operations.doc(op.id),r.operation);
        tx.set(assets.doc(op.assetId),r.agent);
        putEvent(tx,r.event);
        return r.result;
      });
    },
    /** Hub clock: narrator-only, idempotent over the current official date. */
    async advanceMissions(idToken){
      return run(idToken,async(tx,actor)=>{
        if(actor.role!=='narrador')throw new SpyError('denied','Acesso negado');
        const [tls,ops,allAssets,cal]=await Promise.all([docs(tx,timeline),docs(tx,operations),docs(tx,assets),tx.get(calendar)]);
        const opBy=new Map(ops.map(o=>[o.id,o])),agBy=new Map(allAssets.map(a=>[a.id,a]));
        const items=tls.filter(t=>opBy.has(t.operationId)).map(t=>({timeline:t,operation:opBy.get(t.operationId),
          agent:agBy.get(t.agentId)||null}));
        const changes=core.advanceMissions({actor,items,calendar:data(cal),newId:randomUUID});
        for(const c of changes){
          tx.set(operations.doc(c.operation.id),c.operation);
          if(c.agent)tx.set(assets.doc(c.agent.id),c.agent);
          putEvent(tx,c.event);
        }
        return {advanced:changes.length};
      });
    },
    async houseTimeline(idToken,houseId){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireRead(actor,h);
        const [tls,ops,cat]=await Promise.all([docs(tx,timeline.where('ownerHouseId','==',h)),
          docs(tx,operations.where('ownerHouseId','==',h)),docs(tx,catalog)]);
        return core.houseTimeline({actor,houseId:h,timelines:tls,operations:ops,catalog:cat});
      });
    },
    async previewMission(idToken,{houseId,agentId,targetHouseId}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId),t=String(targetHouseId);core.requireRead(actor,h);
        const [agent,target,sheet,stats]=await Promise.all([tx.get(assets.doc(String(agentId))),tx.get(catalog.doc(t)),
          sheetOf(tx,t),tx.get(nobleStats.doc(t))]);
        return core.previewMission({actor,houseId:h,agent:data(agent),target:data(target),sheet,stats:data(stats)});
      });
    },
    async resolveMission(idToken,{operationId,roll,modifier,discovered,guardOverride,prisonOverride,expectedVersion,key,reason}){
      return run(idToken,async(tx,actor)=>{
        if(actor.role!=='narrador')throw new SpyError('denied','Somente o Narrador pode resolver missões e mortes');
        const k=keyOf(key);
        const op=data(await tx.get(operations.doc(String(operationId))));
        if(!op)throw new SpyError('invalid','Missão não cadastrada');
        const [agent,prev,segs,ups,target,cal]=await Promise.all([tx.get(assets.doc(op.assetId)),
          k?docs(tx,history.where('requestKey','==',k)):[],docs(tx,segments.where('operationId','==',op.id)),
          docs(tx,upgrades.where('agentId','==',op.assetId)),tx.get(catalog.doc(op.targetId)),tx.get(calendar)]);
        const [sheet,stats]=await Promise.all([sheetOf(tx,op.targetId),tx.get(nobleStats.doc(op.targetId))]);
        const r=core.resolveMission({actor,operation:op,agent:data(agent),previousHistory:prev[0]||null,segments:segs,
          upgrades:ups,target:data(target),sheet,stats:data(stats),roll,modifier,discovered,guardOverride,prisonOverride,
          expectedVersion,key:k,reason,calendar:data(cal),newId:randomUUID});
        if(r.alreadyApplied)return r.result;
        tx.set(assets.doc(op.assetId),r.agent);
        tx.set(operations.doc(op.id),r.operation);
        r.history.forEach(x=>tx.set(history.doc(x.id),x));
        tx.set(decisions.doc(r.decision.id),r.decision);
        putEvent(tx,r.event);
        return r.result;
      });
    },
    async counterintelligence(idToken,houseId){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireRead(actor,h);
        const [ops,hist]=await Promise.all([docs(tx,operations.where('targetId','==',h)),
          docs(tx,history.where('targetHouseId','==',h))]);
        return core.counterintelligence({actor,houseId:h,operations:ops,history:hist});
      });
    },
    async narratorOperations(idToken){
      return run(idToken,async(tx,actor)=>{
        if(actor.role!=='narrador')throw new SpyError('denied','Painel de operações exclusivo do Narrador');
        const [ops,cat,allAssets,tls,decs]=await Promise.all([docs(tx,operations),docs(tx,catalog),docs(tx,assets),
          docs(tx,timeline),docs(tx,decisions)]);
        return core.narratorOperations({actor,operations:ops,catalog:cat,assets:allAssets,timelines:tls,decisions:decs});
      });
    },
    async incidentHistory(idToken){
      return run(idToken,async(tx,actor)=>{
        if(actor.role!=='narrador')throw new SpyError('denied','Incidentes reservados ao Narrador');
        const [ops,hist,cat,allAssets]=await Promise.all([docs(tx,operations),docs(tx,history),docs(tx,catalog),docs(tx,assets)]);
        return core.incidentHistory({actor,operations:ops,history:hist,catalog:cat,assets:allAssets});
      });
    },
  };
}
