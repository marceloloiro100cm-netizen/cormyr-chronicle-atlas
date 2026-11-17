import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCloudRuntimeSources} from './cloud-runtime-source-preflight.mjs';

const SNAP='a'.repeat(64);
const CORE=[
  'migrationDomainStage','migrationAuthStage','migrationTimeEngineStage',
  'migrationNobleHouseStage','migrationNewspaperRuntimeStage','migrationSpyStage',
];
const AUX=[
  'migrationPrivateGmStage','migrationDriveSyncStage',
  'migrationPublicContentStage','migrationStorageStage',
];
const calendar=()=>({
  calendarType:'harptos',year:1522,month:0,day:10,festival:null,
  lastRound:2,version:5,privateNotes:'DO_NOT_LEAK_CALENDAR_NOTES',
});
function dbFixture({missing=[],badCalendar=false,mailExists=false,
  houseExists=false,sourceMismatch=false,
  mailDraftFields={},houseDraftFields={}}={}){
  let reads=0, writes=0;
  const db={
    collection(name){
      assert.ok([...CORE,...AUX,'campaignMailRuntime',
        'campaignCloudRuntime'].includes(name));
      return {doc(id){
        assert.equal(id,SNAP);
        return {
          async get(){
            reads++;
            if(name==='campaignMailRuntime')return {
              exists:mailExists,data:()=>({
                status:'pending',private:true,sourceSnapshotId:SNAP,
                applicationEnabled:false,sourceLiveReconciled:false,
                mailEnabled:false,...mailDraftFields,
              }),
            };
            if(name==='campaignCloudRuntime')return {
              exists:houseExists,data:()=>({
                status:'pending',private:true,sourceSnapshotId:SNAP,
                applicationEnabled:false,sourceSnapshotReconciled:false,
                mailWriteApproved:false,publicCatalogApproved:false,
                publicTranslationsApproved:false,publicTimeApproved:false,
                ...houseDraftFields,
              }),
            };
            return {exists:!missing.includes(name),
              data:()=>({status:'complete',private:true,
                sourceSnapshotId:sourceMismatch?'b'.repeat(64):SNAP,
                other:'DO_NOT_LEAK_OTHER_STAGE_DATA'})};
          },
          collection(n){
            assert.equal(name,'migrationTimeEngineStage');
            assert.equal(n,'calendar');
            return {doc(calId){
              assert.equal(calId,'current');
              return {async get(){
                reads++;
                return {exists:true,data:()=>badCalendar
                  ?{...calendar(),version:0}:calendar()};
              }};
            }};
          },
          set(){writes++;throw Error('writes forbidden');},
        };
      }};
    },
    runTransaction(){writes++;throw Error('writes forbidden');},
  };
  return {db,counts:()=>({reads,writes})};
}

