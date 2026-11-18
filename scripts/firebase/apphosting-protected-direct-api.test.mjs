import test from 'node:test';
import assert from 'node:assert/strict';
import {requestExactAppHostingRollout} from './apphosting-protected-direct-api.mjs';

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
