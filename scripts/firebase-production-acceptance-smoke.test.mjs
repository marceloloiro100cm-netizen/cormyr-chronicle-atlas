import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROBES,PRODUCTION_ORIGIN,LEGACY_AUTH_ORIGIN,
  productionProbeRequest,classifyProductionProbe,probeProductionBoundaries,
} from './firebase-production-acceptance-smoke.mjs';

const makeResponse=probe=>new Response(null,{
  status:probe.status,
  headers:{'content-type':probe.type==='json'?'application/json':
    probe.type==='html'?'text/html; charset=utf-8':'text/plain'},
});

test('the production readiness probe never uses credentials or private payloads',()=>{
  assert.equal(PROBES.length,8);
  const seen=[];
  for(const probe of PROBES){
    const {url,options}=productionProbeRequest(probe);
    seen.push(url);
    assert.ok(url.startsWith(PRODUCTION_ORIGIN+'/')||
      url===LEGACY_AUTH_ORIGIN+'/auth/v1/health');
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.headers.Cookie,undefined);
    if(options.method==='POST'){
      assert.equal(probe.name,'cronAnonymousDenied');
      assert.equal(JSON.parse(options.body).kind,'__non_mutating_auth_probe__');
    }else assert.equal(options.body,undefined);
  }
  assert.equal(new Set(seen).size,PROBES.length);
  assert.throws(()=>productionProbeRequest({path:'/api/private'}),/Unrecognized/);
});

test('all public and anonymous-denial boundaries pass without claiming user logins',async()=>{
  const requested=[];
  const report=await probeProductionBoundaries({fetcher:async(url,opts)=>{
    requested.push({url,method:opts.method,headers:opts.headers});
    const entry=PROBES.find(x=>url===new URL(x.path,x.origin).href);
    assert.ok(entry,'Only allowlisted checks are requested');
    return makeResponse(entry);
  }});
  assert.equal(report.publicReadinessPassed,true);
  assert.equal(report.advisoryAuthEndpointPassed,true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.serviceRoleSecretProven,false);
  assert.equal(report.productionWrites,0);
  assert.equal(requested.find(x=>x.url.includes('drive-sync')).method,'POST');
});

test('public-data outage or private permission leak prevents readiness',async()=>{
  const report=await probeProductionBoundaries({fetcher:async url=>{
    const entry=PROBES.find(x=>url===new URL(x.path,x.origin).href);
    if(entry.name==='campaignTime')return Response.json({error:'unavailable'},{status:503});
    if(entry.name==='privateGmAnonymousDenied')return Response.json({secret:true},{status:200});
    return makeResponse(entry);
  }});
  assert.equal(report.publicReadinessPassed,false);
  assert.equal(report.checks.find(x=>x.name==='campaignTime').status,503);
  assert.equal(report.checks.find(x=>x.name==='privateGmAnonymousDenied').status,200);
  assert.equal(report.readyForPlayers,false);
});

test('only Content-Type verified JSON counts; HTML fallback does not pass',()=>{
  const probe=PROBES.find(x=>x.name==='publicCatalog');
  assert.equal(classifyProductionProbe(probe,new Response('<html></html>',{
    status:200,headers:{'content-type':'text/html'},
  })),false);
  assert.equal(classifyProductionProbe(probe,makeResponse(probe)),true);
});

test('Supabase health is advisory and cannot by itself authorize player cutover',async()=>{
  const report=await probeProductionBoundaries({fetcher:async url=>{
    const entry=PROBES.find(x=>url===new URL(x.path,x.origin).href);
    if(entry.name==='legacySupabaseAuthHealth')throw Error('network not available');
    return makeResponse(entry);
  }});
  assert.equal(report.publicReadinessPassed,true);
  assert.equal(report.advisoryAuthEndpointPassed,false);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.checks.find(x=>x.name==='legacySupabaseAuthHealth').reason,'transport_unavailable');
});
