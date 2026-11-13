import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {assertAuthEmulatorOnly} from './stage-auth-emulator.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {planUnifiedEmulator,executeUnifiedEmulator} from './stage-all-emulators.mjs';
import {syntheticSource} from './stage-all-emulators.fixture.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=createHash('sha256').update('unified-firebase-emulator-integration').digest('hex');

async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  assertAuthEmulatorOnly(process.env,PROJECT);
  const plan=planUnifiedEmulator(syntheticSource(),HASH);
  assert.equal(plan.summary.readyForEmulatorStage,true);

  const app=initializeApp({projectId:PROJECT},'cormyr-unified-emulator-integration');
  try{
    const auth=getAuth(app),db=getFirestore(app);
    const result=await executeUnifiedEmulator(plan,db,auth,process.env);
    assert.equal(result.staged,true);
    assert.equal(result.cloudWrites,0);
    assert.equal(result.readyForCutover,false);
    assert.equal(result.authImported,2);
    assert.equal(result.authVerified,2);
    assert.equal(result.typedCollections.houses,1);
    assert.equal(result.typedCollections.players,1);
    assert.equal(result.typedCollections.access,2);
    assert.equal(result.temporalHistoryRows,1);
    assert.equal(result.archivedMailHistoryRows,0);
    assert.equal(result.deliveredReplies,0);
    const counts=await auth.listUsers(1000);
    assert.equal(counts.users.length,2);
    assert.ok(counts.users.every(u=>!u.customClaims||!Object.keys(u.customClaims).length));
    const status=await db.collection('migrationUnifiedStage').doc(HASH).get();
    assert.equal(status.data().status,'complete');
    assert.equal(status.data().archiveRows,result.archiveRows);
    assert.equal(status.data().authUsers,2);
    const newspaper=await db.collection('migrationNewspaperStage').doc(HASH).get();
    assert.equal(newspaper.data().status,'complete');
    const mail=await db.collection('migrationMailHistoryStage').doc(HASH).get();
    assert.equal(mail.data().status,'complete');
    assert.equal(mail.data().archiveRows,0);
    await assert.rejects(executeUnifiedEmulator(plan,db,auth,process.env),/already contains/);
    console.log('Unified demo emulators: private archive, domains, Harptos, newspaper and Auth staged; second import refused.');
  }finally{
    await deleteApp(app);
  }
}
run().catch(()=>{
  console.error('Unified emulator integration failed; no private source values were printed.');
  process.exitCode=1;
});
