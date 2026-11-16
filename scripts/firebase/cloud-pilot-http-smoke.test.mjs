import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGIN,PATHS,probeCloudPilot} from './cloud-pilot-http-smoke.mjs';

function fake(pageStatus=200,gatewayStatus=503,gatewayCode='firebase_cloud_read_disabled'){
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,method:opts.method,credentials:opts.credentials,body:opts.body});
    if(url===ORIGIN+PATHS[0])
      return new Response('<html>Firebase</html>',{
        status:pageStatus,headers:{'content-type':'text/html; charset=utf-8'},
      });
    if(url===ORIGIN+PATHS[1])
      return Response.json({error:gatewayCode},{
        status:gatewayStatus,headers:{'Cache-Control':'private, no-store'},
      });
    if(url===ORIGIN+PATHS[2])
      return Response.json({error:'firebase_cloud_mail_disabled'},{
        status:503,headers:{'Cache-Control':'private, no-store'},
      });
    throw Error('unapproved_destination');
  };
  return {calls,fetcher};
}

test('new Firebase Cloud pilot and disabled gateway give safe public readiness',async()=>{
  const {calls,fetcher}=fake();
  const result=await probeCloudPilot(fetcher);
  assert.equal(result.verified,true);
  assert.equal(result.readyForCutover,false);
  assert.deepEqual(result.checks.map(x=>x.status),[200,503,503]);
  assert.deepEqual(calls.map(x=>x.method),['GET','POST','POST']);
  assert.ok(calls.every(x=>x.credentials==='omit'));
  assert.ok(calls.every(x=>x.url.startsWith(ORIGIN+'/')));
  assert.equal(calls[1].body,JSON.stringify({action:'session'}));
  assert.equal(calls[2].body,JSON.stringify({action:'status'}));
});

test('authenticated-only mode accepts anonymous rejection 401, no data exposed',async()=>{
  const {fetcher}=fake(200,401,'authentication_required');
  assert.equal((await probeCloudPilot(fetcher)).verified,true);
});

test('legacy maintenance 503 is not mistaken for new Firebase gateway',async()=>{
  const {fetcher}=fake(200,503,'legacy_backend_paused');
  assert.equal((await probeCloudPilot(fetcher)).verified,false);
});

test('unauthenticated HTTP 200 is always a failure even with matching body',async()=>{
  const {fetcher}=fake(200,200,'firebase_cloud_read_disabled');
  assert.equal((await probeCloudPilot(fetcher)).verified,false);
});

test('pilot redirect or missing page fails public acceptance',async()=>{
  const {fetcher}=fake(302);
  assert.equal((await probeCloudPilot(fetcher)).verified,false);
});

test('HTTP transport errors are inconclusive, not success',async()=>{
  const result=await probeCloudPilot(async()=>{throw Error('no_network');});
  assert.equal(result.verified,false);
  assert.deepEqual(result.checks.map(x=>x.status),[null,null,null]);
});

test('Cloud mail cannot pass the public smoke with anonymous HTTP 200',async()=>{
  const {fetcher}=fake();
  const broken=async(url,opts)=>{
    if(url===ORIGIN+PATHS[2])return Response.json({result:{canSend:true}},{
      status:200,headers:{'Cache-Control':'no-store'},
    });
    return fetcher(url,opts);
  };
  const report=await probeCloudPilot(broken);
  assert.equal(report.verified,false);
  assert.equal(report.checks[2].passed,false);
});
