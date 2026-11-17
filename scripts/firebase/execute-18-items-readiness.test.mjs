import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {
 ITEM_IDS,EXECUTION_ITEMS,evaluateExecutionItems,runExecutionReadiness,
} from './execute-18-items-readiness.mjs';

const safe={safeToMergeCode:true,checks:{
 productionFirestoreDenyAll:true,productionStorageDenyAll:true,
 legacyAuthDetached:true,archiveServerFnsBlocked:true,noProductionFirebaseDomainBridge:true,
 noProductionFirebaseDomainPreview:true,cloudCredentialsNotCommitted:true,
}};
const inspector=async()=>safe;

test('exactly the 18 agreed items are covered, without duplicates',()=>{
 assert.deepEqual(ITEM_IDS,[6,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]);
 assert.deepEqual(EXECUTION_ITEMS.map(x=>x.id),ITEM_IDS);
 assert.equal(new Set(EXECUTION_ITEMS.map(x=>x.id)).size,18);
 for(const entry of EXECUTION_ITEMS){
   assert.ok(entry.title);
   assert.ok(['houses','communications','strategy','operations','security'].includes(entry.group));
   assert.ok(entry.files.length>=2);
   assert.equal(entry.requiresCloud,true);
 }
});

test('missing one contract is explicitly reported and can never be counted as ready',async()=>{
 const missing=resolve(process.cwd(),EXECUTION_ITEMS[0].files[0]);
 const results=await evaluateExecutionItems(process.cwd(),async file=>{
   if(file===missing)throw Error('missing fixture');
 });
 const first=results.find(x=>x.id===6);
 assert.equal(first.codeEvidencePresent,false);
 assert.equal(first.sourceContractsFound,1);
 assert.equal(first.status,'MISSING_SOURCE_CONTRACTS');
 assert.equal(first.realCloudE2EVerified,false);
 assert.equal(first.releaseApproved,false);
 const aggregate=await runExecutionReadiness({
   inspectSafety:inspector,
   check:async file=>{if(file===missing)throw Error('missing')},
 });
 assert.equal(aggregate.codeContractsMissing,1);
 assert.equal(aggregate.readyForCutover,false);
 assert.equal(aggregate.decision,'NO_GO');
});

test('even full synthetically successful code coverage cannot approve release',async()=>{
 const report=await runExecutionReadiness({
   inspectSafety:inspector,check:async()=>{},
 });
 assert.equal(report.codeContractsPresent,18);
 assert.equal(report.allSourceContractsPresent,true);
 assert.equal(report.fullyImplementedInCloud,0);
 assert.equal(report.independentExternalEvidenceVerified,false);
 assert.equal(report.readyForPlayersOnFirebaseCloud,false);
 assert.equal(report.readyForCutover,false);
 assert.equal(report.productionWrites,0);
 assert.equal(report.decision,'NO_GO');
 for(const item of report.items){
   assert.equal(item.codeEvidencePresent,true);
   assert.equal(item.emulatorProofInThisReport,false);
   assert.equal(item.realCloudE2EVerified,false);
   assert.equal(item.sourceDataReconciled,false);
   assert.equal(item.releaseApproved,false);
 }
});

test('source contract presence is verified against the real repository',async()=>{
 const results=await evaluateExecutionItems();
 const missing=results.filter(x=>!x.codeEvidencePresent);
 assert.deepEqual(missing.map(x=>x.id),[]);
});

test('production safety regression blocks the report instead of asserting success',async()=>{
 const regression={
   ...safe,checks:{...safe.checks,productionFirestoreDenyAll:false},
 };
 await assert.rejects(runExecutionReadiness({
   inspectSafety:async()=>regression,check:async()=>{},
 }),/safety preflight failed/i);
});

test('no paths can escape repository root or inject arbitrary scripts',async()=>{
 const original=EXECUTION_ITEMS[0].files[0];
 try{
   // The registry is immutable, so the attack must be rejected by JS itself.
   assert.throws(()=>{EXECUTION_ITEMS[0].files[0]='../../private.dump'},TypeError);
   assert.equal(EXECUTION_ITEMS[0].files[0],original);
 }finally{
   assert.equal(EXECUTION_ITEMS[0].files[0],original);
 }
});
