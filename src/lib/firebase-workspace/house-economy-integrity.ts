/**
 * Item 4c: fail-closed projection of the original House sheet.
 * Missing operational economy means "imported/read-only". An existing
 * operational economy must match its immutable source; never silently
 * substitute the archive when a live document is inconsistent.
 */
import {createHash} from 'node:crypto';
import {constructionStateHash} from '@/lib/house/firebase-construction-transaction';

type Sheet=Record<string,unknown>;
type Document={id:string;data:()=>Record<string,unknown>|undefined};
const SHA=/^[a-f0-9]{64}$/;
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const object=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const version=(v:unknown):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2147483646;

export class HouseEconomyReadError extends Error{
 readonly code='house_economy_unreconciled';
 constructor(){super('house_economy_unreconciled');this.name='HouseEconomyReadError';}
}

/** This function never modifies imported data or Firestore documents. */
export function projectVerifiedHouseSheets(
 imported:Sheet[],liveDocs:Document[],snapshotId:string,
):Sheet[]{
 if(!SHA.test(snapshotId)||liveDocs.length>50)
  throw new HouseEconomyReadError();
 const byId=new Map<string,Record<string,unknown>|undefined>();
 for(const doc of liveDocs){
  if(typeof doc.id!=='string'||!SHA.test(doc.id)||byId.has(doc.id))
   throw new HouseEconomyReadError();
  byId.set(doc.id,doc.data());
 }
 return imported.map(row=>{
  const houseId=row['house_id'];
  if(typeof houseId!=='string'||!houseId||houseId.includes('/'))
   throw new HouseEconomyReadError();
  const economyId=digest('house:'+houseId);
  if(!byId.has(economyId))return {...row};
  const v=byId.get(economyId);
  const archived=row['state'];
  if(!object(v)||!object(archived)||!version(row['version'])||
     archived['houseId']!==houseId||
     v['houseId']!==houseId||
     v['status']!=='active'||v['private']!==true||
     v['sourceSnapshotId']!==snapshotId||
     v['sourceReconciled']!==true||v['seedVerified']!==true||
     !version(v['version'])||
     v['sourceSheetVersion']!==row['version']||
     !object(v['state'])||v['state']['houseId']!==houseId||
     v['state']['phase']!=='active')
   throw new HouseEconomyReadError();
  let sourceHash:string,stateHash:string;
  try{
   sourceHash=constructionStateHash(archived);
   stateHash=constructionStateHash(v['state']);
  }catch{throw new HouseEconomyReadError();}
  if(v['sourceStateHash']!==sourceHash||
     v['stateHash']!==stateHash||
     (v['version']===0&&stateHash!==sourceHash))
   throw new HouseEconomyReadError();
  return {...row,state:v['state'],version:v['version'],operational:true};
 });
}
