import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_AUTH_ACCOUNTS,ACTIVATION_PHRASE,
  planAllExistingAuthTestAccounts,executeAllExistingAuthTestAccounts,
  safeActivationSummary,safePreflightFailureCode,
} from './auth-enable-all-test-accounts.mjs';

const SNAP='a'.repeat(64);
const users=()=>Array.from({length:EXPECTED_AUTH_ACCOUNTS},(_,i)=>({
  uid:'synthetic_uid_'+i,disabled:true,email:'PRIVATE_USER_'+i+'@example.org',
}));
const access=()=>users().map((u,i)=>({
  id:u.uid,
  data:{
    userId:u.uid,
    profile:i===0?'narrador':i<=10?'jogador':i===11?'editor':null,
    admin:i===0,
    active:i>=10&&i!==11?false:true,
    requirePasswordChange:i>=12,
    memberHouseIds:i>=1&&i<=8?['synthetic_house_'+i]:[],
    editHouseIds:i>=1&&i<=8?['synthetic_house_'+i]:[],
    privateNotes:'SECRET_NOT_FOR_LOGS',
  },
}));
const houses=()=>Array.from({length:11},(_,i)=>({
  id:'synthetic_house_record_'+i,
  data:{sourceId:'synthetic_house_'+(i+1),active:i<10,
    season:2,privateNotes:'SECRET_HOUSE_NOTE'},
}));

function fakeEnvironment({failUpdateAt=-1,denied=false}={}){
  const accountRows=users(),accessRows=access(),houseRows=houses();
  let updates=0,reads=0;
  const auth={
    async listUsers(){reads++;return {users:accountRows.map(u=>({...u}))};},
    async updateUser(uid,payload){
      if(denied||updates===failUpdateAt)throw Error('PRIVATE_PROVIDER_ERROR');
      updates++;
      const u=accountRows.find(row=>row.uid===uid);
      assert.deepEqual(payload,{disabled:false});
      assert.ok(u);
      u.disabled=false;
      return {...u};
    },
    async getUser(uid){
      const u=accountRows.find(row=>row.uid===uid);
      return {...u};
    },
  };
  const db={
    collection(name){
      assert.ok(['migrationDomainStage','migrationAuthStage'].includes(name));
      return {
        limit(n){
          assert.equal(name,'migrationDomainStage');
          assert.equal(n,2);
          return {async get(){return {docs:[{id:SNAP,data:()=>({
            status:'complete',private:true,
          })}]};}};
        },
        doc(id){
          assert.equal(id,SNAP);
          return {
            async get(){
              assert.equal(name,'migrationAuthStage');
              return {exists:true,data:()=>({status:'complete',private:true})};
            },
            collection(child){
              assert.equal(name,'migrationDomainStage');
              assert.ok(['access','houses'].includes(child));
              return {async get(){return {docs:
                (child==='access'?accessRows:houseRows).map(v=>({
                  id:v.id,data:()=>structuredClone(v.data),
                }))};}};
            },
          };
        },
      };
    },
  };
  return {auth,db,getUpdates:()=>updates,getReads:()=>reads,
    getDisabled:()=>accountRows.filter(x=>x.disabled).length,
    accessRows,houseRows,accountRows};
}

test('all 14 can be planned without silently granting invalid profiles or Houses',()=>{
  const plan=planAllExistingAuthTestAccounts({
    users:users(),accessDocs:access(),houses:houses(),
  });
  assert.equal(plan.summary.accounts,14);
  assert.equal(plan.summary.linkedAccounts,14);
  assert.equal(plan.summary.toEnable,14);
  assert.equal(plan.privatePlan.uidToEnable.length,14);
  assert.equal(plan.summary.profileCounts.narrador,1);
  assert.equal(plan.summary.profileCounts.jogador,10);
  assert.equal(plan.summary.profileCounts.editor,1);
  assert.equal(plan.summary.profileCounts.other,2);
  assert.equal(plan.summary.pendingRoleOrHouse,4);
  assert.equal(plan.summary.firestoreWrites,0);
  assert.equal(plan.summary.readyForPlayers,false);
  const publicReport=JSON.stringify(plan.summary);
  for(const sensitive of ['synthetic_uid_','synthetic_house_',
    'PRIVATE_USER_','SECRET_NOT_FOR_LOGS'])
    assert.ok(!publicReport.includes(sensitive));
});

test('preview reads inventory but never calls Auth update',async()=>{
  const f=fakeEnvironment();
  const report=await executeAllExistingAuthTestAccounts({
    auth:f.auth,db:f.db,mode:'preview',
  });
  assert.equal(f.getUpdates(),0);
  assert.equal(f.getDisabled(),14);
  assert.equal(report.activationComplete,false);
  assert.equal(report.authUpdatesAttempted,0);
  assert.equal(report.toEnable,14);
  assert.equal(report.releaseDecision,'NO_GO');
});

test('activate requires exact phrase and cannot update without it',async()=>{
  for(const phrase of ['',undefined,'YES','ENABLE_ALL']){
    const f=fakeEnvironment();
    await assert.rejects(
      ()=>executeAllExistingAuthTestAccounts({
        auth:f.auth,db:f.db,mode:'activate',confirmation:phrase,
      }),/activation_preflight_explicit_confirmation_required/);
    assert.equal(f.getUpdates(),0);
    assert.equal(f.getReads(),0);
  }
});

