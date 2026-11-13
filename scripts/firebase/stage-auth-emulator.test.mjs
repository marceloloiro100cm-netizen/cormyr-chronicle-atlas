import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAuthEmulatorOnly,planAuthEmulator,importAuthIntoEmulator,
} from './stage-auth-emulator.mjs';

// Public dummy hash for password "password"; never real campaign credentials.
const DUMMY_BCRYPT='$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
const host={FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'};

export function syntheticAuthSource(){
  const users=[
    {id:'narrator-demo',email:'narrator@example.invalid',encrypted_password:DUMMY_BCRYPT,email_confirmed_at:'2026-01-02',banned_until:null},
    {id:'player-demo',email:'player@example.invalid',encrypted_password:DUMMY_BCRYPT,email_confirmed_at:'2026-01-02'},
    {id:'oauth-demo',email:'oauth@example.invalid',encrypted_password:null,email_confirmed_at:'2026-01-02'},
    {id:'unprofiled-demo',email:'unprofiled@example.invalid',encrypted_password:DUMMY_BCRYPT,email_confirmed_at:null},
  ];
  const identities=[
    {user_id:'oauth-demo',provider:'google',provider_id:'google-subject-placeholder'},
    {user_id:'player-demo',provider:'custom:legacy-oidc',provider_id:'private-subject-placeholder'},
  ];
  const profiles=[
    {user_id:'narrator-demo',profile:'narrador',active:'t'},
    {user_id:'player-demo',profile:'jogador',active:'t'},
    {user_id:'oauth-demo',profile:'jogador',active:'t'},
  ];
  return {users,identities,profiles};
}

test('emulator-only plan keeps 4 IDs and 3 bcrypt hashes with NO claims or private values in summary',()=>{
  const {users,identities,profiles}=syntheticAuthSource();
  const p=planAuthEmulator(users,identities,profiles);
  assert.equal(p.summary.preflightValid,true);
  assert.equal(p.summary.sourceUsers,4);
  assert.equal(p.summary.bcryptCount,3);
  assert.equal(p.summary.passwordlessCount,1);
  assert.equal(p.summary.mappedProviders,1);
  assert.equal(p.summary.deferredCustomProviders,1);
  assert.equal(p.summary.accountsWithoutProfile,1);
  assert.equal(p.summary.cloudAuthWrites,0);
  assert.equal(p.summary.readyForCloudImport,false);
  assert.deepEqual(p.records.find(x=>x.uid==='oauth-demo').providerData,
    [{providerId:'google.com',uid:'google-subject-placeholder'}]);
  assert.ok(p.records.every(x=>!Object.hasOwn(x,'customClaims')));
  const aggregate=JSON.stringify(p.summary);
  assert.ok(!aggregate.includes('narrator@example.invalid'));
  assert.ok(!aggregate.includes('google-subject-placeholder'));
  assert.ok(!aggregate.includes(DUMMY_BCRYPT));
});

test('invalid email, duplicate UID or email, malformed bcrypt and unlinked custom-only account fail closed',()=>{
  const cases=[
    d=>{d.users[0].email='broken address';},
    d=>{d.users[1].id=d.users[0].id;},
    d=>{d.users[2].email=d.users[1].email;},
    d=>{d.users[0].encrypted_password='not a bcrypt hash';},
    d=>{d.identities.push({user_id:'nobody',provider:'google',provider_id:'x'});},
    d=>{d.identities.push({user_id:'player-demo',provider:'unknown',provider_id:'y'});},
    d=>{d.users[1].encrypted_password=null;},
    d=>{d.identities.push({user_id:'oauth-demo',provider:'google',provider_id:'google-subject-placeholder'});},
  ];
  for(const mutate of cases){
    const d=syntheticAuthSource();mutate(d);
    const p=planAuthEmulator(d.users,d.identities,d.profiles);
    assert.equal(p.summary.preflightValid,false);
  }
});

test('only loopback demo project Auth emulator is accepted',()=>{
  for(const env of [
    {},{FIREBASE_AUTH_EMULATOR_HOST:'firebase.googleapis.com:443'},
    {FIREBASE_AUTH_EMULATOR_HOST:'http://127.0.0.1:9099'},
    {FIREBASE_AUTH_EMULATOR_HOST:'0.0.0.0:9099'},
  ])assert.throws(()=>assertAuthEmulatorOnly(env,'demo-cormyr-migration'));
  assert.throws(()=>assertAuthEmulatorOnly(host,'cormyr'));
  assert.doesNotThrow(()=>assertAuthEmulatorOnly(host,'demo-cormyr-migration'));
});

test('import aborts if destination contains any account; never invokes importUsers',async()=>{
  const d=syntheticAuthSource();
  const p=planAuthEmulator(d.users,d.identities,d.profiles);
  let writes=0;
  const fake={
    listUsers:async()=>({users:[{uid:'existing'}]}),
    importUsers:async()=>{writes++;return {successCount:0,failureCount:0};},
  };
  await assert.rejects(importAuthIntoEmulator(p,fake,host),/not empty/);
  assert.equal(writes,0);
});

test('stubbed Auth emulator verifies account count and retained hashes without any claims',async()=>{
  const d=syntheticAuthSource();
  const p=planAuthEmulator(d.users,d.identities,d.profiles);
  let stored=[];
  const fake={
    listUsers:async()=>({users:stored}),
    importUsers:async(records,opts)=>{
      assert.deepEqual(opts,{hash:{algorithm:'BCRYPT'}});
      assert.equal(records.length,4);
      assert.equal(records.filter(r=>Buffer.isBuffer(r.passwordHash)).length,3);
      assert.ok(records.every(r=>!Object.hasOwn(r,'customClaims')));
      stored=records.map(r=>({uid:r.uid}));
      return {successCount:records.length,failureCount:0};
    },
  };
  const result=await importAuthIntoEmulator(p,fake,host);
  assert.deepEqual(result,{
    scope:'firebase-auth-emulator',imported:4,verified:4,
    passwordHashesRetained:3,passwordlessAccounts:1,
    deferredCustomProviders:1,accountsWithoutProfile:1,
    cloudAuthWrites:0,readyForCloudImport:false,
  });
  const textResult=JSON.stringify(result);
  assert.ok(!textResult.includes('example.invalid'));
  assert.ok(!textResult.includes(DUMMY_BCRYPT));
});
