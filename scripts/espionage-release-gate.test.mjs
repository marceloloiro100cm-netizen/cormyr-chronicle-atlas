import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCurrentSpyRelease,evaluateSpyHomologation,evaluateSpyReleaseGate} from './espionage-release-gate.mjs';
const commit='a'.repeat(40), reviewerId='gm-acceptance-operator';
const evidence=name=>'https://github.com/example-campaign/homologation/actions/'+name;
const timestamp='2026-11-02T23:00:00Z';
function approvedFixture(){
 const homologation={
  schemaVersion:1,module:'CCA-ESP-MVP-001',environment:'restored-production-staging',
  status:'ACCEPTED',stagingProjectId:'restored-staging-unique',
  reviewedCommit:commit,narratorReviewerId:reviewerId,narratorSignedAt:timestamp,
  backupRestoreEvidenceUrl:evidence('backup-restored'),
  scenarios:Array.from({length:20},(_,i)=>{
   const id='H'+String(i+1).padStart(2,'0');
   return {id,description:'Synthetic TEST fixture only',status:'ACCEPTED',
    evidenceUrl:evidence(id),reviewerId,reviewedCommit:commit,executedAt:timestamp};
  }),
 };
 const keys=[
  'reconciledMigrationJournal','verifiedFullBackupId','successfulRestoreDrillId',
  'stagingDatabaseUrl','stagingRlsCrossHouseReportUrl','stagingFullIntegrationRunUrl',
  'temporalHubGoDecisionUrl','allNarratorScenariosSignedUrl',
  'rollbackVerificationUrl','productionDiffApprovedUrl'
 ];
 const manifest={
  schemaVersion:1,module:'CCA-ESP-MVP-001',state:'GO',environment:'production',
  reviewedCommit:commit,
  narratorApproval:{approved:true,reviewerId,approvalRecordedAt:timestamp,
   approvalDocumentUrl:evidence('narrator-final-consent')},
  requiredEvidence:Object.fromEntries(keys.map(k=>[k,k==='verifiedFullBackupId'||k==='successfulRestoreDrillId'
   ?'backup-opaque-evidence-0001':evidence(k)])),
  safeToMigrate:true,safeToMerge:true,safeToPublish:true,
 };
 return {manifest,homologation};
}
test('Homologação e publicação atuais permanecem NO_GO sem backup ou aceite real',()=>{
 const result=evaluateCurrentSpyRelease();
 assert.equal(result.status,'NO_GO');
 assert.ok(result.missing.some(m=>m.includes('Restauração')||m.includes('restauração')));
 assert.ok(result.missing.some(m=>m.includes('H01')));
 assert.ok(result.missing.some(m=>m.includes('Narrador')));
 assert.ok(result.missing.some(m=>m.includes('temporalHubGoDecisionUrl')));
});
test('20 casos sintéticos aceitos são estruturalmente válidos; não são evidência real',()=>{
 const {manifest,homologation}=approvedFixture();
 assert.equal(evaluateSpyHomologation(homologation,commit).status,'GO');
 assert.equal(evaluateSpyReleaseGate(manifest,homologation).status,'GO');
});
test('Cada cenário requer aceite, evidência distinta, compromisso exato e assinatura',()=>{
 const {homologation}=approvedFixture();
 for(const c of homologation.scenarios){
  for(const field of ['status','evidenceUrl','reviewedCommit','reviewerId','executedAt']){
   const t=structuredClone(homologation);
   t.scenarios.find(x=>x.id===c.id)[field]=null;
   assert.equal(evaluateSpyHomologation(t,commit).status,'NO_GO',c.id+' '+field);
  }
 }
 const dupe=structuredClone(homologation);
 dupe.scenarios[1].id=dupe.scenarios[0].id;
 assert.equal(evaluateSpyHomologation(dupe,commit).status,'NO_GO');
 const reusedEvidence=structuredClone(homologation);
 reusedEvidence.scenarios[1].evidenceUrl=reusedEvidence.scenarios[0].evidenceUrl;
 assert.equal(evaluateSpyHomologation(reusedEvidence,commit).status,'NO_GO');
 const fakeEvidence=structuredClone(homologation);
 fakeEvidence.scenarios[0].evidenceUrl='https://example.invalid/fake/H01';
 assert.equal(evaluateSpyHomologation(fakeEvidence,commit).status,'NO_GO');
});
test('Nenhuma evidência obrigatória ou autorização específica é opcional',()=>{
 const {manifest,homologation}=approvedFixture();
 for(const field of Object.keys(manifest.requiredEvidence)){
  const t=structuredClone(manifest);t.requiredEvidence[field]=null;
  assert.equal(evaluateSpyReleaseGate(t,homologation).status,'NO_GO',field);
 }
 for(const field of ['safeToMigrate','safeToMerge','safeToPublish']){
  const t=structuredClone(manifest);t[field]=false;
  assert.equal(evaluateSpyReleaseGate(t,homologation).status,'NO_GO',field);
 }
 for(const field of ['approved','reviewerId','approvalRecordedAt','approvalDocumentUrl']){
  const t=structuredClone(manifest);t.narratorApproval[field]=null;
  assert.equal(evaluateSpyReleaseGate(t,homologation).status,'NO_GO',field);
 }
 const wrongCommit=structuredClone(manifest);wrongCommit.reviewedCommit='b'.repeat(40);
 assert.equal(evaluateSpyReleaseGate(wrongCommit,homologation).status,'NO_GO');
 const wrongReviewer=structuredClone(manifest);wrongReviewer.narratorApproval.reviewerId='different-gm';
 assert.equal(evaluateSpyReleaseGate(wrongReviewer,homologation).status,'NO_GO');
});
test('CI descartável não pode se passar por staging restaurado',()=>{
 const {manifest,homologation}=approvedFixture();
 for(const field of ['status','environment','backupRestoreEvidenceUrl','narratorSignedAt','reviewedCommit']){
  const t=structuredClone(homologation);t[field]=null;
  assert.equal(evaluateSpyReleaseGate(manifest,t).status,'NO_GO',field);
 }
 assert.equal(evaluateSpyReleaseGate(manifest,null).status,'NO_GO');
});
