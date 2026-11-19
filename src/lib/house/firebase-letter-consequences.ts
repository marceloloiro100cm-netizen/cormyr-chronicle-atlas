/**
 * Narrator letter consequences in the Firebase runtime (port of
 * 0068_mail_consequences.sql). The event is recorded in the OPERATIONAL
 * House sheet (houseEconomies, seeded from the imported sheet by owner
 * decision) and in an audit, in ONE transaction. Losses are allocations and
 * gains are reversible event points, exactly as the canonical engine reads
 * state.mailConsequences. Imported sheets are never changed.
 *
 * Callers must already have verified the Narrator and the letter.
 */
import {createHash} from 'node:crypto';
import type {Firestore,DocumentSnapshot} from 'firebase-admin/firestore';
import {RESOURCE_KEYS,type HouseState,type Resource} from './types';
import {constructionStateHash} from './firebase-construction-transaction';
import {calculateFirebaseHouseEconomy,verifiedEconomicState} from './firebase-economic-readonly';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const KEY=/^[A-Za-z0-9_-]{8,128}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
export class LetterConsequenceError extends Error{
  constructor(readonly code:string,readonly status=400){super(code);}
}
const fail=(code:string,status=400):never=>{throw new LetterConsequenceError(code,status);};

export function validConsequenceChanges(v:unknown):Partial<Record<Resource,number>>{
  if(!v||typeof v!=='object'||Array.isArray(v))return fail('invalid_consequence');
  const row=v as Record<string,unknown>;
  if(Object.keys(row).some(k=>!(RESOURCE_KEYS as readonly string[]).includes(k)))return fail('invalid_consequence');
  const out:Partial<Record<Resource,number>>={};
  for(const k of RESOURCE_KEYS){
    const n=row[k];
    if(n===undefined)continue;
    if(typeof n!=='number'||!Number.isInteger(n)||Math.abs(n)>100)return fail('invalid_consequence');
    out[k]=n;
  }
  if(!Object.values(out).some(n=>n!==0))return fail('invalid_consequence');
  return out;
}
const sameChanges=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export function createFirebaseLetterConsequences({db,snapshotId,now=()=>new Date().toISOString()}:{
  db:Firestore;snapshotId:string;now?:()=>string;
}){
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  const economyRef=(houseId:string)=>runtime.collection('houseEconomies').doc(hash('house:'+houseId));
  const records=runtime.collection('letterConsequences');
  const activeIndex=(letterId:string,houseId:string)=>runtime.collection('letterConsequenceActive')
    .doc(hash('consequence-active:'+letterId+':'+houseId));
  const audits=runtime.collection('houseConsequenceAudits');
  function operational(doc:DocumentSnapshot,houseId:string){
    const v=doc.data();
    const state=v&&v['status']==='active'&&v['seedVerified']===true&&v['houseId']===houseId&&
      v['sourceSnapshotId']===snapshotId&&v['stateHash']===constructionStateHash(v['state'])
      ?verifiedEconomicState(v['state']):null;
    if(!v||!state||!Number.isSafeInteger(v['version']))
      return fail('house_not_activated',409);
    return {state,version:v['version'] as number};
  }
  function checked(next:HouseState){
    const clean=JSON.parse(JSON.stringify(next)) as HouseState;
    if(!verifiedEconomicState(clean as never)||!calculateFirebaseHouseEconomy(clean as never))
      return fail('consequence_result_invalid',409);
    return clean;
  }
  return {
    async apply(input:{actorUid:string;letterId:string;houseId:string;changes:unknown;
      explanation:unknown;key:unknown;expectedVersion:unknown}){
      const changes=validConsequenceChanges(input.changes);
      const explanation=typeof input.explanation==='string'?input.explanation.trim():'';
      if(explanation.length<10||explanation.length>2000)return fail('invalid_consequence_explanation');
      if(typeof input.key!=='string'||!KEY.test(input.key)||!ID.test(input.letterId)||!ID.test(input.houseId)||
         !Number.isSafeInteger(input.expectedVersion))return fail('invalid_consequence');
      const id=hash('consequence:'+input.key);
      return db.runTransaction(async tx=>{
        const [eco,existing,active]=await Promise.all([tx.get(economyRef(input.houseId)),
          tx.get(records.doc(id)),tx.get(activeIndex(input.letterId,input.houseId))]);
        if(existing.exists){
          const e=existing.data()!;
          if(e['letterId']!==input.letterId||e['houseId']!==input.houseId||!sameChanges(e['changes'],changes))
            return fail('consequence_key_conflict',409);
          return {id,duplicate:true,version:eco.data()?.['version']??null};
        }
        if(active.exists)return fail('consequence_already_active',409);
        const op=operational(eco,input.houseId);
        if(op.version!==input.expectedVersion)return fail('house_version_conflict',409);
        const at=now();
        const next=checked({...op.state,mailConsequences:[...(op.state.mailConsequences??[]),
          {id,letterId:input.letterId,changes,active:true,createdAt:at}]});
        const after=constructionStateHash(next),version=op.version+1;
        tx.update(economyRef(input.houseId),{state:next,stateHash:after,version,updatedAt:at});
        tx.create(records.doc(id),{id,letterId:input.letterId,houseId:input.houseId,changes,explanation,
          operationKey:input.key,createdBy:input.actorUid,createdAt:at,active:true,sourceSnapshotId:snapshotId});
        tx.set(activeIndex(input.letterId,input.houseId),{consequenceId:id});
        tx.create(audits.doc(hash('consequence-apply:'+id)),{action:'mail_consequence',actorUid:input.actorUid,
          houseId:input.houseId,letterId:input.letterId,consequenceId:id,changes,explanation,
          beforeStateHash:eco.data()!['stateHash'],afterStateHash:after,version,at});
        return {id,duplicate:false,version};
      });
    },
    async reverse(input:{actorUid:string;id:unknown;key:unknown;expectedVersion:unknown;reason:unknown}){
      const reason=typeof input.reason==='string'?input.reason.trim():'';
      if(reason.length<10||reason.length>2000)return fail('invalid_consequence_explanation');
      if(typeof input.id!=='string'||!/^[a-f0-9]{64}$/.test(input.id)||typeof input.key!=='string'||
         !KEY.test(input.key)||!Number.isSafeInteger(input.expectedVersion))return fail('invalid_consequence');
      const id=input.id;
      return db.runTransaction(async tx=>{
        const rec=await tx.get(records.doc(id));
        const r=rec.data();
        if(!rec.exists||!r||typeof r['houseId']!=='string'||typeof r['letterId']!=='string')
          return fail('consequence_not_found',404);
        const [eco,active]=await Promise.all([tx.get(economyRef(r['houseId'])),
          tx.get(activeIndex(r['letterId'],r['houseId']))]);
        if(r['active']!==true){
          if(r['reversalKey']===input.key)return {id,duplicate:true,version:eco.data()?.['version']??null};
          return fail('consequence_already_reversed',409);
        }
        const op=operational(eco,r['houseId']);
        if(op.version!==input.expectedVersion)return fail('house_version_conflict',409);
        let found=false;
        const events=(op.state.mailConsequences??[]).map(e=>{
          if(e.id!==id)return e;found=true;return {...e,active:false};
        });
        if(!found)return fail('consequence_missing_in_sheet',409);
        const at=now();
        const next=checked({...op.state,mailConsequences:events});
        const after=constructionStateHash(next),version=op.version+1;
        tx.update(economyRef(r['houseId']),{state:next,stateHash:after,version,updatedAt:at});
        tx.update(records.doc(id),{active:false,reversedBy:input.actorUid,reversedAt:at,
          reversalKey:input.key,reversalReason:reason});
        if(active.exists)tx.delete(activeIndex(r['letterId'],r['houseId']));
        tx.create(audits.doc(hash('consequence-reverse:'+id)),{action:'mail_consequence_reversed',
          actorUid:input.actorUid,houseId:r['houseId'],letterId:r['letterId'],consequenceId:id,reason,
          beforeStateHash:eco.data()!['stateHash'],afterStateHash:after,version,at});
        return {id,duplicate:false,version};
      });
    },
    /** Read model: player-safe columns only (no explanation, actor or reason). */
    async list(){
      const snap=await records.limit(2001).get();
      if(snap.docs.length>2000)return fail('consequences_too_large',503);
      return snap.docs.map(d=>d.data()).filter(v=>typeof v['id']==='string').map(v=>({
        id:v['id'],letter_id:v['letterId'],house_id:v['houseId'],changes:v['changes'],
        active:v['active']===true,created_at:v['createdAt']}));
    },
  };
}
