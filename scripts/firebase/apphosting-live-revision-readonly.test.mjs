import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPHOSTING_API,inspectAppHostingReadOnly,classifyServingRevision,classifyTrafficSplit,
} from './apphosting-live-revision-readonly.mjs';

const SHA='a'.repeat(40);
const p='projects/cormyr/locations/us-east4/backends/cormyr-preview';
const fixture=Object.freeze({
  [`${p}/domains?pageSize=100`]:{domains:[{
    name:`${p}/domains/atlas.cormyr.com.br`,disabled:false,
  }]},
  [`${p}/traffic`]:{current:{splits:[{build:`${p}/builds/build-12`,percent:100}]},
    rolloutPolicy:{disabled:false,codebaseBranch:'main'}},
  [`${p}/rollouts?pageSize=20`]:{
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
  assert.equal(report.backends[0].rolloutsHttpStatus,200);
  assert.equal(report.backends[0].servingBuildHttpStatus,200);
  assert.equal(report.backends[0].servingBuildSelected,true);
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

test('an empty region (no backends property) is valid; numeric build IDs are supported',async()=>{
  const numericalBuild=`${p}/builds/123e4567-e89b-12d3-a456-426614174000`;
  const values={
    ...fixture,
    [`${p}/traffic`]:{
      current:{splits:[{build:numericalBuild,percent:100}]},
      rolloutPolicy:{disabled:true,codebaseBranch:'main'},
    },
    [numericalBuild]:{state:'READY',source:{codebase:{hash:SHA}}},
    ['projects/cormyr/locations/us-central1/backends?pageSize=40']:{},
  };
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      const data=values[url.slice((APPHOSTING_API+'/').length)];
      return new Response(JSON.stringify(data??{}),{status:data?200:404});
    },
  });
  assert.equal(report.auditComplete,true);
  assert.equal(report.locations[1].incomplete,undefined);
  assert.equal(report.matchingBackends,1);
  assert.equal(report.domainServingCommit,SHA);
  assert.equal(report.backends[0].automaticRolloutsEnabled,false);
  assert.equal(report.backends[0].servingBuildHttpStatus,200);
});

test('rollout list HTTP 400 is not mislabeled an IAM denial; serving traffic remains independently verifiable',async()=>{
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      if(url.includes('/rollouts?'))return new Response('unsupported filter',{status:400});
      const key=url.slice((APPHOSTING_API+'/').length);
      return Response.json(fixture[key]??{});
    },
  });
  assert.equal(report.auditComplete,false);
  assert.equal(report.readPermissionRequired,false);
  assert.equal(report.backends[0].rolloutsHttpStatus,400);
  assert.equal(report.domainServingCommit,SHA);
  assert.equal(report.backends[0].servingBuildSelected,true);
});

test('permission denial on rollouts is separately visible and never leaks response body',async()=>{
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      if(url.includes('/rollouts?'))return new Response('PRIVATE_ACCESS_DETAIL',{status:403});
      const key=url.slice((APPHOSTING_API+'/').length);
      return Response.json(fixture[key]??{});
    },
  });
  assert.equal(report.auditComplete,false);
  assert.equal(report.readPermissionRequired,true);
  assert.equal(report.backends[0].rolloutsHttpStatus,403);
  assert.equal(report.domainServingCommit,SHA);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_ACCESS_DETAIL'));
});

test('observed traffic comparison never authorizes cutover or mistakes lag for success',()=>{
  const base={
    auditComplete:true,matchingBackends:1,domainServingCommit:SHA,
    readPermissionRequired:false,
    backends:[{domainAttached:true,liveBranch:'main',automaticRolloutsEnabled:true}],
  };
  assert.deepEqual(
    classifyServingRevision(base,SHA).comparison,'MATCH');
  assert.equal(
    classifyServingRevision(base,'b'.repeat(40)).comparison,'NOT_YET_MATCHING');
  assert.equal(
    classifyServingRevision(base,undefined).comparison,'NO_EXPECTED_COMMIT');
  const incomplete=classifyServingRevision({...base,auditComplete:false},SHA);
  assert.equal(incomplete.comparison,'INCONCLUSIVE');
  assert.equal(incomplete.readyForCutover,false);
  assert.equal(classifyServingRevision({
    ...base,matchingBackends:0,domainServingCommit:null,backends:[],
  },SHA).comparison,'INCONCLUSIVE');
});

test('Google REST canonical int64 string percent selects the live build',async()=>{
  const values={
    ...fixture,
    [p+'/traffic']:{
      ...fixture[p+'/traffic'],
      current:{splits:[{build:p+'/builds/build-12',percent:'100'}]},
    },
  };
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      const key=url.slice((APPHOSTING_API+'/').length);
      const data=values[key];
      return new Response(JSON.stringify(data??{}),{status:data?200:404});
    },
  });
  assert.equal(report.backends[0].servingBuildSelected,true);
  assert.equal(report.domainServingCommit,SHA);
  assert.equal(classifyServingRevision(report,SHA).comparison,'MATCH');
});

test('malformed percentage strings cannot claim a live 100 percent revision',async()=>{
  const values={
    ...fixture,
    [p+'/traffic']:{
      ...fixture[p+'/traffic'],
      current:{splits:[{build:p+'/builds/build-12',percent:'0100'}]},
    },
  };
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      const key=url.slice((APPHOSTING_API+'/').length);
      const data=values[key];
      return new Response(JSON.stringify(data??{}),{status:data?200:404});
    },
  });
  assert.equal(report.domainServingCommit,null);
  assert.equal(classifyServingRevision(report,SHA).comparison,'INCONCLUSIVE');
});

test('unresolved traffic cannot be marked an audited active commit',async()=>{
  const values={
    ...fixture,
    [p+'/traffic']:{
      ...fixture[p+'/traffic'],
      current:{splits:[{build:'builds/old-build',percent:100}]},
    },
  };
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      const data=values[url.slice((APPHOSTING_API+'/').length)];
      return new Response(JSON.stringify(data??{}),{status:data?200:404});
    },
  });
  assert.equal(report.backends[0].splitDiagnostics[0].buildRefShape,'RELATIVE_BUILD_RESOURCE');
  assert.equal(report.auditComplete,false);
  assert.equal(report.domainServingCommit,null);
  assert.equal(classifyServingRevision(report,SHA).comparison,'INCONCLUSIVE');
});

test('bounded traffic diagnostics expose only shapes, never raw references',()=>{
  const backend=p;
  const secretLike='https://private.invalid/?token=HIDDEN_VALUE';
  const report=classifyTrafficSplit({percent:'100',build:secretLike},backend);
  assert.deepEqual(report,{
    buildRefShape:'OTHER_OR_UNTRUSTED_REFERENCE',
    percentType:'string',
    percentClass:'ONE_HUNDRED',
  });
  assert.ok(!JSON.stringify(report).includes('HIDDEN_VALUE'));
  assert.equal(classifyTrafficSplit({percent:100,build:p+'/builds/build-12'},p).buildRefShape,
    'EXACT_BACKEND_RESOURCE');
  assert.equal(classifyTrafficSplit({percent:100,build:'projects/477785088395/locations/us-east4/backends/cormyr-preview/builds/build-12'},p).buildRefShape,
    'SAME_BACKEND_OTHER_PROJECT_ALIAS');
  assert.equal(classifyTrafficSplit({percent:0,build:'build-12'},p).buildRefShape,
    'SHORT_BUILD_ID');
});
