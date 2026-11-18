import test from 'node:test';
import assert from 'node:assert/strict';
import {requestExactAppHostingRollout,classifyAppHostingDenial,inspectAppHostingBuildDenial} from './apphosting-protected-direct-api.mjs';

const sha='a'.repeat(40);
const runId='44382536371';
const backend='projects/cormyr/locations/us-east4/backends/cormyr-preview';
const build=backend+'/builds/gh-'+sha.slice(0,12)+'-'+runId;
const inputs=(changes={})=>({sha,runId,accessToken:'test-token-example-not-real',
  wait:async()=>{},...changes});

function mock({
  trafficStatus=200,branch='main',disabled=false,createStatus=200,
  buildStatus=200,observedSha=sha,buildState='BUILDING',
  rolloutStatus=200,
}={}){
  const requests=[];
  const fetcher=async(url,options)=>{
    requests.push({url,method:options.method,body:options.body,
      authorization:options.headers.Authorization});
    assert.ok(url.startsWith('https://firebaseapphosting.googleapis.com/v1/'));
    if(url.endsWith(backend+'/traffic'))return Response.json({
      rolloutPolicy:{codebaseBranch:branch,disabled},
    },{status:trafficStatus});
    if(url.includes('/builds?'))return Response.json(
      {name:'projects/cormyr/locations/us-east4/operations/build-created'},
      {status:createStatus});
    if(url.endsWith('/builds/gh-'+sha.slice(0,12)+'-'+runId))
      return Response.json({source:{codebase:{commit:observedSha}},
        state:buildState},{status:buildStatus});
    if(url.includes('/rollouts?'))return Response.json(
      {name:'projects/cormyr/locations/us-east4/operations/rollout-created'},
      {status:rolloutStatus});
    throw Error('unexpected API URL');
  };
  return {fetcher,requests};
}
test('requests exact Git SHA and backend, but never marks traffic served',async()=>{
  const f=mock();
  const r=await requestExactAppHostingRollout(inputs({fetcher:f.fetcher}));
  assert.equal(r.rolloutRequested,true);
  assert.equal(r.servedCommitVerified,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.equal(r.firestoreWrites,0);
  assert.equal(r.firebaseAuthWrites,0);
  assert.deepEqual(f.requests.map(x=>x.method),['GET','POST','GET','POST']);
  assert.ok(f.requests[1].url.endsWith('/builds?buildId=gh-'+sha.slice(0,12)+'-'+runId));
  assert.deepEqual(JSON.parse(f.requests[1].body),{source:{codebase:{commit:sha}}});
  assert.deepEqual(JSON.parse(f.requests[3].body),{build});
  assert.ok(!JSON.stringify(r).includes('test-token-example'));
});
test('unverified identity or SHAs abort before HTTP',async()=>{
  const f=mock();
  for(const change of [
    {sha:'bad'},{runId:'1'},{accessToken:''},
    {accessToken:'a'},{fetcher:null},
  ]){
    await assert.rejects(requestExactAppHostingRollout(inputs({...change,
      fetcher:change.fetcher===null?null:f.fetcher})),/apphosting_direct_invalid_invocation/);
  }
  assert.equal(f.requests.length,0);
});
test('IAM, incorrect backend branch and disabled rollout stop before any Cloud POST',async()=>{
  for(const opt of [{trafficStatus:403},{branch:'other'},{disabled:true}]){
    const f=mock(opt);
    await assert.rejects(requestExactAppHostingRollout(inputs({fetcher:f.fetcher})),
      /apphosting_direct_/);
    assert.deepEqual(f.requests.map(x=>x.method),['GET']);
  }
});
test('wrong source, unavailable build and forbidden create never issue rollout',async()=>{
  for(const opt of [
    {observedSha:'b'.repeat(40)},{buildState:'FAILED'},
    {buildStatus:403},{createStatus:403},
  ]){
    const f=mock(opt);
    await assert.rejects(requestExactAppHostingRollout(inputs({fetcher:f.fetcher})),
      /apphosting_direct_/);
    assert.ok(f.requests.every(x=>!x.url.includes('/rollouts?')));
  }
});
test('rollout IAM denial never appears as a successful request',async()=>{
  const f=mock({rolloutStatus:403});
  await assert.rejects(requestExactAppHostingRollout(inputs({fetcher:f.fetcher})),
    /apphosting_direct_rollout_create_http_403/);
});
test('existing matching build can be reused without accepting a different SHA',async()=>{
  const f=mock({createStatus:409});
  const r=await requestExactAppHostingRollout(inputs({fetcher:f.fetcher}));
  assert.equal(r.rolloutRequested,true);
  assert.deepEqual(f.requests.map(x=>x.method),['GET','POST','GET','POST']);
});

test('HTTP 403 exposes only allowlisted structured Google RPC reasons',async()=>{
  const denied={
    error:{status:'PERMISSION_DENIED',
      message:'PRIVATE_USER_OR_RESOURCE_SHOULD_NOT_BE_LOGGED',
      details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',
        reason:'IAM_PERMISSION_DENIED',
        metadata:{permission:'PRIVATE_PERMISSION_DETAIL',consumer:'PRIVATE_PROJECT'}}]},
  };
  assert.equal(classifyAppHostingDenial(denied,403),'iam_permission_denied');
  assert.equal(classifyAppHostingDenial(denied,500),null);
  assert.equal(classifyAppHostingDenial({error:{status:'PERMISSION_DENIED',
    details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',
      reason:'PRIVATE_UNTRUSTED_REASON'}]}},403),'permission_denied_unspecified');
  const requests=[];
  const fetcher=async(url,options)=>{
    requests.push({url,method:options.method});
    if(url.endsWith('/traffic'))return Response.json({
      rolloutPolicy:{codebaseBranch:'main',disabled:false},
    });
    return Response.json(denied,{status:403});
  };
  let message='';
  try{await requestExactAppHostingRollout(inputs({fetcher}));}
  catch(e){message=e.message;}
  assert.equal(message,'apphosting_direct_build_create_http_403_iam_permission_denied');
  assert.deepEqual(requests.map(x=>x.method),['GET','POST']);
  for(const privateValue of ['PRIVATE_USER','PRIVATE_PERMISSION','PRIVATE_PROJECT'])
    assert.ok(!message.includes(privateValue));
});

