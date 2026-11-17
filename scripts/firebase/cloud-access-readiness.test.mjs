import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFirebaseCloudReadiness,formatCloudReadinessSummary}
  from './cloud-access-readiness.mjs';

const HASH='a'.repeat(64);
const PREFIX='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const AUTH='https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000';
const AUTH_CONFIG='https://identitytoolkit.googleapis.com/admin/v2/projects/cormyr/config';
const fields=(status='complete',privateValue=true)=>({
  status:{stringValue:status},private:{booleanValue:privateValue},
});
const stageNames=[
  'migrationDomainStage','migrationAuthStage','migrationTimeEngineStage',
  'migrationNobleHouseStage','migrationNewspaperRuntimeStage','migrationSpyStage',
];
const auxiliaryStageNames=[
  'migrationPrivateGmStage','migrationDriveSyncStage',
  'migrationPublicContentStage','migrationStorageStage',
];
const stage=id=>PREFIX+id+'/'+HASH+'?mask.fieldPaths=status&mask.fieldPaths=private';
const listing=PREFIX+'migrationDomainStage?pageSize=2&mask.fieldPaths=status&mask.fieldPaths=private';
const runtime=PREFIX+'campaignMailRuntime/'+HASH+
  '?mask.fieldPaths=status&mask.fieldPaths=private&mask.fieldPaths=sourceLiveReconciled&mask.fieldPaths=applicationEnabled&mask.fieldPaths=mailEnabled&mask.fieldPaths=sourceSnapshotId';
const operational=PREFIX+'campaignCloudRuntime/'+HASH+
  '?mask.fieldPaths=status&mask.fieldPaths=private'+
  '&mask.fieldPaths=sourceSnapshotId'+
  '&mask.fieldPaths=sourceSnapshotReconciled'+
  '&mask.fieldPaths=applicationEnabled'+
  '&mask.fieldPaths=calendarVersion';
