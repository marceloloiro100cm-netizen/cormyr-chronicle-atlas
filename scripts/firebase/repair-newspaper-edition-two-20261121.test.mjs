import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRepairCandidate,EXPECTED_CAMPAIGN_DATE} from './repair-newspaper-edition-two-20261121.mjs';
const baseline=()=>({
 runtime:{status:'active',private:true,sourceSnapshotReconciled:true,applicationEnabled:true,
  newspaperWriteApproved:true,newspaperSequenceReconciled:true,nextNewspaperEditionNo:5},
 stage:{status:'complete',private:true},
 cloudRows:[{id:'cloud-'+'a'.repeat(64),title:'A Folha Sem Selo',source:'firebase-cloud',
  editionNo:4,state:'published',cancelledAt:null,
  publishedAt:'2026-11-21T20:30:00.000Z',campaignDate:EXPECTED_CAMPAIGN_DATE}],
 stageRows:[{id:'original-one',title:'A Folha Sem Selo',editionNo:1,state:'published',
  publishedAt:'2026-11-10T18:00:00.000Z',cancelledAt:null},
  {id:'original-two-draft',title:'A Folha Sem Selo',editionNo:2,state:'draft',
   publishedAt:null,cancelledAt:null},
  {id:'original-three-draft',title:'A Folha Sem Selo',editionNo:3,state:'draft',
   publishedAt:null,cancelledAt:null}],
});
test('selects only the unique published November 21 cloud issue 4',()=>{
 assert.equal(verifyRepairCandidate(baseline()).editionNo,4);
});
test('preserves historic draft 2 without falsely treating it as published',()=>{
 assert.equal(verifyRepairCandidate(baseline()).campaignDate,EXPECTED_CAMPAIGN_DATE);
});
test('refuses a genuinely published issue 2, including an imported one',()=>{
 const data=baseline();data.stageRows[1].state='published';
 assert.throws(()=>verifyRepairCandidate(data),/published_editions_do_not_match_screenshot/);
});
test('rejects another edition, date or cloud candidate',()=>{
 const data=baseline();data.cloudRows[0].campaignDate='1522-10-21';
 assert.throws(()=>verifyRepairCandidate(data),/target_not_unique_or_date_mismatch/);
 const duplicated=baseline();duplicated.cloudRows.push({...duplicated.cloudRows[0],id:'cloud-'+'b'.repeat(64)});
 assert.throws(()=>verifyRepairCandidate(duplicated));
});
test('rejects unapproved operational roots or incomplete import',()=>{
 const a=baseline();a.runtime.applicationEnabled=false;
 assert.throws(()=>verifyRepairCandidate(a),/newspaper_runtime_not_reconciled/);
 const b=baseline();b.stage.status='pending';
 assert.throws(()=>verifyRepairCandidate(b),/newspaper_runtime_not_reconciled/);
});
