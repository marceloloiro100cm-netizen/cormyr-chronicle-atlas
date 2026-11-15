import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  assertPrivateCloudTarget, assertEmptyCloudDestination,
  executePrivateHomologation,
} from './phase12-private-cloud-homolog.mjs';

const project='cormyr-homolog-20261115';
const approved={
  CORMYR_HOMOLOG_RULES_ACK:'DENY_ALL_DEPLOYED_TO_THIS_HOMOLOGATION_PROJECT',
  CORMYR_PHASE12_IMPORT_ACK:'APPROVE_PRIVATE_AUTH_AND_FIRESTORE_IMPORT',
};

test('cannot write to the live Cormyr project or an unapproved target',()=>{
  for (const id of ['cormyr','demo-cormyr-migration','other-project','cormyr-homolog-']) {
    assert.throws(()=>assertPrivateCloudTarget(id,approved,true));
  }
  assert.equal(assertPrivateCloudTarget(project,{},false),true);
  assert.throws(()=>assertPrivateCloudTarget(project,{},true));
  assert.throws(()=>assertPrivateCloudTarget(project,{
    ...approved,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  },true));
  assert.throws(()=>assertPrivateCloudTarget(project,{
    ...approved,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',
  },true));
  assert.equal(assertPrivateCloudTarget(project,approved,true),true);
});

test('requires EMPTY Firestore and Auth; rejects occupied or unreadable targets',async()=>{
  const db=(collections)=>({listCollections:async()=>collections});
  const auth=(users)=>({listUsers:async()=>({users})});
  await assertEmptyCloudDestination(db([]),auth([]));
  await assert.rejects(assertEmptyCloudDestination(db([{}]),auth([])),/empty/);
  await assert.rejects(assertEmptyCloudDestination(db([]),auth([{}])),/empty/);
  await assert.rejects(assertEmptyCloudDestination(db([]),{listUsers:async()=>({users:[],pageToken:'more'})}),/empty/);
});

test('no cloud writes before full source validation',async()=>{
  let touched=false;
  const db={listCollections:async()=>{touched=true;return []}};
  const auth={listUsers:async()=>{touched=true;return {users:[]}}};
  await assert.rejects(
    executePrivateHomologation({summary:{readyForEmulatorStage:false}},db,auth,project,approved),
    /not_ready/,
  );
  assert.equal(touched,false);
  await assert.rejects(
    executePrivateHomologation({},db,auth,'cormyr',approved),
    /isolated/,
  );
  assert.equal(touched,false);
});

test('operator shell parses and preserves fixed private source digest',()=>{
  const run=spawnSync('bash',['-n','scripts/firebase/phase12-15nov-operator.sh'],{encoding:'utf8'});
  assert.equal(run.status,0);
  assert.equal(run.stderr,'');
});
