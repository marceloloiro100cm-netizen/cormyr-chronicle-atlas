import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {
  planUnifiedEmulator,executeUnifiedEmulator,
} from './stage-all-emulators.mjs';

const HASH=createHash('sha256').update('fully-synthetic-private-backup').digest('hex');
import {syntheticSource} from './stage-all-emulators.fixture.mjs';

test('consolidates 4 Firestore models and 1 Auth plan with no cloud access',()=>{
  const tables=syntheticSource();
  const plan=planUnifiedEmulator(tables,HASH);
  assert.equal(plan.summary.readyForEmulatorStage,true);
  for(const stage of Object.values(plan.summary.stages))
    assert.equal(stage.valid,true);
  assert.equal(plan.summary.stages.typedDomain.collections.houses,1);
  assert.equal(plan.summary.stages.typedDomain.collections.players,1);
  assert.equal(plan.summary.stages.typedDomain.collections.access,2);
  assert.equal(plan.summary.stages.typedDomain.letters.source,0);
  assert.equal(plan.summary.stages.temporal.calendarProjected,true);
  assert.equal(plan.summary.stages.temporal.historyTables,7);
  assert.equal(plan.summary.stages.newspaper.historyTables,8);
  assert.equal(plan.summary.stages.auth.importCandidates,2);
  assert.equal(plan.summary.cloudWrites,0);
  assert.equal(plan.summary.readyForCloudImport,false);
  assert.equal(plan.summary.readyForCutover,false);
  assert.ok(!JSON.stringify(plan.summary).includes('narrator@example.com'));
  assert.ok(!JSON.stringify(plan.summary).includes(BCRYPT));
});

test('any missing domain table blocks ALL emulator writes',()=>{
  const tables=syntheticSource().filter(x=>x.table!=='public.campaign_newspaper_settings');
  const plan=planUnifiedEmulator(tables,HASH);
  assert.equal(plan.summary.stages.newspaper.valid,false);
  assert.equal(plan.summary.readyForEmulatorStage,false);
});
test('missing Auth table or zero Auth users blocks a unified stage',()=>{
  const missing=syntheticSource().filter(x=>x.table!=='auth.identities');
  const p=planUnifiedEmulator(missing,HASH);
  assert.deepEqual(p.summary.missingAuthTables,['auth.identities']);
  assert.equal(p.summary.readyForEmulatorStage,false);
  const empty=syntheticSource();
  empty.find(x=>x.table==='auth.users').rows=[];
  assert.equal(planUnifiedEmulator(empty,HASH).summary.readyForEmulatorStage,false);
});

test('wrong project or missing local emulator host is rejected before any IO',async()=>{
  const plan=planUnifiedEmulator(syntheticSource(),HASH);
  const fakeDb={collection:()=>{throw Error('must not access db');}};
  await assert.rejects(executeUnifiedEmulator(plan,fakeDb,{},{}),/emulator/);
  await assert.rejects(executeUnifiedEmulator(plan,fakeDb,{},{
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST:'firebase.googleapis.com:443',
  }),/emulator/i);
});

test('existing Auth account blocks all Firestore writes in unified flow',async()=>{
  const plan=planUnifiedEmulator(syntheticSource(),HASH);
  let writes=0,reads=0;
  const db={collection:()=>({
    doc:()=>({
      get:async()=>{reads++;return {exists:false};},
      set:()=>{writes++;},
    }),
  })};
  const auth={listUsers:async()=>({users:[{uid:'existing'}]})};
  await assert.rejects(executeUnifiedEmulator(plan,db,auth,{
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',
  }),/destination already contains/);
  assert.equal(reads,5);
  assert.equal(writes,0);
});
