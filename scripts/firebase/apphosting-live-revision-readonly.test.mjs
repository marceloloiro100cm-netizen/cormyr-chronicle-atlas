import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPHOSTING_API,inspectAppHostingReadOnly,
} from './apphosting-live-revision-readonly.mjs';

const SHA='a'.repeat(40);
const p='projects/cormyr/locations/us-east4/backends/cormyr-preview';
const fixture=Object.freeze({
  [`${p}/domains?pageSize=100`]:{domains:[{
    name:`${p}/domains/atlas.cormyr.com.br`,disabled:false,
  }]},
  [`${p}/traffic`]:{current:{splits:[{build:`${p}/builds/build-12`,percent:100}]},
    rolloutPolicy:{disabled:false,codebaseBranch:'main'}},
  [`${p}/rollouts?pageSize=20&orderBy=createTime%20desc`]:{
    rollouts:[{state:'SUCCEEDED',build:`${p}/builds/build-12`}]},
  [`${p}/builds/build-12`]:{
    state:'READY',source:{codebase:{hash:SHA,author:{email:'private@example.com'}}}},
  'projects/cormyr/locations/us-east4/backends?pageSize=40':{
    backends:[{name:p}]},
  'projects/cormyr/locations/us-central1/backends?pageSize=40':{
    backends:[]},
});

test('actual traffic build determines Git revision; no private author data exposed',async()=>{
  const calls=[];
  const fetcher=async (url,options)=>{
    calls.push({url,options});
    const key=url.slice((APPHOSTING_API+'/').length);
    const data=fixture[key];
    return new Response(JSON.stringify(data??{}),{
      status:data?200:404,headers:{'content-type':'application/json'},
    });
  };
  const report=await inspectAppHostingReadOnly({tokenProvider:async()=> 'ephemeral-only-token',fetcher});
  assert.equal(report.matchingBackends,1);
  assert.equal(report.domainServingCommit,SHA);
  assert.equal(report.auditComplete,true);
  assert.equal(report.backends[0].automaticRolloutsEnabled,true);
  assert.equal(report.backends[0].liveBranch,'main');
  assert.equal(report.backends[0].latestRolloutState,'SUCCEEDED');
  assert.equal(report.readyForCutover,false);
  assert.equal(report.cloudWrites,0);
  assert.ok(!JSON.stringify(report).includes('private@example.com'));
  assert.ok(!JSON.stringify(report).includes('ephemeral-only-token'));
  assert.ok(calls.every(x=>x.url.startsWith(APPHOSTING_API+'/projects/cormyr/')&&
    x.options.method==='GET'&&x.options.redirect==='error'&&x.options.credentials==='omit'));
});

test('permission denied cannot be mistaken for a missing backend or ready rollout',async()=>{
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async()=>new Response('PRIVATE_PERMISSION_ERROR',{status:403}),
  });
  assert.equal(report.auditComplete,false);
  assert.equal(report.readPermissionRequired,true);
  assert.equal(report.matchingBackends,0);
  assert.equal(report.domainServingCommit,null);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_PERMISSION_ERROR'));
});

test('unexpected resource references cannot make the probe call arbitrary hosts',async()=>{
  const requests=[];
  const fetcher=async url=>{
    requests.push(url);
    if(url.endsWith('us-east4/backends?pageSize=40'))
      return Response.json({backends:[{name:'https://attacker.example/token'},
        {name:'projects/cormyr/locations/us-east4/backends/../../secret'}]});
    return Response.json({backends:[]});
  };
  const report=await inspectAppHostingReadOnly({tokenProvider:async()=> 'ephemeral-only-token',fetcher});
  assert.equal(report.backends.length,0);
  assert.equal(report.domainServingCommit,null);
  assert.equal(requests.length,2);
  assert.ok(requests.every(x=>x.startsWith(APPHOSTING_API+'/projects/cormyr/')));
});

test('truncated backend list is not treated as an exhaustive inventory',async()=>{
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>Response.json(url.includes('us-east4')?
      {backends:[{name:p}],nextPageToken:'more'}:{backends:[]}),
  });
  assert.equal(report.auditComplete,false);
  assert.equal(report.backends.length,0);
  assert.equal(report.locations[0].incomplete,true);
});
