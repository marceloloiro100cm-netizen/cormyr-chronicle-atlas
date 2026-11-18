import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectCloudReadonlyBoundaries,formatCloudReadonlyBoundarySummary,
  READ_ROUTES,CLOUD_ROUTES,CLOSED_ROUTES,ORIGIN,
} from './cloud-readonly-boundary-smoke.mjs';

const response=(status,error,headers={})=>new Response(
  JSON.stringify({error}),{
    status,headers:{'content-type':'application/json',
      'cache-control':'no-store, max-age=0',...headers},
  });
const safeCall=(options)=>{
  assert.equal(options.method,'POST');
  assert.equal(options.redirect,'manual');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,undefined);
  assert.equal(options.headers.Cookie,undefined);
  assert.equal(options.body,
    '{"action":"__cormyr_readonly_probe_invalid_action__"}');
};
test('four read-only, four gated Cloud and three closed legacy routes reject anonymous probes',async()=>{
  const calls=[];
  const report=await inspectCloudReadonlyBoundaries(async(url,options)=>{
    calls.push(url);safeCall(options);
    const read=READ_ROUTES.find(x=>ORIGIN+x[1]===url);
    const cloud=CLOUD_ROUTES.find(x=>ORIGIN+x[1]===url);
    return read?response(503,read[2]):
      cloud?response(503,cloud[2]):response(503,'legacy_backend_paused');
  });
  assert.deepEqual(calls,
    [...READ_ROUTES,...CLOUD_ROUTES,...CLOSED_ROUTES]
      .map(x=>ORIGIN+x[1]));
  assert.equal(report.requests,11);
  assert.equal(report.verified,true);
  assert.equal(report.readonlyRoutesReachOwnGuards,true);
  assert.equal(report.cloudPrivateRoutesProtected,true);
  assert.equal(report.legacyWritesBlocked,true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.writes,0);
  assert.match(formatCloudReadonlyBoundarySummary(report),/NÃO AUTORIZADA/);
});
test('when deployed read feature is enabled, authenticated guard 401 is accepted',async()=>{
  const r=await inspectCloudReadonlyBoundaries(async url=>
    [...READ_ROUTES,...CLOUD_ROUTES].some(x=>ORIGIN+x[1]===url)?
      response(401,'authentication_required'):
      response(503,'legacy_backend_paused'));
  assert.equal(r.verified,true);
  assert.equal(r.accountActivationVerified,false);
  assert.equal(r.realCloudRoleE2EVerified,false);
  assert.equal(r.cloudPrivateRoutesProtected,true);
});
test('Cloud mail, newspaper and treasury never accept a legacy or unexpected response',async()=>{
  for(const denied of [
    ()=>response(503,'legacy_backend_paused'),
    ()=>response(400,'invalid_action'),
    ()=>response(200,'PRIVATE_LETTER'),
    ()=>response(401,'other_authentication'),
    ()=>response(503,'wrong_feature_flag'),
  ]){
    const report=await inspectCloudReadonlyBoundaries(async url=>{
      const read=READ_ROUTES.find(x=>ORIGIN+x[1]===url);
      const cloud=CLOUD_ROUTES.find(x=>ORIGIN+x[1]===url);
      return read?response(503,read[2]):
        cloud&&cloud[0]==='firebaseCloudMail'?denied():
        cloud?response(503,cloud[2]):response(503,'legacy_backend_paused');
    });
    assert.equal(report.cloudPrivateRoutesProtected,false);
    assert.equal(report.verified,false);
    assert.equal(report.readyForPlayers,false);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_LETTER'));
  }
});
test('generic maintenance response cannot masquerade as the Firebase endpoint',async()=>{
  for(const wrong of [
    ()=>response(503,'legacy_backend_paused'),
    ()=>response(503,'firebase_cloud_read_disabled'),
    ()=>response(401,'unrelated_auth_error'),
    ()=>response(200,'PRIVATE_INFORMATION'),
    ()=>new Response('<html>maintenance</html>',{status:503,headers:{
      'cache-control':'no-store','content-type':'text/html'}}),
    ()=>response(503,'SECRET_PERSONAL_DETAILS'),
    ()=>response(503,'legacy_backend_paused',{'cache-control':'public'}),
    ()=>response(302,'legacy_backend_paused',{'location':'https://example.com'}),
  ]){
    const report=await inspectCloudReadonlyBoundaries(async(url)=>{
      const r=READ_ROUTES.find(x=>ORIGIN+x[1]===url);
      return r&&r[0]==='houseReconciliation'?wrong():
        r?response(503,r[2]):response(503,'legacy_backend_paused');
    });
    assert.equal(report.verified,false);
    assert.equal(report.readonlyRoutesReachOwnGuards,false);
    assert.equal(report.readyForPlayers,false);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_INFORMATION'));
    assert.ok(!JSON.stringify(report).includes('SECRET_PERSONAL_DETAILS'));
  }
});
test('old archive responses are explicitly classified without exposing bodies',async()=>{
  const r=await inspectCloudReadonlyBoundaries(async url=>
    READ_ROUTES.some(x=>ORIGIN+x[1]===url)
      ?response(503,'legacy_backend_paused')
      :response(503,'legacy_backend_paused'));
  assert.equal(r.verified,false);
  assert.ok(r.checks.slice(0,4).every(c=>
    c.category==='legacy_boundary_still_active'));
  assert.equal(r.cloudPrivateRoutesProtected,false);
  assert.equal(r.legacyWritesBlocked,true);
});

test('writes that start responding 401 or 400 are not mistaken as archive-locked',async()=>{
  for(const status of [401,400,200,302]){
    const r=await inspectCloudReadonlyBoundaries(async url=>
      READ_ROUTES.some(x=>ORIGIN+x[1]===url)?
        response(503,READ_ROUTES.find(x=>ORIGIN+x[1]===url)[2]):
        response(status,status===401?'authentication_required':'invalid_action'));
    assert.equal(r.verified,false);
    assert.equal(r.legacyWritesBlocked,false);
  }
});
test('oversized or malformed error bodies and network faults fail closed',async()=>{
  for(const bad of [
    ()=>new Response('x'.repeat(1000),{status:503,headers:{
      'content-type':'application/json','cache-control':'no-store'}}),
    ()=>new Response('bad json',{status:503,headers:{
      'content-type':'application/json','cache-control':'no-store'}}),
    ()=>{throw Error('SECRET_FIREBASE_TOKEN');},
  ]){
    const report=await inspectCloudReadonlyBoundaries(async url=>
      url.endsWith('/api/firebase-cloud-house-quote')?bad():
      READ_ROUTES.some(x=>ORIGIN+x[1]===url)?
        response(503,READ_ROUTES.find(x=>ORIGIN+x[1]===url)[2]):
        response(503,'legacy_backend_paused'));
    assert.equal(report.verified,false);
    assert.ok(!JSON.stringify(report).includes('SECRET_FIREBASE_TOKEN'));
    assert.equal(report.readyForCutover,false);
  }
});
test('summary always uses an allowlist rather than remote names or error values',()=>{
  const summary=formatCloudReadonlyBoundarySummary({
    checks:[{name:'houseReconciliation',status:'EMAIL_SECRET',passed:false},
      {name:'injected PRIVATE_URL',status:200,passed:true}],
  });
  assert.ok(!summary.includes('EMAIL_SECRET'));
  assert.ok(!summary.includes('PRIVATE_URL'));
  assert.match(summary,/sem evidência/);
});