import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPHOSTING_API,inspectAppHostingReadOnly,classifyServingRevision,classifyTrafficSplit,
  observeServingRevision,
  validatedServingBuildPath,AUDITED_PROJECT_NUMBER,
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
    'KNOWN_PROJECT_NUMBER_ALIAS');
  assert.equal(classifyTrafficSplit({percent:0,build:'build-12'},p).buildRefShape,
    'SHORT_BUILD_ID');
});

test('numeric project resource alias selects only the same Cormyr backend build',async()=>{
  const numericBuild='projects/'+AUDITED_PROJECT_NUMBER+
    '/locations/us-east4/backends/cormyr-preview/builds/build-12';
  const values={
    ...fixture,
    [p+'/traffic']:{
      ...fixture[p+'/traffic'],
      current:{splits:[{build:numericBuild,percent:100}]},
    },
  };
  const requested=[];
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async url=>{
      requested.push(url);
      const data=values[url.slice((APPHOSTING_API+'/').length)];
      return new Response(JSON.stringify(data??{}),{status:data?200:404});
    },
  });
  assert.equal(report.backends[0].splitDiagnostics[0].buildRefShape,
    'KNOWN_PROJECT_NUMBER_ALIAS');
  assert.equal(report.backends[0].servingBuildSelected,true);
  assert.equal(report.domainServingCommit,SHA);
  assert.equal(report.auditComplete,true);
  assert.equal(classifyServingRevision(report,SHA).comparison,'MATCH');
  assert.ok(requested.includes(APPHOSTING_API+'/'+p+'/builds/build-12'));
  assert.ok(requested.every(url=>url.startsWith(APPHOSTING_API+'/projects/cormyr/')));
});

test('unrecognized project number or different backend is not silently trusted',()=>{
  const invalid=[
    'projects/123456789/locations/us-east4/backends/cormyr-preview/builds/build-12',
    'projects/'+AUDITED_PROJECT_NUMBER+'/locations/us-central1/backends/cormyr-preview/builds/build-12',
    'projects/'+AUDITED_PROJECT_NUMBER+'/locations/us-east4/backends/another-backend/builds/build-12',
    'projects/'+AUDITED_PROJECT_NUMBER+'/locations/us-east4/backends/cormyr-preview/builds/../../secrets',
    'projects/'+AUDITED_PROJECT_NUMBER+'/locations/us-east4/backends/cormyr-preview/builds/build-12?token=hidden',
  ];
  for(const resource of invalid)
    assert.equal(validatedServingBuildPath(resource,p),null);
});

test('failed rollout diagnosis reports only safe build state and numeric error code',async()=>{
  const failedBuild=p+'/builds/build-failure';
  const secret='SERVICE_SECRET_DONT_PRINT';
  const values={
    ...fixture,
    [p+'/rollouts?pageSize=20']:{rollouts:[
      {state:'FAILED',build:failedBuild,createTime:'2026-11-16T10:00:00Z',
        error:{code:9,message:secret}},
      {state:'SUCCEEDED',build:p+'/builds/build-12',createTime:'2026-11-15T10:00:00Z'}
    ]},
    [failedBuild]:{
      state:'FAILED',source:{codebase:{hash:'b'.repeat(40)}},
      errors:[{errorSource:'CLOUD_BUILD',error:{message:secret}}],
    },
  };
  const requests=[];
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async(url,options)=>{
      requests.push({url,method:options.method});
      const value=values[url.slice((APPHOSTING_API+'/').length)];
      return new Response(JSON.stringify(value??{}),{status:value?200:404});
    },
  });
  assert.equal(report.domainServingCommit,SHA);
  assert.equal(report.backends[0].recentRollouts[0].rolloutState,'FAILED');
  assert.equal(report.backends[0].recentRollouts[0].buildState,'FAILED');
  assert.equal(report.backends[0].recentRollouts[0].rolloutErrorCode,9);
  assert.equal(report.backends[0].recentRollouts[0].buildErrorSource,'CLOUD_BUILD');
  assert.equal(report.backends[0].recentRollouts[0].buildCommit,'b'.repeat(40));
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(requests.every(x=>x.method==='GET'&&
    x.url.startsWith(APPHOSTING_API+'/projects/cormyr/')));
});

