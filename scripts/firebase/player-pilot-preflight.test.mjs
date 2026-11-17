import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectPlayerPilotPublicPreflight,
  formatPlayerPilotPreflightSummary,
} from './player-pilot-preflight.mjs';

const BASE='https://atlas.cormyr.com.br';
const paths=[
  '/firebase-access','/api/public/time','/api/public/catalog',
  '/api/public/translations?locale=en',
];

test('public pilot preflight issues only four fixed anonymous GETs',async()=>{
  const calls=[];
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url,opts)=>{
      calls.push({url,opts});
      return new Response('PRIVATE_SITE_RESPONSE_MUST_NOT_BE_READ',{status:200});
    },
  });
  assert.deepEqual(calls.map(x=>x.url),paths.map(x=>BASE+x));
  assert.ok(calls.every(x=>x.opts.method==='GET'&&
    x.opts.redirect==='manual'&&x.opts.credentials==='omit'&&
    x.opts.cache==='no-store'&&!('Authorization' in x.opts.headers)));
  assert.equal(report.pilotPageReachable,true);
  assert.equal(report.publicContentAvailable,true);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.equal(report.writes,0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_SITE_RESPONSE'));
});

test('503 public endpoints and valid pilot page still cannot authorize playing',async()=>{
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url)=>new Response(null,{status:
      url.endsWith('/firebase-access')?200:503}),
  });
  assert.deepEqual(report.statusCodes,{
    firebasePilotPage:200,campaignTime:503,
    publicCatalog:503,publicTranslations:503,
  });
  assert.equal(report.pilotPageReachable,true);
  assert.equal(report.publicContentAvailable,false);
  assert.equal(report.mailboxAndCalendarWritesVerified,false);
  assert.equal(report.crossAccountRoleE2EVerified,false);
  assert.equal(report.readyForPlayers,false);
  const summary=formatPlayerPilotPreflightSummary(report);
  assert.match(summary,/HTTP 503/);
  assert.match(summary,/NÃO AUTORIZADA/);
});

test('network failures or redirects never count as a successful read',async()=>{
  const report=await inspectPlayerPilotPublicPreflight({
    fetcher:async(url)=>{
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
  assert.equal(report.readyForPlayers,false);
  assert.ok(!JSON.stringify(report).includes('SECRET_TOKEN'));
  assert.ok(!JSON.stringify(report).includes('attacker.example'));
});

test('summary accepts only bounded HTTP numbers and never outputs raw provider fields',()=>{
  const summary=formatPlayerPilotPreflightSummary({
    statusCodes:{firebasePilotPage:'PRIVATE_UID_EMAIL',
      campaignTime:999,publicCatalog:200,publicTranslations:503},
  });
  assert.ok(!summary.includes('PRIVATE_UID_EMAIL'));
  assert.ok(!summary.includes('999'));
  assert.match(summary,/indisponível/);
  assert.match(summary,/NO_GO/);
});
