/**
 * Pure, bounded validation for construction audit event hashes and versions.
 * Does NOT re-execute purchase/quote or certify economic side effects,
 * Firestore IAM, user authorization, or production cutover.
 */
import {createHash} from 'node:crypto';
import {RESOURCE_KEYS} from './types';

const SHA=/^[a-f0-9]{64}$/;
const SAFE=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const KEY=/^[A-Za-z0-9_-]{8,128}$/;
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export const CONSTRUCTION_LEDGER_LIMIT=500;
export type ConstructionLedgerStatus=
  'verified_hash_chain'|'missing_or_extra_events'|'invalid_event'|
  'broken_version_chain'|'broken_hash_chain'|'end_state_mismatch'|
  'ledger_too_large';
export type ConstructionLedgerResult={
  status:ConstructionLedgerStatus;
  verifiedHashChain:boolean;
  economicReplayVerified:false;
  auditHistoryVerified:boolean;
  readyForCutover:false;readOnly:true;
  eventsTotal:number;lastVersion:number;
  entries:{version:number;itemId:string;campaignDate:string}[];
  truncated:boolean;
};
type AuditDoc={id:string;data:()=>unknown};
type Context={
  houseId:string;snapshotId:string;sourceSheetVersion:number;
  sourceHash:string;currentHash:string;operationalVersion:number;
  lastConstructionEventId:unknown;
};
const summary=(status:ConstructionLedgerStatus,
  ctx:Context,count:number,entries:ConstructionLedgerResult['entries']=[],
):ConstructionLedgerResult=>({
  status,verifiedHashChain:status==='verified_hash_chain',
  auditHistoryVerified:status==='verified_hash_chain',
  economicReplayVerified:false,readyForCutover:false,readOnly:true,
  eventsTotal:count,lastVersion:ctx.operationalVersion,
  entries:status==='verified_hash_chain'?entries.slice(-25).reverse():[],
  truncated:entries.length>25,
});
const validCosts=(v:unknown):boolean=>
  Array.isArray(v)&&v.length<=48&&v.every(c=>
    obj(c)&&RESOURCE_KEYS.includes(c['resource'] as typeof RESOURCE_KEYS[number])&&
    int(c['amount'],0,100000)&&
    (c['mode']==='allocation'||c['mode']==='permanent'));
const date=(v:unknown)=>
  typeof v==='string'&&v.length<=80&&
  /^\d{4}-(?:\d{2}-\d{2}|F-[A-Za-z0-9_-]{1,48})$/.test(v);

export function verifyConstructionLedger(
  docs:readonly AuditDoc[],ctx:Context,
):ConstructionLedgerResult{
  const total=docs.length;
  if(total>CONSTRUCTION_LEDGER_LIMIT||ctx.operationalVersion>CONSTRUCTION_LEDGER_LIMIT)
    return summary('ledger_too_large',ctx,total);
  if(total!==ctx.operationalVersion)
    return summary('missing_or_extra_events',ctx,total);
  if(!SHA.test(ctx.sourceHash)||!SHA.test(ctx.currentHash))
    return summary('end_state_mismatch',ctx,total);
  const rows:Record<string,unknown>[]=[];
  const ids=new Set<string>();
  for(const d of docs){
    const v=d.data();
    if(!obj(v)||!SHA.test(d.id)||ids.has(d.id)||
       v['id']!==d.id||v['action']!=='purchase'||
       v['houseId']!==ctx.houseId||
       v['sourceSnapshotId']!==ctx.snapshotId||
       v['sourceSheetVersion']!==ctx.sourceSheetVersion||
       v['sourceStateHash']!==ctx.sourceHash||
       typeof v['actorUid']!=='string'||!SAFE.test(v['actorUid'])||
       typeof v['requestKey']!=='string'||!KEY.test(v['requestKey'])||
       hash('construction-purchase:'+v['actorUid']+':'+v['requestKey'])!==d.id||
       v['holdingId']!==hash('construction-holding:'+d.id)||
       typeof v['itemId']!=='string'||!SAFE.test(v['itemId'])||
       typeof v['domainId']!=='string'||!SAFE.test(v['domainId'])||
       !SHA.test(String(v['requestFingerprint']))||
       !SHA.test(String(v['beforeStateHash']))||
       !SHA.test(String(v['afterStateHash']))||
       !int(v['version'],1,CONSTRUCTION_LEDGER_LIMIT)||
       !int(v['expectedVersion'],0,CONSTRUCTION_LEDGER_LIMIT-1)||
       v['expectedVersion']!==v['version']-1||
       !validCosts(v['costs'])||
       !Array.isArray(v['dice'])||v['dice'].length>12||
       !v['dice'].every((n:unknown)=>int(n,1,100))||
       !date(v['campaignDate'])||
       typeof v['createdAt']!=='string'||
       !Number.isFinite(Date.parse(v['createdAt'])))
      return summary('invalid_event',ctx,total);
    ids.add(d.id);
    rows.push(v);
  }
  rows.sort((a,b)=>(a['version'] as number)-(b['version'] as number));
  let previous=ctx.sourceHash;
  const entries:ConstructionLedgerResult['entries']=[];
  for(let i=0;i<rows.length;i++){
    const v=rows[i]!;
    if(v['version']!==i+1)
      return summary('broken_version_chain',ctx,total);
    if(v['beforeStateHash']!==previous)
      return summary('broken_hash_chain',ctx,total);
    previous=v['afterStateHash'] as string;
    entries.push({
      version:v['version'] as number,
      itemId:v['itemId'] as string,
      campaignDate:v['campaignDate'] as string,
    });
  }
  if(previous!==ctx.currentHash||
     (rows.length>0&&ctx.lastConstructionEventId!==
       hash('construction-purchase:'+
         rows[rows.length-1]!['actorUid']+':'+rows[rows.length-1]!['requestKey']))||
     (rows.length===0&&ctx.lastConstructionEventId!==undefined&&
       ctx.lastConstructionEventId!==null))
    return summary('end_state_mismatch',ctx,total);
  return summary('verified_hash_chain',ctx,total,entries);
}