function fixture(overrides={}){
  const d=new Map([
    [listing,
      {documents:[{name:'projects/cormyr/databases/(default)/documents/migrationDomainStage/'+HASH,
        fields:fields()}]}],
    ...stageNames.filter(x=>x!=='migrationDomainStage')
      .map(x=>[stage(x),{fields:fields()}]),
    ...auxiliaryStageNames.map(x=>[stage(x),{fields:fields()}]),
    [runtime,{fields:{
      ...fields('active'),
      sourceSnapshotId:{stringValue:HASH},
      sourceLiveReconciled:{booleanValue:true},
      applicationEnabled:{booleanValue:true},
      mailEnabled:{booleanValue:true},
    }}],
    [operational,{fields:{
      ...fields('active'),
      sourceSnapshotId:{stringValue:HASH},
      sourceSnapshotReconciled:{booleanValue:true},
      applicationEnabled:{booleanValue:true},
      calendarVersion:{integerValue:'2'},
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

test('supplemental GM, Drive, public and Storage stages are inspected only by masked status',async()=>{
  const names=[
    'migrationPrivateGmStage','migrationDriveSyncStage',
    'migrationPublicContentStage','migrationStorageStage',
  ];
  const extra=Object.fromEntries(names.map(name=>[
    PREFIX+name+'/'+HASH+'?mask.fieldPaths=status&mask.fieldPaths=private',
    {fields:{...fields(),secret:{stringValue:'DO_NOT_LOG_SECRET'}}},
  ]));
  const f=fixture(extra);
  const report=await f.run();
  assert.equal(report.auxiliaryStageCoverage,4);
  assert.equal(report.auxiliaryStagesVerified,4);
  assert.equal(report.auxiliaryStagesComplete,true);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.equal(report.readyForCutover,false);
  assert.equal(report.writes,0);
  assert.ok(!JSON.stringify(report).includes('DO_NOT_LOG_SECRET'));
  for(const name of names){
    const request=f.requests.find(x=>x.url.includes('/'+name+'/'));
    assert.ok(request);
    assert.ok(request.url.endsWith('mask.fieldPaths=private'));
    assert.equal(request.options.method,'GET');
  }
  assert.ok(!f.requests.some(x=>/\/content\/|\/bindings\/|\/players\/|\/gallery\//.test(x.url)));
});

test('Cloud-only OIDC readiness summarizes 6 stages and disabled accounts without data leaks',async()=>{
  const f=fixture();
  const report=await f.run();
  assert.equal(report.project,'cormyr');
  assert.equal(report.stagesVerified,6);
  assert.equal(report.singleVerifiedSnapshot,true);
  assert.equal(report.accounts,14);
  assert.equal(report.disabledAccounts,14);
  assert.equal(report.mailRuntimeEnabled,true);
  assert.equal(report.operationalRuntimeHttpStatus,200);
  assert.equal(report.operationalRuntimeReconciled,true);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.deepEqual(report.blockingCodes,['CLOUD_ROLE_E2E_PENDING']);
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
  const authRequest=f.requests.find(x=>x.url===AUTH);
  assert.equal(authRequest.options.headers['X-Goog-User-Project'],'cormyr');
  assert.equal(authRequest.options.headers.Authorization,
    'Bearer EPHEMERAL_TEST_TOKEN_SECRET');
  assert.ok(f.requests.filter(x=>x.url.startsWith(PREFIX))
    .every(x=>!('X-Goog-User-Project' in x.options.headers)));
});

test('missing public-content stage is an explicit no-cutover blocker',async()=>{
  const f=fixture();
  f.d.delete(stage('migrationPublicContentStage'));
  const report=await f.run();
  assert.equal(report.auxiliaryStageCoverage,4);
  assert.equal(report.auxiliaryStagesVerified,3);
  assert.equal(report.auxiliaryStagesComplete,false);
  assert.deepEqual(report.auxiliaryPendingStages,['migrationPublicContentStage']);
  assert.equal(report.auxiliaryStageHttpStatusCounts['404'],1);
  assert.ok(report.blockingCodes.includes('AUXILIARY_STAGES_UNVERIFIED'));
  assert.equal(report.authListComplete,true);
  assert.equal(report.accounts,14);
  assert.equal(report.readyForCutover,false);
});

test('Auth quota-project header reproduces Cloud Shell fix with no IAM writes',async()=>{
  const requests=[];
  const report=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      requests.push({url,options});
      if(url===AUTH){
        if(options.headers['X-Goog-User-Project']!=='cormyr')
          return Response.json({error:{status:'PERMISSION_DENIED'}},
            {status:403});
        return Response.json({users:Array.from({length:14},()=>({
          localId:'NEVER_LOG_UID',disabled:true,
        }))});
      }
      return new Response('HIDDEN_DATA',{status:403});
    },
  });
  assert.equal(report.authHttpStatus,200);
  assert.equal(report.accounts,14);
  assert.equal(report.disabledAccounts,14);
  assert.equal(report.authListComplete,true);
  assert.equal(report.firestoreHttpStatus,403);
  assert.equal(report.readyForCutover,false);
  assert.ok(requests.every(x=>x.options.method==='GET'));
  assert.ok(!JSON.stringify(report).includes('NEVER_LOG_UID'));
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
  assert.equal(report.identityConfigHttpStatus,null);
  assert.equal(report.requiresFirestoreReadPermission,true);
  assert.equal(report.requiresFirebaseAuthReadPermission,true);
  assert.equal(report.operationalRuntimeHttpStatus,null);
  assert.equal(report.operationalRuntimeReconciled,false);
  assert.deepEqual(report.blockingCodes,[
    'FIRESTORE_OIDC_DENIED','RUNTIME_AUDITS_AWAIT_SNAPSHOT',
    'AUTH_LIST_UNAVAILABLE','CLOUD_ROLE_E2E_PENDING',
  ]);
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

test('HTTP 400 Auth response triggers only fixed numeric-project alias, reports IAM 403 accurately',async()=>{
  const calls=[];
  const number='https://identitytoolkit.googleapis.com/v1/projects/477785088395/accounts:batchGet?maxResults=1000';
  const report=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      calls.push({url,options});
      if(url===AUTH)return new Response('PRIVATE_AUTH_400',{status:400});
      if(url===number)return new Response('PRIVATE_AUTH_403',{status:403});
      return new Response('PRIVATE_FIRESTORE_403',{status:403});
    },
  });
  assert.equal(report.authHttpStatus,400);
  assert.equal(report.authProjectNumberHttpStatus,403);
  assert.equal(report.identityConfigHttpStatus,403);
  assert.equal(report.requiresFirebaseAuthReadPermission,true);
  assert.equal(report.firestoreHttpStatus,403);
  assert.equal(report.readyForCutover,false);
  assert.equal(calls.length,4);
  assert.ok(calls.every(x=>x.options.method==='GET'));
  assert.ok(calls.some(x=>x.url===AUTH_CONFIG));
  const text=JSON.stringify(report);
  for(const x of ['PRIVATE_AUTH_400','PRIVATE_AUTH_403','PRIVATE_FIRESTORE_403',
    'EPHEMERAL_TEST_TOKEN_SECRET'])
    assert.ok(!text.includes(x));
});

test('numeric alias may return aggregate users without exposing identifiers',async()=>{
  const num='https://identitytoolkit.googleapis.com/v1/projects/477785088395/accounts:batchGet?maxResults=1000';
  const f=fixture();
  f.d.delete(AUTH);
  const oldFetch=f.requests;
  const report=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      oldFetch.push({url,options});
      if(url===AUTH)return new Response('',{status:400});
      if(url===num)return Response.json({users:[
        {localId:'PRIVATE_USER_A',disabled:true},
        {localId:'PRIVATE_USER_B',disabled:false},
      ]});
      const value=f.d.get(url);
      return new Response(JSON.stringify(value??{}),{status:value?200:404});
    },
  });
  assert.equal(report.authHttpStatus,200);
  assert.equal(report.authProjectNumberHttpStatus,200);
  assert.equal(report.identityConfigHttpStatus,null);
  assert.equal(report.accounts,2);
  assert.equal(report.disabledAccounts,1);
  assert.equal(report.readyForCutover,false);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_USER_A'));
});


test('Auth 400 with valid config 200 remains inconclusive, never grants or exposes data',async()=>{
  const requests=[];
  const authNumber='https://identitytoolkit.googleapis.com/v1/projects/477785088395/accounts:batchGet?maxResults=1000';
  const secrets=['SENSITIVE_GOOGLE_ERROR_MESSAGE','PRIVATE_CONFIG_CLIENT_ID',
    'PRIVATE_CONFIG_PROVIDER_KEYS','PERSON_EMAIL_123'];
  const response=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      requests.push({url,options});
      if(url===AUTH||url===authNumber)return Response.json({
        error:{code:400,status:'INVALID_ARGUMENT',message:secrets[0],
          details:[{uid:secrets[3]}]},
      },{status:400});
      if(url===AUTH_CONFIG)return Response.json({
        name:'projects/cormyr/config',
        client:{clientId:secrets[1]},
        signIn:{allowDuplicateEmails:true,providerConfig:secrets[2]},
      });
      return new Response('PRIVATE_FIRESTORE_DETAIL',{status:403});
    },
  });
  assert.equal(response.authHttpStatus,400);
  assert.equal(response.authProjectNumberHttpStatus,400);
  assert.equal(response.authRpcStatus,'INVALID_ARGUMENT');
  assert.equal(response.authProjectNumberRpcStatus,'INVALID_ARGUMENT');
  assert.equal(response.identityConfigHttpStatus,200);
  assert.equal(response.requiresFirebaseAuthReadPermission,false);
  assert.equal(response.authListComplete,false);
  assert.equal(response.accounts,null);
  assert.equal(response.disabledAccounts,null);
  assert.equal(response.readyForCutover,false);
  assert.equal(response.writes,0);
  assert.equal(requests.length,4);
  assert.ok(requests.every(x=>x.options.method==='GET'));
  const out=JSON.stringify(response);
  for(const secret of [...secrets,'EPHEMERAL_TEST_TOKEN_SECRET']){
    assert.ok(!out.includes(secret));
  }
});
test('Auth status whitelist rejects arbitrary RPC field and avoids config JSON decoding',async()=>{
  let bodyCalled=false;
  const report=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      assert.equal(options.method,'GET');
      if(url===AUTH||url.includes('477785088395/accounts:batchGet'))
        return Response.json({error:{
          status:'SECRET_UID_LEAK',message:'NEVER_PUBLIC_EMAIL',
        }},{status:400});
      if(url===AUTH_CONFIG)return {
        status:200,
        json:async()=>{bodyCalled=true;throw Error('private config decoded');},
      };
      return new Response('',{status:403});
    },
  });
  assert.equal(report.authRpcStatus,null);
  assert.equal(report.authProjectNumberRpcStatus,null);
  assert.equal(report.identityConfigHttpStatus,200);
  assert.equal(bodyCalled,false);
  assert.equal(report.readyForCutover,false);
  assert.ok(!JSON.stringify(report).includes('NEVER_PUBLIC_EMAIL'));
});
test('Auth config probe is not attempted for Auth 403 or 200',async()=>{
  for(const code of [200,403]){
    let configCalled=false;
    const report=await inspectFirebaseCloudReadiness({
      tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
      fetcher:async(url)=>{
        if(url===AUTH_CONFIG)configCalled=true;
        if(url===AUTH)return code===200
          ?Response.json({users:[]}):
          Response.json({error:{status:'PERMISSION_DENIED',
            message:'NOT_FOR_LOGS'}},{status:403});
        return new Response('',{status:403});
      },
    });
    assert.equal(configCalled,false);
    assert.equal(report.identityConfigHttpStatus,null);
    if(code===403)assert.equal(report.authRpcStatus,'PERMISSION_DENIED');
    else assert.equal(report.authRpcStatus,null);
    assert.equal(report.readyForCutover,false);
  }
});