test('enabled exactly 14/14 with post-update and final full inventory audit',async()=>{
  const f=fakeEnvironment();
  const report=await executeAllExistingAuthTestAccounts({
    auth:f.auth,db:f.db,mode:'activate',confirmation:ACTIVATION_PHRASE,
  });
  assert.equal(f.getUpdates(),14);
  assert.equal(f.getDisabled(),0);
  assert.equal(report.authUsersEnabled,14);
  assert.equal(report.accountsAfter,14);
  assert.equal(report.remainingDisabled,0);
  assert.equal(report.activationComplete,true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.firestoreWrites,0);
  assert.equal(report.profilesModified,0);
  assert.equal(report.houseAssignmentsModified,0);
});

test('partial failure reports only safe aggregate and does not pretend full success',async()=>{
  const f=fakeEnvironment({failUpdateAt:3});
  const report=await executeAllExistingAuthTestAccounts({
    auth:f.auth,db:f.db,mode:'activate',confirmation:ACTIVATION_PHRASE,
  });
  assert.equal(report.activationComplete,false);
  assert.equal(report.authUsersEnabled,3);
  assert.equal(report.authUpdatesAttempted,4);
  assert.equal(f.getDisabled(),11);
  const output=JSON.stringify(report)+safeActivationSummary(report);
  assert.ok(!output.includes('synthetic_uid_'));
  assert.ok(!output.includes('PRIVATE_PROVIDER_ERROR'));
});

test('missing link, unknown role and dangling House block all writes',async()=>{
  for(const mutate of [
    f=>{f.accessRows.pop();},
    f=>{f.accessRows[0].data.userId='OTHER_UID';},
    f=>{f.accessRows[0].data.profile='superadmin';},
    f=>{f.accessRows[1].data.memberHouseIds=['unknown_house'];},
    f=>{f.accessRows[1].data.editHouseIds=['OTHER_HOUSE'];},
    f=>{f.houseRows[0].data.active=false;},
    f=>{f.accountRows.push({uid:'unexpected',disabled:true});},
  ]){
    const f=fakeEnvironment();
    mutate(f);
    await assert.rejects(
      ()=>executeAllExistingAuthTestAccounts({
        auth:f.auth,db:f.db,mode:'activate',
        confirmation:ACTIVATION_PHRASE,
      }),/activation_preflight_/);
    assert.equal(f.getUpdates(),0);
  }
});

test('no extra Identity or Firestore write methods are used in preview',async()=>{
  const f=fakeEnvironment({denied:true});
  const preview=await executeAllExistingAuthTestAccounts({
    auth:f.auth,db:f.db,mode:'preview',
  });
  assert.equal(preview.activationComplete,false);
  assert.equal(preview.authUsersEnabled,0);
  assert.equal(f.getUpdates(),0);
});

test('GitHub summary never includes UIDs, private notes or error messages',()=>{
  const plan=planAllExistingAuthTestAccounts({
    users:users(),accessDocs:access(),houses:houses(),
  });
  const summary=safeActivationSummary({...plan.summary,mode:'preview'});
  for(const secret of ['synthetic_uid_','synthetic_house_',
    'PRIVATE_USER','SECRET_HOUSE_NOTE','Bearer '])
    assert.ok(!summary.includes(secret));
  assert.ok(summary.includes('14'));
  assert.ok(summary.includes('NÃO'));
});

test('preflight errors give only safe phase codes and never provider details',async()=>{
  const f=fakeEnvironment();
  f.auth.listUsers=async()=>{throw Object.assign(
    Error('PRIVATE_ACCOUNT_INFORMATION'),{code:'permission-denied'});
  };
  await assert.rejects(
    ()=>executeAllExistingAuthTestAccounts({
      auth:f.auth,db:f.db,mode:'preview',
    }),err=>{
      assert.equal(safePreflightFailureCode(err),
        'auth_inventory_permission_denied');
      assert.ok(!String(err.message).includes('PRIVATE_ACCOUNT_INFORMATION'));
      return true;
    });
  assert.equal(safePreflightFailureCode(
    Error('PRIVATE_ACCOUNT_INFORMATION')),
    'unclassified_cloud_or_runtime_error');
  assert.equal(safePreflightFailureCode(
    Error('activation_preflight_access_schema_invalid')),
    'access_schema_invalid');
});

test('preflight diagnostics distinguish Firestore read denial without leaking details',async()=>{
  const f=fakeEnvironment();
  f.db.collection=()=>({
    limit:()=>({get:async()=>{throw Object.assign(
      Error('PRIVATE_FIRESTORE_PATH'),{code:7});
    }}),
  });
  await assert.rejects(
    ()=>executeAllExistingAuthTestAccounts({
      auth:f.auth,db:f.db,mode:'preview',
    }),err=>{
      assert.equal(safePreflightFailureCode(err),
        'domain_snapshot_permission_denied');
      assert.ok(!String(err.message).includes('PRIVATE_FIRESTORE_PATH'));
      return true;
    });
});
