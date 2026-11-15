import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT,DOMAIN_GROUPS,DOMAIN_TOTAL,modulesForGroup,
  validateIsolatedExecution,executeDomainAcceptance,
} from './full-domain-emulator-acceptance.mjs';

const localEnv={
  FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',
};

test('all domains have unique, fixed synthetic integration scripts',()=>{
  assert.equal(PROJECT,'demo-cormyr-migration');
  assert.equal(DOMAIN_TOTAL,20);
  assert.deepEqual(Object.keys(DOMAIN_GROUPS),
    ['houses','communications','strategy','operations','security']);
  const all=Object.values(DOMAIN_GROUPS).flat();
  assert.equal(new Set(all).size,all.length);
  assert.ok(all.every(name=>/^[a-z][a-z-]*\.integration\.mjs$/.test(name)));
  assert.ok(all.includes('mail-command-service.integration.mjs'));
  assert.ok(all.includes('lot5-role-security.integration.mjs'));
  assert.ok(all.includes('storage-resolvers.integration.mjs'));
  assert.throws(()=>modulesForGroup('../production'),/Unknown/);
  assert.throws(()=>modulesForGroup(''),/Unknown/);
});

test('cannot start any domain acceptance without both local emulators',()=>{
  assert.throws(()=>validateIsolatedExecution('houses',{}),/local Firestore|Local Firestore/i);
  assert.throws(()=>validateIsolatedExecution('houses',{
    FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443',
    FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',
  }),/local Firestore|Local Firestore/i);
  assert.throws(()=>validateIsolatedExecution('houses',{
    ...localEnv,FIREBASE_AUTH_EMULATOR_HOST:'identitytoolkit.googleapis.com:443',
  }),/Local Auth/);
  assert.throws(()=>validateIsolatedExecution('houses',{
    ...localEnv,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',
  }),/Local Auth/);
  assert.equal(validateIsolatedExecution('houses',localEnv).length,4);
});

test('runs exactly the chosen allowlisted group without shell execution',()=>{
  const calls=[];
  const report=executeDomainAcceptance('communications',{
    env:localEnv,
    spawn:(exe,args,options)=>{
      calls.push({exe,args,options});
      return {status:0};
    },
  });
  assert.equal(calls.length,4);
  assert.equal(report.passedModules,4);
  assert.equal(report.productionCloudWrites,0);
  assert.equal(report.cloudIdentityVerified,false);
  assert.equal(report.privateDataReconciled,false);
  assert.equal(report.readyForCutover,false);
  for(const call of calls){
    assert.equal(call.exe,process.execPath);
    assert.equal(call.args.length,1);
    assert.ok(call.args[0].endsWith('.integration.mjs'));
    assert.equal(call.options.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
    assert.equal(call.options.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
  }
});

test('failure in any synthetic module fails entire group with no Cloud fallback',()=>{
  let called=0;
  assert.throws(()=>executeDomainAcceptance('strategy',{
    env:localEnv,
    spawn:()=>({status:++called===2?1:0}),
  }),/Synthetic domain test failed/);
  assert.equal(called,2);
  assert.throws(()=>executeDomainAcceptance('security',{
    env:localEnv,
    spawn:()=>({status:null,error:new Error('private fixture')}),
  }),/Synthetic domain test failed/);
});