test('operational Cloud runtime missing or unreconciled blocks GO without disclosing flags',async()=>{
  for(const replacement of [
    {fields:{...fields('active'),sourceSnapshotId:{stringValue:HASH},
      sourceSnapshotReconciled:{booleanValue:false},
      applicationEnabled:{booleanValue:true},
      calendarVersion:{integerValue:'2'}}},
    {fields:{...fields('active'),sourceSnapshotId:{stringValue:'b'.repeat(64)},
      sourceSnapshotReconciled:{booleanValue:true},
      applicationEnabled:{booleanValue:true},
      calendarVersion:{integerValue:'2'}}},
    {fields:{...fields('active'),sourceSnapshotId:{stringValue:HASH},
      sourceSnapshotReconciled:{booleanValue:true},
      applicationEnabled:{booleanValue:true},
      calendarVersion:{integerValue:'0'}}},
  ]){
    const f=fixture({[operational]:replacement});
    const report=await f.run();
    assert.equal(report.operationalRuntimeHttpStatus,200);
    assert.equal(report.operationalRuntimeReconciled,false);
    assert.ok(report.blockingCodes.includes('OPERATIONAL_RUNTIME_UNVERIFIED'));
    assert.equal(report.releaseDecision,'NO_GO');
    assert.equal(report.readyForCutover,false);
    assert.ok(!JSON.stringify(report).includes(HASH));
  }
});

