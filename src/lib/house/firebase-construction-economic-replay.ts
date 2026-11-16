/**
 * Private, read-only replay of authenticated House construction events.
 *
 * Replays only fully recorded v1 requests; pre-v1 events lack the name,
 * relationships and specialty required by the canonical purchase engine.
 * Missing metadata => NOT VERIFIED. No reconstruction from final holdings.
 *
 * A successful replay proves that the current installed rule catalog
 * deterministically reproduces this historical sequence. It does NOT
 * prove identities, signed event provenance, IAM or readiness for cutover.
 */
import {findItem} from './catalog';
import {purchase} from './engine';
import {previewHouseConstruction} from './firebase-construction-quote';
import {constructionStateHash} from './firebase-construction-transaction';
import {calculateFirebaseHouseEconomy,verifiedEconomicState}
  from './firebase-economic-readonly';
import {
  verifyConstructionLedger,type ConstructionLedgerResult,
} from './firebase-construction-ledger-verification';
import type {ConstructionPurchaseRequest} from './firebase-construction-transaction';

const object=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeId=(value:unknown):value is string=>
  typeof value==='string'&&value.length>0&&value.length<=128&&
  !/[/\u0000-\u001f\u007f]/.test(value);
const key=(value:unknown):value is string=>
  typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const version=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&
  value>=0&&value<=2147483646;
const optionalId=(v:unknown)=>v===undefined||safeId(v);
const optionalSpec=(v:unknown)=>v===undefined||
  v==='fighting'||v==='marksmanship';

function validReplayInput(value:unknown):value is ConstructionPurchaseRequest{
  if(!object(value)||Object.keys(value).some(k=>![
    'requestKey','houseId','expectedVersion','itemId','domainId',
    'name','parentId','supportId','replaceId','weaponSpecialty',
  ].includes(k)))return false;
  return key(value['requestKey'])&&safeId(value['houseId'])&&
    version(value['expectedVersion'])&&safeId(value['itemId'])&&
    safeId(value['domainId'])&&
    typeof value['name']==='string'&&value['name'].length>0&&
    value['name'].length<=160&&value['name'].trim()===value['name']&&
    !/[\u0000-\u001f\u007f]/.test(value['name'])&&
    optionalId(value['parentId'])&&optionalId(value['supportId'])&&
    optionalId(value['replaceId'])&&optionalSpec(value['weaponSpecialty']);
}
export type EconomicReplayStatus=
  'verified'|'hash_chain_unverified'|'source_invalid'|
  'missing_replay_metadata'|'event_payload_invalid'|
  'request_fingerprint_mismatch'|'catalog_version_changed'|
  'quote_mismatch'|'purchase_rejected'|'replay_state_mismatch'|
  'final_state_mismatch';
export type EconomicReplayResult={
  status:EconomicReplayStatus;
  economicReplayVerified:boolean;
  eventsTotal:number;replayedEvents:number;
  readyForCutover:false;readOnly:true;
};
export type ReplayEvent={id:string;data:()=>unknown};
export type ReplayContext={
  houseId:string;snapshotId:string;houseName:string;
  sourceSheetVersion:number;operationalVersion:number;
  sourceState:unknown;operationalState:unknown;
  lastConstructionEventId:unknown;
};
const report=(status:EconomicReplayStatus,total:number,replayed:number):
  EconomicReplayResult=>({
    status,economicReplayVerified:status==='verified',
    eventsTotal:total,replayedEvents:replayed,
    readyForCutover:false,readOnly:true,
  });

