import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {
  assertAuthEmulatorOnly, planAuthEmulator,importAuthIntoEmulator,
} from './stage-auth-emulator.mjs';

const DEMO='demo-cormyr-migration';
const TEST_HASH='$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

async function run(){
  assertAuthEmulatorOnly(process.env,DEMO);
  const users=[
    {id:'narrator-demo',email:'narrator@example.com',encrypted_password:TEST_HASH,email_confirmed_at:'2026-01-01'},
    {id:'player-demo',email:'player@example.com',encrypted_password:TEST_HASH,email_confirmed_at:'2026-01-02'},
    {id:'oauth-demo',email:'oauth@example.com',encrypted_password:null,email_confirmed_at:'2026-01-03'},
    {id:'unprofiled-demo',email:'unprofiled@example.com',encrypted_password:TEST_HASH,email_confirmed_at:null},
  ];
  const identities=[
    {user_id:'oauth-demo',provider:'google',provider_id:'synthetic-google-subject'},
    {user_id:'player-demo',provider:'custom:legacy-provider',provider_id:'synthetic-custom-subject'},
  ];
  const profiles=[
    {user_id:'narrator-demo',profile:'narrador',active:'t'},
    {user_id:'player-demo',profile:'jogador',active:'t'},
    {user_id:'oauth-demo',profile:'jogador',active:'t'},
  ];
  const plan=planAuthEmulator(users,identities,profiles);
  assert.equal(plan.summary.preflightValid,true);
  assert.equal(plan.summary.accountsWithoutProfile,1);

  const app=initializeApp({projectId:DEMO},'cormyr-auth-emulator-e2e');
  try{
    const auth=getAuth(app);
    const output=await importAuthIntoEmulator(plan,auth,process.env);
    assert.equal(output.imported,4);
    assert.equal(output.verified,4);
    assert.equal(output.cloudAuthWrites,0);
    assert.equal(output.readyForCloudImport,false);
    const imported=await auth.listUsers(1000);
    assert.equal(imported.users.length,4);
    assert.equal(imported.users.filter(u=>u.emailVerified).length,3);
    assert.equal(imported.users.filter(u=>u.providerData.some(p=>p.providerId==='google.com')).length,1);
    assert.ok(imported.users.every(u=>!u.customClaims || !Object.keys(u.customClaims).length));
    await assert.rejects(importAuthIntoEmulator(plan,auth,process.env),/not empty/);
    console.log('Firebase Auth emulator: 4 synthetic UIDs preserved, 1 OAuth mapping, no roles, nonempty destination blocked.');
  }finally{
    await deleteApp(app);
  }
}

run().catch(()=>{
  console.error('Auth emulator integration failed; no personal data printed.');
  process.exitCode=1;
});