test('failed App Hosting builds are visible when no rollout exists',async()=>{
  const secret='DO_NOT_PRINT_BUILD_EXCEPTION_SECRET';
  const failed=p+'/builds/build-new-failure';
  const values={
    ...fixture,
    [p+'/builds?pageSize=20']:{builds:[
      {name:failed,state:'FAILED',createTime:'2026-11-16T10:11:00Z',
        source:{codebase:{hash:'c'.repeat(40)}},
        errors:[{errorSource:'CLOUD_BUILD',
          error:{code:13,message:secret,details:[secret]}}]},
      {name:p+'/builds/build-12',state:'READY',
        createTime:'2026-11-15T10:11:00Z',source:{codebase:{hash:SHA}}},
      {name:'projects/other/locations/us-east4/backends/bad/builds/evil',
        state:'FAILED',errors:[{error:{message:secret}}]},
    ]},
  };
  const calls=[];
  const report=await inspectAppHostingReadOnly({
    tokenProvider:async()=> 'ephemeral-only-token',
    fetcher:async(url,options)=>{
      calls.push({url,method:options.method});
      const v=values[url.slice((APPHOSTING_API+'/').length)];
      return new Response(JSON.stringify(v??{}),{status:v?200:404});
    },
  });
  const backend=report.backends[0];
  assert.equal(backend.buildsReadable,true);
  assert.equal(backend.buildsHttpStatus,200);
  assert.equal(backend.recentBuilds.length,2);
  assert.equal(backend.recentBuilds[0].state,'FAILED');
  assert.equal(backend.recentBuilds[0].errorSource,'CLOUD_BUILD');
  assert.equal(backend.recentBuilds[0].errorCode,13);
  assert.equal(backend.recentBuilds[0].sourceCommit,'c'.repeat(40));
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(calls.every(x=>x.method==='GET'&&
    x.url.startsWith(APPHOSTING_API+'/projects/cormyr/')));
});


const servingFixture=(hash,{
  complete=true,rolloutsEnabled=true,branch='main',permissions=false,
}={})=>({
  auditComplete:complete,
  matchingBackends:1,
  domainServingCommit:hash,
  readPermissionRequired:permissions,
  backends:[{
    domainAttached:true,
    liveBranch:branch,
    automaticRolloutsEnabled:rolloutsEnabled,
  }],
  cloudDataMigratedVerified:false,
  readyForCutover:false,
  cloudWrites:0,
});

test('bounded App Hosting observation confirms only an actually serving expected SHA',async()=>{
  const requested=[];
  const waits=[];
  const expected='f'.repeat(40);
  const served=['a'.repeat(40),'b'.repeat(40),expected];
  const result=await observeServingRevision({
    expectedSha:expected,
    inspect:async()=>{
      const r=servingFixture(served[requested.length]);
      requested.push(r);
      return r;
    },
    pause:async ms=>{waits.push(ms);},
  });
  assert.equal(result.observation.attempts,3);
  assert.deepEqual(waits,[20_000,20_000]);
  assert.equal(requested.length,3);
  assert.equal(result.report.domainServingCommit,expected);
  assert.equal(result.observation.comparison,'MATCH');
  assert.equal(result.observation.stopReason,'MATCH_OBSERVED');
  assert.equal(result.observation.matchingCommitObserved,true);
  assert.equal(result.observation.readyForCutover,false);
  assert.equal(result.observation.cloudDataMigratedVerified,false);
  assert.equal(result.observation.writes,0);
});

test('a stale revision never becomes a verified deployment by retrying',async()=>{
  let reads=0;
  let waits=0;
  const output=await observeServingRevision({
    expectedSha:'b'.repeat(40),maxAttempts:4,intervalMs:0,
    inspect:async()=>{reads++;return servingFixture('a'.repeat(40));},
    pause:async ms=>{assert.equal(ms,0);waits++;},
  });
  assert.equal(reads,4);
  assert.equal(waits,3);
  assert.equal(output.observation.attempts,4);
  assert.equal(output.observation.stopReason,'OBSERVATION_WINDOW_EXHAUSTED');
  assert.equal(output.observation.comparison,'NOT_YET_MATCHING');
  assert.equal(output.observation.matchingCommitObserved,false);
  assert.equal(output.report.domainServingCommit,'a'.repeat(40));
  assert.equal(output.observation.readyForCutover,false);
});