test('unstructured or unfamiliar denied reasons fail closed without provider data',async()=>{
  for(const value of [
    {error:{status:'PERMISSION_DENIED',details:[{'@type':
      'type.googleapis.com/google.rpc.ErrorInfo',reason:'PRIVATE_REASON'}]}},
    {error:{status:'PERMISSION_DENIED',message:'PRIVATE_EMAIL'}},
    {error:{status:'UNKNOWN',message:'PRIVATE_EMAIL'}},
    {private:'PRIVATE_EMAIL'},
  ]){
    const reason=classifyAppHostingDenial(value,403);
    assert.ok(reason===null||reason==='permission_denied_unspecified');
    assert.ok(!String(reason).includes('PRIVATE'));
  }
});

test('Cloud Audit Logs query is fixed read-only scope and exposes only denied permission flags',async()=>{
  const calls=[],source={
    entries:[{
      insertId:'PRIVATE_LOG_ID',resource:{labels:{project_id:'PRIVATE_PROJECT'}},
      protoPayload:{serviceName:'firebaseapphosting.googleapis.com',
        status:{code:7,message:'PRIVATE_PROVIDER_ERROR'},
        authenticationInfo:{principalEmail:'PRIVATE_EMAIL'},
        authorizationInfo:[
          {permission:'firebaseapphosting.builds.create',granted:false,
            resource:'PRIVATE_RESOURCE'},
          {permission:'untrusted.private.access',granted:false},
          {permission:'cloudbuild.builds.create',granted:true},
        ],
      },
    }],
  };
  const fetcher=async(url,options)=>{
    calls.push({url,method:options.method,headers:options.headers,
      request:JSON.parse(options.body)});
    return Response.json(source);
  };
  const result=await inspectAppHostingBuildDenial({
    accessToken:'synthetic-auth-token',fetcher,
    now:new Date('2026-11-18T21:00:00.000Z'),
  });
  assert.deepEqual(calls.map(c=>[c.url,c.method]),[
    ['https://logging.googleapis.com/v2/entries:list','POST']]);
  assert.deepEqual(calls[0].request.resourceNames,['projects/cormyr']);
  assert.equal(calls[0].request.pageSize,20);
  assert.ok(calls[0].request.filter.includes('2026-11-18T20:50:00.000Z'));
  assert.equal(result.auditHttpStatus,200);
  assert.equal(result.auditEvidenceFound,true);
  assert.deepEqual(result.matchingDeniedPermissions,
    ['firebaseapphosting.builds.create']);
  assert.equal(result.cloudWrites,0);
  const output=JSON.stringify(result);
  for(const secret of ['PRIVATE','synthetic-auth-token','untrusted.private'])
    assert.ok(!output.includes(secret));
});

test('Cloud Audit Logs reader fails closed for denied, unavailable or malformed audit',async()=>{
  for(const response of [
    Response.json({error:{message:'PRIVATE_ERROR'}},{status:403}),
    Response.json({entries:[{protoPayload:{
      serviceName:'other.googleapis.com',status:{code:7},
      authorizationInfo:[{permission:'firebaseapphosting.builds.create',granted:false}],
    }}]}),
    Response.json({entries:[{protoPayload:{
      serviceName:'firebaseapphosting.googleapis.com',status:{code:0},
      authorizationInfo:[{permission:'firebaseapphosting.builds.create',granted:false}],
    }}]}),
    Response.json({entries:'PRIVATE_INVALID'}),
  ]){
    const report=await inspectAppHostingBuildDenial({
      accessToken:'synthetic-auth-token',fetcher:async()=>response,
    });
    assert.deepEqual(report.matchingDeniedPermissions,[]);
    assert.ok(!JSON.stringify(report).includes('PRIVATE'));
    assert.equal(report.cloudWrites,0);
  }
  const missing=await inspectAppHostingBuildDenial({accessToken:'bad',
    fetcher:async()=>{throw Error('unexpected network request');}});
  assert.equal(missing.auditHttpStatus,null);
  assert.equal(missing.auditEvidenceFound,false);
});
