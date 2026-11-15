import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_ORIGIN,PUBLIC_LATENCY_ENDPOINTS,PUBLIC_LATENCY_REPEATS,
  measurePublicFirebaseLatency,
} from './firebase-production-public-latency.mjs';

const json=(status=200)=>new Response(null,{
  status,headers:{'content-type':'application/json; charset=utf-8'},
});

test('at most nine anonymous GETs against the fixed Cormyr origin, never a write',async()=>{
  const calls=[];let elapsed=0;
  const report=await measurePublicFirebaseLatency({
    clock:()=>{elapsed+=11;return elapsed;},
    fetcher:async(url,options)=>{
      calls.push({url,options});
      return json();
    },
  });
  assert.equal(PUBLIC_ORIGIN,'https://atlas.cormyr.com.br');
  assert.equal(PUBLIC_LATENCY_ENDPOINTS.length,3);
  assert.equal(PUBLIC_LATENCY_REPEATS,3);
  assert.equal(calls.length,9);
  assert.equal(report.requestCount,9);
  assert.equal(report.publicRoutesResponding,true);
  assert.equal(report.p50Ms,11);
  assert.equal(report.p95Ms,11);
  assert.equal(report.productionWrites,0);
  assert.equal(report.realAuthenticatedPerformanceVerified,false);
  assert.equal(report.cloudLoadTestPassed,false);
  assert.equal(report.readyForCutover,false);
  for(const {url,options} of calls){
    assert.ok(url.startsWith(PUBLIC_ORIGIN+'/api/public/'));
    assert.equal(options.method,'GET');
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.headers.Cookie,undefined);
    assert.equal(options.body,undefined);
  }
});

test('public API outage or HTML login redirect does not count as readiness',async()=>{
  let t=0;
  const report=await measurePublicFirebaseLatency({
    clock:()=>++t,
    fetcher:async url=>url.includes('catalog')?json(503):
      new Response('<html></html>',{status:200,
        headers:{'content-type':'text/html'}}),
  });
  assert.equal(report.publicRoutesResponding,false);
  assert.equal(report.checks.filter(x=>x.passed).length,0);
  assert.equal(report.p95Ms,null);
  assert.equal(report.requestCount,9);
});

test('network failures are counted without leaking exception bodies or retry storms',async()=>{
  let count=0,t=0;
  const report=await measurePublicFirebaseLatency({
    clock:()=>++t,
    fetcher:async()=>{
      count++;throw Error('private transport message not for user');
    },
  });
  assert.equal(count,9);
  assert.equal(report.checks.every(x=>x.status===null&&x.durationMs===null),true);
  assert.equal(JSON.stringify(report).includes('private transport message'),false);
  assert.equal(report.productionWrites,0);
});
