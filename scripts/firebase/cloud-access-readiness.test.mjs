import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFirebaseCloudReadiness} from './cloud-access-readiness.mjs';

const HASH='a'.repeat(64);
const PREFIX='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const AUTH='https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000';
const fields=(status='complete',privateValue=true)=>({
  status:{stringValue:status},private:{booleanValue:privateValue},
});
const stageNames=[
  'migrationDomainStage','migrationAuthStage','migrationTimeEngineStage',
  'migrationNobleHouseStage','migrationNewspaperRuntimeStage','migrationSpyStage',
];
const stage=id=>PREFIX+id+'/'+HASH+'?mask.fieldPaths=status&mask.fieldPaths=private';
const listing=PREFIX+'migrationDomainStage?pageSize=2&mask.fieldPaths=status&mask.fieldPaths=private';
const runtime=PREFIX+'campaignMailRuntime/'+HASH+
  '?mask.fieldPaths=status&mask.fieldPaths=private&mask.fieldPaths=sourceLiveReconciled&mask.fieldPaths=applicationEnabled&mask.fieldPaths=mailEnabled&mask.fieldPaths=sourceSnapshotId';
function fixture(overrides={}){
  const d=new Map([
    [listing,
      {documents:[{name:'projects/cormyr/databases/(default)/documents/migrationDomainStage/'+HASH,
        fields:fields()}]}],
    ...stageNames.filter(x=>x!=='migrationDomainStage')
      .map(x=>[stage(x),{fields:fields()}]),
    [runtime,{fields:{
      ...fields('active'),
      sourceSnapshotId:{stringValue:HASH},
      sourceLiveReconciled:{booleanValue:true},
      applicationEnabled:{booleanValue:true},
      mailEnabled:{booleanValue:true},
    }}],
    [AUTH,{users:Array.from({length:14},(_,i)=>({
      localId:'DO_NOT_LOG_UID_'+i,disabled:true,email:'private@example.org',
    }))}],
  ]);
  for(const [k,v] of Object.entries(overrides))d.set(k,v);
  const requests=[];
  const fetcher=async(url,options)=>{
    requests.push({url,options});
    if(!d.has(url))return new Response('',{status:404});
    const value=d.get(url);
    return new Response(JSON.stringify(value??{}),{
      status:200,headers:{'content-type':'application/json'},
    });
  };
  const run=()=>inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher,
  });
  return {run,d,requests};
}

test('Cloud-only OIDC readiness summarizes 6 stages and disabled accounts without data leaks',async()=>{
  const f=fixture();
  const report=await f.run();
  assert.equal(report.project,'cormyr');
  assert.equal(report.stagesVerified,6);
  assert.equal(report.singleVerifiedSnapshot,true);
  assert.equal(report.accounts,14);
  assert.equal(report.disabledAccounts,14);
  assert.equal(report.mailRuntimeEnabled,true);
  assert.equal(report.writes,0);
  assert.equal(report.readyForCutover,false);
  const summary=JSON.stringify(report);
  for(const hidden of ['DO_NOT_LOG_UID','private@example.org',
    'EPHEMERAL_TEST_TOKEN_SECRET',HASH]){
    assert.ok(!summary.includes(hidden));
  }
  assert.ok(f.requests.every(x=>x.options.method==='GET'&&
    x.options.credentials==='omit'&&x.options.redirect==='error'));
  assert.ok(f.requests.every(x=>x.url.startsWith(PREFIX)||x.url===AUTH));
});

test('missing Firestore/Auth permissions return only HTTP codes and retain NO_GO',async()=>{
  const requests=[];
  const report=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      requests.push({url,options});
      return new Response('DO_NOT_LOG_GOOGLE_ERROR_DETAILS',{status:403});
    },
  });
  assert.equal(report.firestoreHttpStatus,403);
  assert.equal(report.authHttpStatus,403);
  assert.equal(report.requiresFirestoreReadPermission,true);
  assert.equal(report.requiresFirebaseAuthReadPermission,true);
  assert.equal(report.singleVerifiedSnapshot,false);
  assert.equal(report.readyForCutover,false);
  assert.ok(!JSON.stringify(report).includes('DO_NOT_LOG_GOOGLE_ERROR_DETAILS'));
  assert.equal(requests.length,2);
});

test('two snapshots are inconclusive, do not choose one arbitrarily',async()=>{
  const f=fixture();
  const first=f.d.get(listing).documents[0];
  f.d.set(listing,{documents:[first,{...first,
    name:first.name.slice(0,-64)+'b'.repeat(64)}]});
  const report=await f.run();
  assert.equal(report.singleVerifiedSnapshot,false);
  assert.equal(report.stageCoverage,0);
  assert.equal(report.readyForCutover,false);
});

test('incomplete protected stage and inactive runtime cannot be released',async()=>{
  const f=fixture();
  f.d.set(stage('migrationAuthStage'),{fields:fields('incomplete')});
  f.d.set(runtime,{fields:{
    ...fields('active'),sourceSnapshotId:{stringValue:HASH},
    sourceLiveReconciled:{booleanValue:false},
    applicationEnabled:{booleanValue:false},mailEnabled:{booleanValue:false},
  }});
  const report=await f.run();
  assert.equal(report.singleVerifiedSnapshot,false);
  assert.equal(report.stagesVerified,5);
  assert.equal(report.mailRuntimeEnabled,false);
});

test('invalid token cannot initiate any cloud request',async()=>{
  await assert.rejects(()=>inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'short',
    fetcher:async()=>{throw Error('must not call');},
  }),/temporary_oidc_unavailable/);
});
