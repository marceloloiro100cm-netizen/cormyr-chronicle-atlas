/** Projeção autorizada das ações operacionais de espionagem, sem tocar nos imports. */
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const valid=x=>typeof x==='string'&&x.length>0&&x.length<=160&&!/[\/\u0000-\u001f\u007f]/.test(x);
const deny=(code='spy_overlay_invalid')=>{throw Error(code);};
const limits={spyAgents:500,spyUpgrades:1000,spyHistories:2000,spyRemovals:500};
const keys={spyAgents:'agent',spyUpgrades:'upgrade',spyHistories:'history',spyRemovals:'removal'};
export async function readSpyOverlay(db,snapshotId){
 if(!/^[a-f0-9]{64}$/.test(snapshotId))deny();
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 const live=await root.get(),meta=live.data();
 if(!live.exists||meta?.status!=='active'||meta?.private!==true||
    meta?.sourceSnapshotId!==snapshotId||meta?.sourceSnapshotReconciled!==true||
    meta?.applicationEnabled!==true||meta?.spyReadApproved!==true)
   deny('spy_overlay_not_approved');
 const out={};
 for(const [coll,limit] of Object.entries(limits)){
  const snap=await root.collection(coll).limit(limit+1).get();
  if(!Array.isArray(snap.docs)||snap.docs.length>limit)deny();
  out[coll]=snap.docs.map(doc=>{
   const r=doc.data();
   if(!r||r.sourceSnapshotId!==snapshotId||!r.payload||
      typeof r.payload!=='object'||!valid(r.key)||doc.id!==hash(keys[coll]+':'+r.key))
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
 return {...source,assets:[...assets.values()],upgrades:[...upgrades.values()],
  history:[...history.values()],removals:[...removals.values()]};
}