test('disabled rollouts and wrong source branch stop after one GET-only audit',async()=>{
  for(const cfg of [
    {rolloutsEnabled:false,branch:'main',
      reason:'AUTOMATIC_ROLLOUT_DISABLED_OR_UNCONFIRMED'},
    {rolloutsEnabled:true,branch:'staging',
      reason:'BRANCH_NOT_MAIN_OR_UNCONFIRMED'},
    {rolloutsEnabled:null,branch:'main',
      reason:'AUTOMATIC_ROLLOUT_DISABLED_OR_UNCONFIRMED'},
  ]){
    let reads=0;
    let sleeps=0;
    const output=await observeServingRevision({
      expectedSha:'b'.repeat(40),
      inspect:async()=>{reads++;return servingFixture('a'.repeat(40),cfg);},
      pause:async()=>{sleeps++;},
    });
    assert.equal(reads,1);
    assert.equal(sleeps,0);
    assert.equal(output.observation.stopReason,cfg.reason);
    assert.equal(output.observation.readyForCutover,false);
  }
});

test('unknown backend, denied IAM and invalid expected SHA do not trigger retry',async()=>{
  const examples=[
    {report:{auditComplete:false,matchingBackends:0,backends:[],
      domainServingCommit:null,readPermissionRequired:false},
      expected:'a'.repeat(40),reason:'SERVING_BACKEND_UNCONFIRMED'},
    {report:servingFixture('a'.repeat(40),{permissions:true}),
      expected:'b'.repeat(40),reason:'READ_PERMISSION_REQUIRED'},
    {report:servingFixture('a'.repeat(40)),
      expected:'not-a-sha',reason:'NO_EXPECTED_COMMIT'},
  ];
  for(const {report,expected,reason} of examples){
    let reads=0;
    const output=await observeServingRevision({
      expectedSha:expected,
      inspect:async()=>{reads++;return report;},
      pause:async()=>{throw Error('unexpected repeated audit');},
    });
    assert.equal(reads,1);
    assert.equal(output.observation.attempts,1);
    assert.equal(output.observation.stopReason,reason);
    assert.equal(output.observation.matchingCommitObserved,false);
  }
});

test('transient unresolved serving build can be polled only for a known main backend',async()=>{
  const incomplete=servingFixture(null,{complete:false});
  let reads=0;
  const output=await observeServingRevision({
    expectedSha:'c'.repeat(40),intervalMs:0,
    inspect:async()=>{reads++;return reads===1?incomplete:
      servingFixture('c'.repeat(40));},
    pause:async()=>{},
  });
  assert.equal(output.observation.attempts,2);
  assert.equal(output.observation.matchingCommitObserved,true);
  assert.equal(output.observation.stopReason,'MATCH_OBSERVED');
});

test('bounded poll options reject unbounded or malformed intervals',async()=>{
  for(const opts of [
    {maxAttempts:0},{maxAttempts:17},{maxAttempts:2.5},
    {intervalMs:-1},{intervalMs:30_001},{intervalMs:Infinity},
    {inspect:null},{pause:null},
  ]){
    await assert.rejects(()=>observeServingRevision({
      ...opts,expectedSha:SHA,inspect:opts.inspect??(opts.inspect===null?null:
        async()=>servingFixture(SHA)),
      pause:opts.pause??(opts.pause===null?null:async()=>{}),
    }),/invalid_revision_observation_options/);
  }
});


test('extended convergence remains bounded and does not treat stale build as release',async()=>{
  const served='a'.repeat(40);
  const expected='b'.repeat(40);
  let inspections=0,sleeps=0;
  const result=await observeServingRevision({
    expectedSha:expected,maxAttempts:16,intervalMs:0,
    inspect:async()=>{inspections++;return servingFixture(served);},
    pause:async()=>{sleeps++;},
  });
  assert.equal(inspections,16);
  assert.equal(sleeps,15);
  assert.equal(result.observation.matchingCommitObserved,false);
  assert.equal(result.observation.stopReason,'OBSERVATION_WINDOW_EXHAUSTED');
  assert.equal(result.observation.readyForCutover,false);
  assert.equal(result.observation.writes,0);
});
