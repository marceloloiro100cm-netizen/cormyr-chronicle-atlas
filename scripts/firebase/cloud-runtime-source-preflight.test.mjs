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
  houseExists=false,sourceMismatch=false}={}){
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
            if(name==='campaignMailRuntime')return {exists:mailExists};
            if(name==='campaignCloudRuntime')return {exists:houseExists};
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