test('read-only prerequisites reveal aggregates but never authorize a runtime',async()=>{
  const f=dbFixture();
  const r=await inspectCloudRuntimeSources({db:f.db,snapshotId:SNAP});
  assert.equal(r.sourceStagesVerified,6);
  assert.equal(r.auxiliaryStagesVerified,4);
  assert.equal(r.calendarDocumentVerified,true);
  assert.equal(r.calendarHasHistoricalRound,true);
  assert.equal(r.currentRoundApproved,false);
  assert.equal(r.readyForRuntimeProvisioning,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.cloudWrites,0);
  assert.equal(f.counts().reads,13);
  assert.equal(f.counts().writes,0);
  const output=JSON.stringify(r);
  for(const secret of [SNAP,'DO_NOT_LEAK','1522','House A','PRIVATE_ID'])
    assert.ok(!output.includes(secret));
});
test('absent public content and both runtimes are clearly distinguished',async()=>{
  const f=dbFixture({missing:['migrationPublicContentStage']});
  const r=await inspectCloudRuntimeSources({db:f.db,snapshotId:SNAP});
  assert.deepEqual(r.missingAuxiliaryStages,['migrationPublicContentStage']);
  assert.equal(r.auxiliaryStagesVerified,3);
  assert.equal(r.mailRuntimeExists,false);
  assert.equal(r.houseRuntimeExists,false);
  assert.equal(r.calendarDocumentVerified,true);
  assert.equal(r.readyForPlayers,false);
});
test('mismatched snapshots, incomplete stages or invalid calendars fail closed',async()=>{
  for(const options of [
    {sourceMismatch:true},
    {missing:['migrationTimeEngineStage']},
    {badCalendar:true},
  ]){
    const f=dbFixture(options);
    const r=await inspectCloudRuntimeSources({db:f.db,snapshotId:SNAP});
    assert.ok(r.sourceStagesVerified<6||r.calendarDocumentVerified===false);
    assert.equal(r.readyForRuntimeProvisioning,false);
    assert.equal(r.cloudWrites,0);
    assert.equal(f.counts().writes,0);
  }
});
test('existing runtimes and historical round are not proof of live authorization',async()=>{
  const f=dbFixture({mailExists:true,houseExists:true});
  const r=await inspectCloudRuntimeSources({db:f.db,snapshotId:SNAP});
  assert.equal(r.mailRuntimeExists,true);
  assert.equal(r.houseRuntimeExists,true);
  assert.equal(r.calendarHasHistoricalRound,true);
  assert.equal(r.currentRoundApproved,false);
  assert.equal(r.readyForRuntimeProvisioning,false);
});
test('snapshot and Firestore client are mandatory before any reads',async()=>{
  const f=dbFixture();
  await assert.rejects(()=>inspectCloudRuntimeSources({db:f.db,snapshotId:'bad'}),
    /runtime_source_invalid_configuration/);
  await assert.rejects(()=>inspectCloudRuntimeSources({snapshotId:SNAP}),
    /runtime_source_invalid_configuration/);
  assert.deepEqual(f.counts(),{reads:0,writes:0});
});

test('two created but disabled runtime roots are explicitly verified',async()=>{
  const f=dbFixture({mailExists:true,houseExists:true});
  const r=await inspectCloudRuntimeSources({db:f.db,snapshotId:SNAP});
  assert.equal(r.mailRuntimeExists,true);
  assert.equal(r.houseRuntimeExists,true);
  assert.equal(r.mailDraftConfirmed,true);
  assert.equal(r.houseDraftConfirmed,true);
  assert.equal(r.disabledDraftsConfirmed,true);
  assert.equal(r.currentRoundApproved,false);
  assert.equal(r.freshSourceDeltaReconciled,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.readyForCutover,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.equal(f.counts().writes,0);
  const published=JSON.stringify(r);
  assert.ok(!published.includes(SNAP));
  assert.ok(!published.includes('DO_NOT_LEAK'));
});
test('a draft with active status, approved writes or bogus round never passes',async()=>{
  for(const options of [
    {mailDraftFields:{status:'active'}},
    {houseDraftFields:{status:'active'}},
    {mailDraftFields:{mailEnabled:true}},
    {houseDraftFields:{mailWriteApproved:true}},
    {houseDraftFields:{publicCatalogApproved:true}},
    {houseDraftFields:{publicTimeApproved:true}},
    {houseDraftFields:{sourceSnapshotReconciled:true}},
    {mailDraftFields:{sourceLiveReconciled:true}},
    {houseDraftFields:{sourceSnapshotId:'b'.repeat(64)}},
    {houseDraftFields:{openRound:3}},
    {mailDraftFields:{calendarVersion:7}},
    {houseDraftFields:{applicationEnabled:true}},
  ]){
    const f=dbFixture({mailExists:true,houseExists:true,...options});
    const r=await inspectCloudRuntimeSources({db:f.db,snapshotId:SNAP});
    assert.equal(r.disabledDraftsConfirmed,false);
    assert.equal(r.readyForPlayers,false);
    assert.equal(f.counts().writes,0);
  }
});
