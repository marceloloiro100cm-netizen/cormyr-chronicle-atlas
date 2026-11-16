/**
 * Independent, pure reconstruction of purchases using the current canonical
 * quote/purchase engine, recorded server dice, costs and exact state hashes.
 * Does not touch Firestore; does not certify Auth, IAM or non-purchase events.
 *
 * Legacy events without replayInput cannot be reproduced and fail closed.
 */
import {findItem} from './catalog';
import {purchase} from './engine';
import {previewHouseConstruction} from './firebase-construction-quote';
import {calculateFirebaseHouseEconomy,verifiedEconomicState}
  from './firebase-economic-readonly';
import {constructionStateHash} from './firebase-construction-transaction';
import type {ConstructionPurchaseRequest} from './firebase-construction-transaction';
import type {HouseState} from './types';

const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const KEY=/^[A-Za-z0-9_-]{8,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const object=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const boundedName=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=160&&
  v===v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
export const CONSTRUCTION_ECONOMIC_REPLAY_LIMIT=50;
export type ConstructionEconomicReplayStatus=
  'verified_purchase_replay'|'hash_chain_not_verified'|
  'replay_limit_exceeded'|'source_unusable'|'legacy_inputs_missing'|
  'invalid_replay_inputs'|'request_fingerprint_mismatch'|
  'catalog_version_changed'|'construction_rules_changed'|
  'recorded_cost_mismatch'|'replayed_state_mismatch'|
  'final_state_mismatch';
export type ConstructionEconomicReplayResult={
  status:ConstructionEconomicReplayStatus;
  economicReplayVerified:boolean;
  purchaseEventsReplayed:number;
  readyForCutover:false;readOnly:true;
};
type Doc={id:string;data:()=>unknown};
type Context={
  sourceState:unknown;operationalState:unknown;
  houseId:string;houseName:string;sourceSheetVersion:number;
  ledgerVerified:boolean;
};
const result=(status:ConstructionEconomicReplayStatus,done=0):
ConstructionEconomicReplayResult=>({
  status,economicReplayVerified:status==='verified_purchase_replay',
  purchaseEventsReplayed:done,readyForCutover:false,readOnly:true,
});
const safeReplayInput=(v:unknown):v is {
  name:string;parentId?:string;supportId?:string;replaceId?:string;
  weaponSpecialty?:'fighting'|'marksmanship';
}=>{
  if(!object(v)||!boundedName(v['name'])||
     Object.keys(v).some(k=>![
       'name','parentId','supportId','replaceId','weaponSpecialty',
     ].includes(k))||
     ['parentId','supportId','replaceId'].some(k=>
       v[k]!==undefined&&!id(v[k]))||
     (v['weaponSpecialty']!==undefined&&
      v['weaponSpecialty']!=='fighting'&&
      v['weaponSpecialty']!=='marksmanship'))
    return false;
  return true;
};

/** Only returns bounded summary; never includes raw events, UIDs or hashes. */
export function verifyConstructionEconomicReplay(
  docs:readonly Doc[],context:Context,
):ConstructionEconomicReplayResult{
  if(!context.ledgerVerified)
    return result('hash_chain_not_verified');
  if(docs.length>CONSTRUCTION_ECONOMIC_REPLAY_LIMIT)
    return result('replay_limit_exceeded');
  if(!id(context.houseId)||typeof context.houseName!=='string'||
     context.houseName.length>180||
     !Number.isSafeInteger(context.sourceSheetVersion)||
     context.sourceSheetVersion<0)
    return result('source_unusable');
  if(!object(context.sourceState)||!object(context.operationalState))
    return result('source_unusable');
  let state:HouseState;
  try{
    const initial=verifiedEconomicState(context.sourceState);
    if(!initial||initial.houseId!==context.houseId||initial.phase!=='active')
      return result('source_unusable');
    state=structuredClone(initial);
  }catch{return result('source_unusable');}
  const rows=docs.map(d=>({id:d.id,value:d.data()}))
    .sort((a,b)=>{
      const va=object(a.value)?a.value['version']:0;
      const vb=object(b.value)?b.value['version']:0;
      return Number(va)-Number(vb);
    });
  let index=0;
  for(const {id:eventId,value} of rows){
    if(!object(value))return result('invalid_replay_inputs',index);
    if(value['replayInput']===undefined||
       value['replaySchemaVersion']===undefined)
      return result('legacy_inputs_missing',index);
    if(value['replaySchemaVersion']!==1||
       !safeReplayInput(value['replayInput'])||
       value['houseId']!==context.houseId||
       value['version']!==index+1||
       value['expectedVersion']!==index||
       !id(value['itemId'])||!id(value['domainId'])||
       !id(value['actorUid'])||
       typeof value['requestKey']!=='string'||
       !KEY.test(value['requestKey'])||
       !SHA.test(eventId)||
       !SHA.test(String(value['holdingId']))||
       !SHA.test(String(value['requestFingerprint']))||
       !Array.isArray(value['dice'])||
       value['dice'].length>12||
       !value['dice'].every((n:unknown)=>
         Number.isSafeInteger(n)&&Number(n)>=1&&Number(n)<=100))
      return result('invalid_replay_inputs',index);
    const input=value['replayInput'];
    const req:ConstructionPurchaseRequest={
      requestKey:value['requestKey'],
      houseId:context.houseId,expectedVersion:index,
      itemId:value['itemId'],domainId:value['domainId'],name:input.name,
      ...(input.parentId?{parentId:input.parentId}:{}),
      ...(input.supportId?{supportId:input.supportId}:{}),
      ...(input.replaceId?{replaceId:input.replaceId}:{}),
      ...(input.weaponSpecialty?{weaponSpecialty:input.weaponSpecialty}:{}),
    };
    try{
      if(constructionStateHash({uid:value['actorUid'],...req})!==
         value['requestFingerprint'])
        return result('request_fingerprint_mismatch',index);
      if(constructionStateHash(state)!==value['beforeStateHash'])
        return result('replayed_state_mismatch',index);
      const item=findItem(req.itemId);
      if(!item||item.category==='vassal'||item.pending||
         item.version!==value['catalogVersion'])
        return result('catalog_version_changed',index);
      const preview=previewHouseConstruction(state,{
        houseId:req.houseId,itemId:req.itemId,domainId:req.domainId,
        ...(req.parentId?{parentId:req.parentId}:{}),
        ...(req.supportId?{supportId:req.supportId}:{}),
        ...(req.replaceId?{replaceId:req.replaceId}:{}),
      },context.houseName,context.sourceSheetVersion);
      if(!preview.purchaseEligibleByRules)
        return result('construction_rules_changed',index);
      if(constructionStateHash(preview.costs)!==
         constructionStateHash(value['costs']))
        return result('recorded_cost_mismatch',index);
      const next=purchase(state,item,{
        id:value['holdingId'] as string,
        domainId:req.domainId,name:req.name,
        dice:value['dice'] as number[],
        ...(req.parentId?{parentId:req.parentId}:{}),
        ...(req.supportId?{supportId:req.supportId}:{}),
        ...(req.replaceId?{replaceId:req.replaceId}:{}),
        ...(req.weaponSpecialty?{weaponSpecialty:req.weaponSpecialty}:{}),
      });
      const candidate=JSON.parse(JSON.stringify(next)) as unknown;
      if(!object(candidate)||
         !verifiedEconomicState(candidate)||
         !calculateFirebaseHouseEconomy(candidate)||
         constructionStateHash(candidate)!==value['afterStateHash'])
        return result('replayed_state_mismatch',index);
      state=candidate as HouseState;
    }catch{return result('construction_rules_changed',index);}
    index++;
  }
  try{
    if(constructionStateHash(state)!==
       constructionStateHash(context.operationalState))
      return result('final_state_mismatch',index);
  }catch{return result('final_state_mismatch',index);}
  return result('verified_purchase_replay',index);
}
