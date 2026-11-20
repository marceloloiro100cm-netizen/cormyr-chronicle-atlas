/** Projeção autorizada das ações operacionais de espionagem, sem tocar nos imports. */
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const valid=x=>typeof x==='string'&&x.length>0&&x.length<=160&&!/[\/\u0000-\u001f\u007f]/.test(x);
const deny=(code='spy_overlay_invalid')=>{throw Error(code);};
export const SPY_OVERLAY_COLLECTIONS={
 spyAgents:{type:'agent',limit:500},spyUpgrades:{type:'upgrade',limit:1000},
 spyHistories:{type:'history',limit:2000},spyRemovals:{type:'removal',limit:500},
 spyOperations:{type:'operation',limit:1000},spyTimelines:{type:'timeline',limit:1000},
 spyEvents:{type:'event',limit:2000},spyDecisions:{type:'decision',limit:1000},
 spyDossiers:{type:'dossier',limit:500},spyFindings:{type:'finding',limit:3000},
 spyAwards:{type:'award',limit:1000},spyIntelEvents:{type:'intel-event',limit:3000},
 spyAdminAudits:{type:'admin-audit',limit:1000},
};
export async function readSpyOverlay(db,snapshotId){
 if(!/^[a-f0-9]{64}$/.test(snapshotId))deny();
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const live=await root.get(),meta=live.data();
 if(!live.exists||meta?.status!=='active'||meta?.private!==true||
    meta?.sourceSnapshotId!==snapshotId||meta?.sourceSnapshotReconciled!==true||
    meta?.applicationEnabled!==true||meta?.spyReadApproved!==true)
   deny('spy_overlay_not_approved');
 const out={};
 for(const [coll,config] of Object.entries(SPY_OVERLAY_COLLECTIONS)){
  const limit=config.limit;
  const snap=await root.collection(coll).limit(limit+1).get();
  if(!Array.isArray(snap.docs)||snap.docs.length>limit)deny();
  out[coll]=snap.docs.map(doc=>{
   const r=doc.data();
   if(!r||r.sourceSnapshotId!==snapshotId||!r.payload||
      typeof r.payload!=='object'||!valid(r.key)||doc.id!==hash(config.type+':'+r.key))
     deny();
   return r.payload;
  });
 }
 return out;
}
export function projectSpyOverlay(source,overlay){
 if(!source||!overlay)deny();
 const assets=new Map((source.assets||[]).map(a=>[a.id,a]));
 const upgrades=new Map((source.upgrades||[]).map(u=>[u.agentId+':'+u.upgradeCode,u]));
 const history=new Map((source.history||[]).map(h=>[h.id,h]));
 const removals=new Map((source.removals||[]).map(r=>[r.agentId,r]));
 if([...assets.keys()].some(x=>!valid(x)))deny();
 for(const a of overlay.spyAgents||[]){
  if(!valid(a.id)||!valid(a.ownerHouseId)||!Number.isSafeInteger(a.version)||
     a.version<1||typeof a.codename!=='string'||!a.codename.trim())deny();
  const old=assets.get(a.id);
  if(old&&(old.ownerHouseId!==a.ownerHouseId||a.version<=old.version))deny('spy_overlay_conflict');
  assets.set(a.id,a);
 }
 for(const u of overlay.spyUpgrades||[]){
  const key=u.agentId+':'+u.upgradeCode;
  if(!valid(u.agentId)||!assets.has(u.agentId)||!valid(u.ownerHouseId)||
     assets.get(u.agentId).ownerHouseId!==u.ownerHouseId||
     upgrades.has(key)||u.costWealth!==1)deny();
  upgrades.set(key,u);
 }
 for(const h of overlay.spyHistories||[]){
  if(!valid(h.id)||!valid(h.agentId)||!assets.has(h.agentId)||
     assets.get(h.agentId).ownerHouseId!==h.ownerHouseId||history.has(h.id))deny();
  history.set(h.id,h);
 }
 for(const r of overlay.spyRemovals||[]){
  if(!valid(r.agentId)||!assets.has(r.agentId)||
     assets.get(r.agentId).ownerHouseId!==r.ownerHouseId||
     removals.has(r.agentId))deny();
  removals.set(r.agentId,r);
 }
 const used=new Set();
 for(const a of assets.values())if(a.portraitId&&a.status!=='retired'){
  if(used.has(a.portraitId))deny('spy_portrait_duplicate');
  used.add(a.portraitId);
 }
 // Missões e inteligência não substituem a origem. Somente documentos
 // operacionais, com dono e identidade estáveis, prevalecem sobre a leitura.
 const merge=(key,entries,identity,owner,validate)=>{
  const result=new Map((source[key]||[]).map(x=>[identity(x),x]));
  if(result.size!==(source[key]||[]).length)deny('spy_archive_duplicate');
  for(const item of entries||[]){
   const id=identity(item),old=result.get(id);
   if(!valid(id)||!validate(item,old,result))deny('spy_overlay_invalid_'+key);
   if(old&&owner&&owner(old)!==owner(item))deny('spy_overlay_ownership_conflict');
   result.set(id,item);
  }
  return [...result.values()];
 };
 const ops=merge('operations',overlay.spyOperations,x=>x.id,x=>x.ownerHouseId,
  (x,old)=>valid(x.ownerHouseId)&&assets.has(x.assetId)&&
    assets.get(x.assetId).ownerHouseId===x.ownerHouseId&&valid(x.targetId)&&
    Number.isSafeInteger(x.version)&&x.version>0&&
    (!old||x.version>old.version)&&
    (old===undefined||old.assetId===x.assetId&&old.targetId===x.targetId));
 const opIndex=new Map(ops.map(o=>[o.id,o]));
 const timelines=merge('timeline',overlay.spyTimelines,x=>x.operationId,x=>x.ownerHouseId,
  (x,old)=>opIndex.has(x.operationId)&&opIndex.get(x.operationId).ownerHouseId===x.ownerHouseId&&
    opIndex.get(x.operationId).assetId===x.agentId&&
    (!old||old.agentId===x.agentId&&old.destinationRegion===x.destinationRegion));
 const events=merge('events',overlay.spyEvents,x=>x.requestKey,null,
  x=>valid(x.id)&&valid(x.requestKey)&&
   (x.operationId==null||opIndex.has(x.operationId)));
 const decisions=merge('decisions',overlay.spyDecisions,x=>x.id,null,
  (x,old)=>valid(x.id)&&opIndex.has(x.operationId)&&!old);
 const dossiers=merge('dossiers',overlay.spyDossiers,x=>x.id,x=>x.ownerHouseId,
  (x,old)=>valid(x.id)&&valid(x.ownerHouseId)&&valid(x.targetHouseId)&&
   x.ownerHouseId!==x.targetHouseId&&(!old||old.targetHouseId===x.targetHouseId));
 const dossierIndex=new Map(dossiers.map(x=>[x.id,x]));
 const pairIds=new Set(dossiers.map(x=>x.ownerHouseId+':'+x.targetHouseId));
 if(pairIds.size!==dossiers.length)deny('spy_dossier_pair_duplicate');
 const findings=merge('findings',overlay.spyFindings,x=>x.id,null,
  (x,old)=>valid(x.id)&&dossierIndex.has(x.dossierId)&&
   (!old||old.dossierId===x.dossierId&&old.objective===x.objective&&
    old.subjectKey===x.subjectKey));
 const awards=merge('awards',overlay.spyAwards,x=>x.operationId,null,
  x=>opIndex.has(x.operationId)&&dossierIndex.has(x.dossierId));
 const intelEvents=merge('intelEvents',overlay.spyIntelEvents,x=>x.id,null,
  (x,old)=>valid(x.id)&&dossierIndex.has(x.dossierId)&&
    opIndex.has(x.operationId)&&!old);
 const adminAudit=merge('adminAudit',overlay.spyAdminAudits,x=>x.id,null,
  (x,old)=>valid(x.id)&&!old);
 return {...source,assets:[...assets.values()],upgrades:[...upgrades.values()],
  history:[...history.values()],removals:[...removals.values()],
  operations:ops,timeline:timelines,events,decisions,dossiers,findings,
  awards,intelEvents,adminAudit};
}
