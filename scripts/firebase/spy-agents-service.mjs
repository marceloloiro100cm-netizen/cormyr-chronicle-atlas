/**
 * Transactional spy-agent service. Firestore Emulator ONLY; no public
 * endpoint. Authorization comes from server-side access docs at request time.
 * The Wealth debit/refund shares one transaction with the house sheet and its
 * ledger, exactly like the SQL functions.
 */
import {randomUUID} from 'node:crypto';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT} from './stage-spy-emulator.mjs';
import {ROOT as NOBLE_ROOT,sheetDocId,ledgerDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME_ROOT} from './stage-time-engine-emulator.mjs';
import * as core from './spy-agents-core.mjs';

const {SpyError}=core;
const PROJECT='demo-cormyr-migration';
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN=op=>op.status!=='completed'&&op.status!=='cancelled';

export function createEmulatorSpyAgentsService({db,auth,snapshotId,env=process.env}){
  assertEmulatorOnly(env,PROJECT);
  if(!HASH.test(snapshotId)||typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function')
    throw Error('Invalid isolated spy agents configuration');
  const stage=db.collection(ROOT).doc(snapshotId);
  const C=n=>stage.collection(n);
  const assets=C('assets'),history=C('history'),upgrades=C('upgrades'),removals=C('removals'),portraits=C('portraits'),
    locations=C('locations'),operations=C('operations'),segments=C('segments');
  const access=db.collection('migrationDomainStage').doc(snapshotId).collection('access');
  const noble=db.collection(NOBLE_ROOT).doc(snapshotId);
  const sheets=noble.collection('sheets'),ledger=noble.collection('ledger');
  const calendar=db.collection(TIME_ROOT).doc(snapshotId).collection('calendar').doc('current');
  const uidOf=async token=>{
    try{return (await auth.verifyIdToken(token)).uid;}catch{throw new SpyError('denied','Acesso negado');}
  };
  const run=async(idToken,fn)=>{
    const uid=await uidOf(idToken);
    return db.runTransaction(async tx=>fn(tx,core.spyScope(uid,(await tx.get(access.doc(uid))).data())));
  };
  const data=s=>s.exists?s.data():null;
  const docs=async(tx,q)=>(await tx.get(q)).docs.map(d=>d.data());
  const sheetOf=async(tx,houseId)=>data(await tx.get(sheets.doc(sheetDocId(houseId))));
  const keyOf=k=>typeof k==='string'&&UUID.test(k)?k:null;
  const ledgerTaken=async(tx,houseId,k)=>k?(await tx.get(ledger.doc(ledgerDocId(houseId,k)))).exists:false;
  const byKey=(tx,col,k)=>k?docs(tx,col.where('requestKey','==',k)):Promise.resolve([]);
  const commit=(tx,r,houseId)=>{
    if(r.sheet)tx.set(sheets.doc(sheetDocId(houseId)),r.sheet);
  };

  return {
    async houseManagement(idToken,houseId){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireRead(actor,h);
        const [houseAssets,allAssets,ops,hist,ups,locs,cat,sheet]=await Promise.all([
          docs(tx,assets.where('ownerHouseId','==',h)),docs(tx,assets),docs(tx,operations.where('ownerHouseId','==',h)),
          docs(tx,history.where('ownerHouseId','==',h)),docs(tx,upgrades.where('ownerHouseId','==',h)),docs(tx,locations),
          docs(tx,portraits),sheetOf(tx,h)]);
        const segs=(await Promise.all(ops.map(o=>docs(tx,segments.where('operationId','==',o.id))))).flat();
        return core.houseManagement({actor,houseId:h,assets:houseAssets,allAssets,operations:ops,segments:segs,history:hist,
          upgrades:ups,locations:locs,sheet,catalog:cat});
      });
    },
    async recruitmentOptions(idToken,houseId){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireRead(actor,h);
        const [houseAssets,allAssets,cat,sheet]=await Promise.all([docs(tx,assets.where('ownerHouseId','==',h)),docs(tx,assets),
          docs(tx,portraits),sheetOf(tx,h)]);
        return core.recruitmentOptions({actor,houseId:h,assets:houseAssets,allAssets,sheet,catalog:cat});
      });
    },
    async recruit(idToken,{houseId,sourceHolding,codename,key}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const k=keyOf(key);
        const [sheet,houseAssets,locs,cal,hist]=await Promise.all([sheetOf(tx,h),docs(tx,assets.where('ownerHouseId','==',h)),
          docs(tx,locations),tx.get(calendar),byKey(tx,history,k)]);
        const existingByKey=hist[0]||null;
        const existingAgent=existingByKey?data(await tx.get(assets.doc(existingByKey.agentId))):null;
        const r=core.recruitAgent({actor,houseId:h,sourceHolding,codename,key:k,sheet,assets:houseAssets,existingByKey,
          existingAgent,locations:locs,calendar:data(cal),newId:randomUUID});
        if(r.alreadyApplied)return r.result;
        tx.set(assets.doc(r.agent.id),r.agent);
        tx.set(history.doc(r.history.id),r.history);
        return r.result;
      });
    },
    async createAgent(idToken,{houseId,sourceHolding,codename,portraitId,upgrades:codes,key}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const k=keyOf(key);
        const list=Array.isArray(codes)?codes.filter(c=>typeof c==='string'&&c in core.UPGRADES):[];
        const derived=k?list.map(c=>core.upgradeKeyFor(k,c)):[];
        const pid=typeof portraitId==='string'?portraitId:null;
        const [sheet,houseAssets,locs,cal,hist,portrait,heldBy,anyActive,...rest]=await Promise.all([
          sheetOf(tx,h),docs(tx,assets.where('ownerHouseId','==',h)),docs(tx,locations),tx.get(calendar),byKey(tx,history,k),
          pid?tx.get(portraits.doc(pid)):null,pid?docs(tx,assets.where('portraitId','==',pid)):[],
          tx.get(portraits.where('active','==',true).limit(1)),
          ...derived.map(d=>ledgerTaken(tx,h,d)),...derived.map(d=>byKey(tx,history,d))]);
        const ledgersTaken=new Set(derived.filter((d,i)=>rest[i]));
        const historyTaken=new Set(derived.filter((d,i)=>rest[derived.length+i].length>0));
        const existingByKey=hist[0]||null;
        let existingAgent=null,existingAgentUpgrades=[];
        if(existingByKey){
          existingAgent=data(await tx.get(assets.doc(existingByKey.agentId)));
          existingAgentUpgrades=await docs(tx,upgrades.where('agentId','==',existingByKey.agentId));
        }
        const r=core.createAgent({actor,houseId:h,sourceHolding,codename,portraitId:pid,upgrades:codes,key:k,newId:randomUUID,
          ctx:{existingByKey,existingAgent,existingAgentUpgrades,portrait:portrait&&portrait.exists?portrait.data():null,
            portraitHeldByOther:heldBy.length>0,catalogHasActive:!anyActive.empty,sheet,assets:houseAssets,locations:locs,
            calendar:data(cal),ledgerKeysTaken:ledgersTaken,historyKeysTaken:historyTaken}});
        if(r.alreadyApplied)return r.result;
        tx.set(assets.doc(r.agent.id),r.agent);
        r.histories.forEach(x=>tx.set(history.doc(x.id),x));
        r.ledgers.forEach(l=>tx.set(ledger.doc(ledgerDocId(h,l.operationKey)),l));
        r.upgrades.forEach(u=>tx.set(upgrades.doc(u.agentId+':'+u.upgradeCode),u));
        if(r.upgrades.length)commit(tx,r,h);
        return r.result;
      });
    },
    async buyUpgrade(idToken,{houseId,agentId,code,expectedAgentVersion,expectedHouseVersion,key}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const k=keyOf(key),a=String(agentId);
        const [agent,sheet,keyUps,agentUps,taken,histKey,ops,cal]=await Promise.all([tx.get(assets.doc(a)),sheetOf(tx,h),
          byKey(tx,upgrades,k),docs(tx,upgrades.where('agentId','==',a)),ledgerTaken(tx,h,k),byKey(tx,history,k),
          docs(tx,operations.where('assetId','==',a)),tx.get(calendar)]);
        const r=core.buyUpgrade({actor,houseId:h,agent:data(agent),code,expectedAgentVersion,expectedHouseVersion,key:k,sheet,
          keyUpgrade:keyUps[0]||null,agentUpgrades:agentUps,ledgerKeyTaken:taken,historyKeyTaken:histKey.length>0,
          hasActiveOperation:ops.some(OPEN),calendar:data(cal),newId:randomUUID});
        if(r.alreadyApplied)return r.result;
        tx.set(assets.doc(a),r.agent);commit(tx,r,h);
        tx.set(ledger.doc(ledgerDocId(h,k)),r.ledger);
        tx.set(upgrades.doc(a+':'+code),r.upgrade);
        tx.set(history.doc(r.history.id),r.history);
        return r.result;
      });
    },
    async assignPortrait(idToken,{houseId,agentId,portraitId,expectedVersion}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const a=String(agentId),pid=typeof portraitId==='string'?portraitId:'';
        const [agent,item,held]=await Promise.all([tx.get(assets.doc(a)),pid?tx.get(portraits.doc(pid)):null,
          pid?docs(tx,assets.where('portraitId','==',pid)):[]]);
        const r=core.assignPortrait({actor,houseId:h,agent:data(agent),portraitId:portraitId??null,expectedVersion,
          catalogItem:item&&item.exists?item.data():null,heldByOther:held.some(x=>x.id!==a)});
        if(r.changed)tx.set(assets.doc(a),r.agent);
        return r.result;
      });
    },
    async removeAgent(idToken,{houseId,agentId,expectedAgentVersion,expectedHouseVersion,key}){
      return run(idToken,async(tx,actor)=>{
        const h=String(houseId);core.requireWrite(actor,h);
        const k=keyOf(key),a=String(agentId);
        const [agent,sheet,prev,keyRem,taken,ups,ops,cal]=await Promise.all([tx.get(assets.doc(a)),sheetOf(tx,h),
          tx.get(removals.doc(a)),byKey(tx,removals,k),ledgerTaken(tx,h,k),docs(tx,upgrades.where('agentId','==',a)),
          docs(tx,operations.where('assetId','==',a)),tx.get(calendar)]);
        const r=core.removeAgent({actor,houseId:h,agent:data(agent),expectedAgentVersion,expectedHouseVersion,key:k,sheet,
          previousRemoval:data(prev),keyRemoval:keyRem[0]||null,ledgerKeyTaken:taken,agentUpgrades:ups,
          hasActiveOperation:ops.some(OPEN),calendar:data(cal),newId:randomUUID});
        if(r.alreadyApplied)return r.result;
        tx.set(assets.doc(a),r.agent);commit(tx,r,h);
        tx.set(removals.doc(a),r.removal);
        tx.set(ledger.doc(ledgerDocId(h,k)),r.ledger);
        tx.set(history.doc(r.history.id),r.history);
        return r.result;
      });
    },
  };
}
