import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCurrentSpyRelease,evaluateSpyReleaseGate} from './espionage-release-gate.mjs';

test('Marco C permanece NO_GO sem backup, reconciliação e aval do Narrador',()=>{
 const result=evaluateCurrentSpyRelease();
 assert.equal(result.status,'NO_GO');
 assert.ok(result.missing.some(m=>m.includes('successfulRestoreDrillId')));
 assert.ok(result.missing.some(m=>m.includes('Narrador')));
 assert.ok(result.missing.some(m=>m.includes('temporalHubGoDecisionUrl')));
 assert.ok(result.missing.some(m=>m.includes('safeToPublish')));
});
test('não autoriza deploy se falta qualquer evidência ou versão exata',()=>{
 const root={
  schemaVersion:1,module:'CCA-ESP-MVP-001',state:'GO',
  reviewedCommit:'a'.repeat(40),
  narratorApproval:{approved:true,reviewerId:'gm',approvalRecordedAt:'2026-11-02T23:00:00Z',
    approvalDocumentUrl:'https://example.invalid/approved'},
  requiredEvidence:Object.fromEntries([
   'reconciledMigrationJournal','verifiedFullBackupId','successfulRestoreDrillId',
   'stagingDatabaseUrl','stagingRlsCrossHouseReportUrl','stagingFullIntegrationRunUrl',
   'temporalHubGoDecisionUrl','allNarratorScenariosSignedUrl',
   'rollbackVerificationUrl','productionDiffApprovedUrl'
  ].map(key=>[key,'https://example.invalid/evidence/'+key])),
  safeToMigrate:true,safeToMerge:true,safeToPublish:true,
 };
 assert.equal(evaluateSpyReleaseGate(root).status,'GO');
 for(const key of Object.keys(root.requiredEvidence)){
  const invalid=structuredClone(root);
  invalid.requiredEvidence[key]=null;
  assert.equal(evaluateSpyReleaseGate(invalid).status,'NO_GO');
 }
 for(const key of ['safeToMigrate','safeToMerge','safeToPublish']){
  const invalid=structuredClone(root);invalid[key]=false;
  assert.equal(evaluateSpyReleaseGate(invalid).status,'NO_GO');
 }
 const noReviewer=structuredClone(root);noReviewer.narratorApproval.reviewedBy=undefined;noReviewer.narratorApproval.approved=false;
 assert.equal(evaluateSpyReleaseGate(noReviewer).status,'NO_GO');
});