test('Firestore runtime read 403 stays pending even if historic snapshot and Auth are valid',async()=>{
  const f=fixture();
  const report=await inspectFirebaseCloudReadiness({
    tokenProvider:async()=> 'EPHEMERAL_TEST_TOKEN_SECRET',
    fetcher:async(url,options)=>{
      assert.equal(options.method,'GET');
      if(url===operational)return new Response('SECRET_ERROR_BODY',{status:403});
      const value=f.d.get(url);
      return value===undefined?new Response('',{status:404}):Response.json(value);
    },
  });
  assert.equal(report.singleVerifiedSnapshot,true);
  assert.equal(report.operationalRuntimeHttpStatus,403);
  assert.equal(report.operationalRuntimeReconciled,false);
  assert.equal(report.authListComplete,true);
  assert.equal(report.requiresFirestoreReadPermission,true);
  assert.ok(report.blockingCodes.includes('OPERATIONAL_RUNTIME_UNVERIFIED'));
  assert.equal(report.readyForCutover,false);
  assert.ok(!JSON.stringify(report).includes('SECRET_ERROR_BODY'));
});

test('a successful probe with all synthetic gates still cannot approve real cutover',async()=>{
  const f=fixture();
  const report=await f.run();
  assert.equal(report.singleVerifiedSnapshot,true);
  assert.equal(report.mailRuntimeEnabled,true);
  assert.equal(report.operationalRuntimeReconciled,true);
  assert.equal(report.authListComplete,true);
  assert.equal(report.cloudRoleE2EVerified,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.deepEqual(report.blockingCodes,['CLOUD_ROLE_E2E_PENDING']);
});

test('GitHub Actions summary is deterministic NO-GO and discards untrusted strings',async()=>{
  const f=fixture();
  const report=await f.run();
  const summary=formatCloudReadinessSummary(report);
  assert.match(summary,/NO-GO para cutover/);
  assert.match(summary,/NÃO AUTORIZADO/);
  assert.match(summary,/Runtime operacional das Casas \| HTTP 200/);
  assert.match(summary,/CLOUD_ROLE_E2E_PENDING/);
  for(const sensitive of ['EPHEMERAL_TEST_TOKEN_SECRET',HASH,
    'DO_NOT_LOG_UID','private@example.org']){
    assert.ok(!summary.includes(sensitive));
  }
  const tainted=formatCloudReadinessSummary({
    firestoreHttpStatus:'INJECTED_PRIVATE_EMAIL',
    authHttpStatus:'INJECTED_TOKEN',
    blockingCodes:['INJECTED_UID','FIRESTORE_OIDC_DENIED'],
  });
  assert.ok(!tainted.includes('INJECTED_'));
  assert.match(tainted,/FIRESTORE_OIDC_DENIED/);
  assert.match(tainted,/NÃO AUTORIZADO/);
});
