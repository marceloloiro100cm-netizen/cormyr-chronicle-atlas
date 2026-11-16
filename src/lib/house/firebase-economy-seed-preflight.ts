/**
 * Pure preflight for an operator-reviewed Firebase House economy seed.
 * NEVER writes or approves anything. Draft remains deliberately ineligible
 * for the purchase/read gates, even when data and hashes match.
 *
 * The caller must independently verify the immutable migration stage and
 * check existing target-doc presence transactionally before provisioning.
 * Do not serialize the private draft to an authenticated browser.
 */
import {createHash} from 'node:crypto';
import {constructionStateHash} from './firebase-construction-transaction';
import {calculateFirebaseHouseEconomy} from './firebase-economic-readonly';
import {RESOURCE_KEYS,type HouseState,type Resources} from './types';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const object=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
const version=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&
  value>=0&&value<=2147483646;
export const MAX_SEED_DRAFT_BYTES=700_000;
export type HouseEconomySeedPreflightStatus=
  'invalid_input'|'existing_document_requires_review'|
  'source_unusable'|'calendar_mismatch'|'state_exceeds_firestore_budget'|
  'ready_for_operator_review';
export type HouseEconomySeedDraft={
  houseId:string;status:'pending';private:true;
  sourceSnapshotId:string;sourceReconciled:false;seedVerified:false;
  sourceSheetVersion:number;sourceStateHash:string;
  stateHash:string;version:0;state:HouseState;
};
export type HouseEconomySeedPreflight={
  status:HouseEconomySeedPreflightStatus;
  // The draft is for an operator-controlled backend only. Not an API payload.
  draft:HouseEconomySeedDraft|null;
  targetPath:string|null;
  preview:{
    sourceSheetVersion:number;
    holdings:number;projects:number;available:Resources;
  }|null;
  writesPerformed:false;automaticallyApproved:false;
  readyForCutover:false;
};
type Input={
  snapshotId:unknown;houseId:unknown;sourceSheetVersion:unknown;
  calendarMonth:unknown;sourceState:unknown;
  existingDocumentPresent:unknown;
};
const blocked=(status:HouseEconomySeedPreflightStatus):
HouseEconomySeedPreflight=>({
  status,draft:null,targetPath:null,preview:null,
  writesPerformed:false,automaticallyApproved:false,
  readyForCutover:false,
});
export function prepareHouseEconomySeedDraft(input:Input):
HouseEconomySeedPreflight{
  if(!object(input)||typeof input.snapshotId!=='string'||
     !SHA.test(input.snapshotId)||
     typeof input.houseId!=='string'||!ID.test(input.houseId)||
     !version(input.sourceSheetVersion)||
     !version(input.calendarMonth)||input.calendarMonth===0||
     typeof input.existingDocumentPresent!=='boolean')
    return blocked('invalid_input');
  // No overwrites or silent reconciliation, regardless of document validity.
  if(input.existingDocumentPresent)
    return blocked('existing_document_requires_review');
  if(!object(input.sourceState)||input.sourceState['houseId']!==input.houseId||
     input.sourceState['phase']!=='active')
    return blocked('source_unusable');
  if(input.sourceState['month']!==input.calendarMonth)
    return blocked('calendar_mismatch');
  try{
    const snapshot=calculateFirebaseHouseEconomy(input.sourceState);
    if(!snapshot||snapshot.houseId!==input.houseId||
       Object.values(snapshot.balances.available).some(
         n=>!Number.isFinite(n)||n<0))
      return blocked('source_unusable');
    // Firestore documents contain JSON-compatible data. Preserve the source
    // exactly; changing fields during cloning would break the source hash.
    const sourceHash=constructionStateHash(input.sourceState);
    const cloned=JSON.parse(JSON.stringify(input.sourceState)) as HouseState;
    if(constructionStateHash(cloned)!==sourceHash)
      return blocked('source_unusable');
    const draft:HouseEconomySeedDraft={
      houseId:input.houseId,status:'pending',private:true,
      sourceSnapshotId:input.snapshotId,
      sourceReconciled:false,seedVerified:false,
      sourceSheetVersion:input.sourceSheetVersion,
      sourceStateHash:sourceHash,stateHash:sourceHash,
      version:0,state:cloned,
    };
    if(Buffer.byteLength(JSON.stringify(draft),'utf8')>MAX_SEED_DRAFT_BYTES)
      return blocked('state_exceeds_firestore_budget');
    const available={} as Resources;
    for(const k of RESOURCE_KEYS)
      available[k]=snapshot.balances.available[k];
    return {
      status:'ready_for_operator_review',
      draft,
      targetPath:'campaignCloudRuntime/'+input.snapshotId+
        '/houseEconomies/'+digest('house:'+input.houseId),
      preview:{
        sourceSheetVersion:input.sourceSheetVersion,
        holdings:cloned.holdings.length,
        projects:cloned.projects.length,available,
      },
      writesPerformed:false,automaticallyApproved:false,
      readyForCutover:false,
    };
  }catch{return blocked('source_unusable');}
}