/** Existing hash-chain report must be independently verified before replay. */
export function replayConstructionEconomy(
  events:readonly ReplayEvent[],context:ReplayContext,
  chain?:ConstructionLedgerResult,
):EconomicReplayResult{
  const total=events.length;
  const initial=object(context.sourceState)
    ?verifiedEconomicState(context.sourceState):null;
  const final=object(context.operationalState)
    ?verifiedEconomicState(context.operationalState):null;
  if(!initial||!final||initial.houseId!==context.houseId||
     final.houseId!==context.houseId||initial.phase!=='active'||
     final.phase!=='active')
    return report('source_invalid',total,0);

  let sourceHash:string,currentHash:string;
  try{
    sourceHash=constructionStateHash(initial);
    currentHash=constructionStateHash(final);
  }catch{return report('source_invalid',total,0);}
  const checked=verifyConstructionLedger(events,{
    houseId:context.houseId,snapshotId:context.snapshotId,
    sourceSheetVersion:context.sourceSheetVersion,
    sourceHash,currentHash,
    operationalVersion:context.operationalVersion,
    lastConstructionEventId:context.lastConstructionEventId,
  });
  // Explicitly do not trust a caller-provided "success" report if underlying
  // events changed between calls. Both are read in one Firestore transaction.
  if(!checked.verifiedHashChain||(
    chain!==undefined&&(!chain.verifiedHashChain||
      chain.status!=='verified_hash_chain')))
    return report('hash_chain_unverified',total,0);
  if(total===0)return report('verified',0,0);

  let state=structuredClone(initial);
  let count=0;
  const sorted=[...events].sort((a,b)=>{
    const av=a.data(),bv=b.data();
    return Number(object(av)?av['version']:NaN)-
      Number(object(bv)?bv['version']:NaN);
  });
  for(const event of sorted){
    const audit=event.data();
    if(!object(audit))return report('event_payload_invalid',total,count);
    const raw=audit['purchaseInput'];
    if(raw===undefined||audit['replaySchemaVersion']===undefined||
       audit['catalogRuleVersion']===undefined)
      return report('missing_replay_metadata',total,count);
    if(audit['replaySchemaVersion']!==1||!validReplayInput(raw)||
       raw.requestKey!==audit['requestKey']||
       raw.houseId!==context.houseId||
       raw.itemId!==audit['itemId']||
       raw.domainId!==audit['domainId']||
       raw.expectedVersion!==audit['expectedVersion']||
       audit['holdingId']!==undefined&&
       (typeof audit['holdingId']!=='string'||audit['holdingId'].length!==64))
      return report('event_payload_invalid',total,count);
    const finger=constructionStateHash({uid:audit['actorUid'],...raw});
    if(finger!==audit['requestFingerprint'])
      return report('request_fingerprint_mismatch',total,count);
    const item=findItem(raw.itemId);
    if(!item||item.pending||item.category==='vassal'||
       item.version!==audit['catalogRuleVersion'])
      return report('catalog_version_changed',total,count);
    const choice={
      houseId:raw.houseId,itemId:raw.itemId,domainId:raw.domainId,
      ...(raw.parentId?{parentId:raw.parentId}:{}),
      ...(raw.supportId?{supportId:raw.supportId}:{}),
      ...(raw.replaceId?{replaceId:raw.replaceId}:{}),
    };
    try{
      const quote=previewHouseConstruction(
        state,choice,context.houseName,context.sourceSheetVersion);
      if(!quote.purchaseEligibleByRules||
         constructionStateHash(quote.costs)!==
           constructionStateHash(audit['costs']))
        return report('quote_mismatch',total,count);
      const expectedDice=item.duration.dice??0;
      const sides=item.duration.sides??6;
      if(!Array.isArray(audit['dice'])||
         audit['dice'].length!==expectedDice||
         audit['dice'].some(v=>!Number.isSafeInteger(v)||v<1||v>sides))
        return report('event_payload_invalid',total,count);
      const purchased=purchase(state,item,{
        id:audit['holdingId'] as string,
        name:raw.name,domainId:raw.domainId,
        dice:audit['dice'] as number[],
        ...(raw.parentId?{parentId:raw.parentId}:{}),
        ...(raw.supportId?{supportId:raw.supportId}:{}),
        ...(raw.replaceId?{replaceId:raw.replaceId}:{}),
        ...(raw.weaponSpecialty?{weaponSpecialty:raw.weaponSpecialty}:{}),
      });
      // Production uses this exact JSON roundtrip before hashing.
      const next=JSON.parse(JSON.stringify(purchased)) as unknown;
      const typed=object(next)?verifiedEconomicState(next):null;
      if(!typed)return report('purchase_rejected',total,count);
      const computed=calculateFirebaseHouseEconomy(next as Record<string,unknown>);
      if(!computed||
         Object.values(computed.balances.available).some(x=>x<0))
        return report('purchase_rejected',total,count);
      const hash=constructionStateHash(next);
      if(hash!==audit['afterStateHash'])
        return report('replay_state_mismatch',total,count);
      state=typed;
      count++;
    }catch{
      return report('purchase_rejected',total,count);
    }
  }
  if(constructionStateHash(state)!==currentHash)
    return report('final_state_mismatch',total,count);
  return report('verified',total,count);
}
