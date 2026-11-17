import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectPlayerPilotPublicPreflight,
  formatPlayerPilotPreflightSummary,
} from './player-pilot-preflight.mjs';

const BASE='https://atlas.cormyr.com.br';
const publicPaths=[
  '/firebase-access','/api/public/time','/api/public/catalog',
  '/api/public/translations?locale=en',
];
const privatePaths=[
  '/api/firebase-cloud-read','/api/firebase-cloud-mail',
  '/api/firebase-cloud-newspaper','/api/firebase-cloud-treasury',
];
const safeNoop=options=>{
  const body=JSON.parse(options.body);
  assert.deepEqual(Object.keys(body),['action']);
  assert.equal(body.action,
    '__cormyr_anonymous_preflight_never_a_valid_command__');
  assert.equal(options.credentials,'omit');
  assert.equal(options.redirect,'manual');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,undefined);
  assert.equal(options.headers.Cookie,undefined);
};

test('fixed eight anonymous requests: GET public, impossible POST private',async()=>{
  const calls=[];
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url,opts)=>{
      calls.push({url,opts});
      return opts.method==='GET'
        ?new Response('PRIVATE_SITE_RESPONSE_MUST_NOT_BE_READ',{status:200})
        :new Response('PRIVATE_ENDPOINT_RESPONSE_MUST_NOT_BE_READ',{status:503});
    },
  });
  assert.deepEqual(calls.map(x=>x.url),
    [...publicPaths,...privatePaths].map(x=>BASE+x));
  assert.ok(calls.slice(0,4).every(x=>x.opts.method==='GET'));
  assert.ok(calls.slice(0,4).every(x=>
    x.opts.redirect==='manual'&&x.opts.credentials==='omit'));
  for(const call of calls.slice(4)){
    assert.equal(call.opts.method,'POST');
    safeNoop(call.opts);
  }
  assert.equal(report.requests,8);
  assert.equal(report.pilotPageReachable,true);
  assert.equal(report.publicContentAvailable,true);
  assert.equal(report.privateEndpointsFailClosedNow,true);
  assert.equal(report.privateAuthGuardVerified,false);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.equal(report.writes,0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_SITE_RESPONSE'));
  assert.ok(!JSON.stringify(report).includes('PRIVATE_ENDPOINT_RESPONSE'));
});

test('maintenance-mode 503 on private routes is closed, not proven Auth guard',async()=>{
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url,opts)=>new Response(null,{status:
      opts.method==='POST'?503:
        url.endsWith('/firebase-access')?200:503}),
  });
  assert.deepEqual(report.statusCodes,{
    firebasePilotPage:200,campaignTime:503,
    publicCatalog:503,publicTranslations:503,
  });
  assert.deepEqual(report.anonymousPrivateStatusCodes,{
    cloudHouseRead:503,cloudMail:503,cloudNewspaper:503,cloudTreasury:503,
  });
  assert.equal(report.pilotPageReachable,true);
  assert.equal(report.publicContentAvailable,false);
  assert.equal(report.privateEndpointsFailClosedNow,true);
  assert.equal(report.privateAuthGuardVerified,false);
  assert.equal(report.mailboxAndCalendarWritesVerified,false);
  assert.equal(report.crossAccountRoleE2EVerified,false);
  assert.equal(report.readyForPlayers,false);
  const summary=formatPlayerPilotPreflightSummary(report);
  assert.match(summary,/HTTP 503/);
  assert.match(summary,/não comprovado|Não comprovado/);
  assert.match(summary,/NÃO AUTORIZADA/);
});

test('all active private endpoints returning 401 prove only anonymous denials',async()=>{
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url,opts)=>new Response(null,{status:
      opts.method==='POST'?401:200}),
  });
  assert.equal(report.privateEndpointsFailClosedNow,true);
  assert.equal(report.privateAuthGuardVerified,true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.accountActivationVerified,false);
});

test('unprotected 200, redirect 302, unexpected 400 or failure block privacy CI',async()=>{
  for(const bad of [200,302,400,null]){
    const seen=[];
    const report=await inspectPlayerPilotPublicPreflight({
      fetcher:async(url,opts)=>{
        if(opts.method==='GET')return new Response(null,{status:200});
        seen.push(url);
        if(url.endsWith('/api/firebase-cloud-mail')){
          if(bad===null)throw Error('SECRET_TOKEN_IN_NETWORK_ERROR');
          return new Response(null,{status:bad,headers:
            bad===302?{Location:'https://attacker.example/steal'}:{}});
        }
        return new Response(null,{status:401});
      },
    });
    assert.equal(seen.length,4);
    assert.equal(report.privateEndpointsFailClosedNow,false);
    assert.equal(report.privateAuthGuardVerified,false);
    assert.equal(report.readyForPlayers,false);
    assert.equal(report.writes,0);
    const output=JSON.stringify(report)+formatPlayerPilotPreflightSummary(report);
    assert.ok(!output.includes('SECRET_TOKEN'));
    assert.ok(!output.includes('attacker.example'));
  }
});

test('public network errors and redirects cannot count as reachable',async()=>{
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url,opts)=>{
      if(opts.method==='POST')return new Response(null,{status:503});
      if(url.endsWith('/firebase-access'))throw Error('SECRET_TOKEN_IN_ERROR');
      if(url.endsWith('/api/public/time'))return new Response(null,{
        status:302,headers:{Location:'https://attacker.example/steal'},
      });
      return new Response(null,{status:404});
    },
  });
  assert.equal(report.statusCodes.firebasePilotPage,null);
  assert.equal(report.statusCodes.campaignTime,302);
  assert.equal(report.pilotPageReachable,false);
  assert.equal(report.privateEndpointsFailClosedNow,true);
  assert.equal(report.readyForPlayers,false);
  assert.ok(!JSON.stringify(report).includes('SECRET_TOKEN'));
  assert.ok(!JSON.stringify(report).includes('attacker.example'));
});

test('summary never prints remote fields, credentials or invalid HTTP values',()=>{
  const summary=formatPlayerPilotPreflightSummary({
    statusCodes:{firebasePilotPage:'PRIVATE_UID_EMAIL',
      campaignTime:999,publicCatalog:200,publicTranslations:503},
    anonymousPrivateStatusCodes:{cloudHouseRead:'Bearer SECRET',
      cloudMail:999,cloudNewspaper:401,cloudTreasury:503},
    privateEndpointsFailClosedNow:false,privateAuthGuardVerified:false,
  });
  for(const sensitive of ['PRIVATE_UID_EMAIL','Bearer SECRET','999'])
    assert.ok(!summary.includes(sensitive));
  assert.match(summary,/indisponível/);
  assert.match(summary,/NÃO AUTORIZADA/);
});
