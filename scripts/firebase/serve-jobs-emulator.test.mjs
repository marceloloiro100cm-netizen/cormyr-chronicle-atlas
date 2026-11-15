import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalJobHttpHandler} from './serve-jobs-emulator.mjs';
import {createJobsHandler} from './scheduled-jobs-handler.mjs';

const origin='http://127.0.0.1:8790';
const calls=[];
const jobs={
  'publish-due':async()=>{calls.push('newspaper');return 1;},
  'advance-missions':async()=>{calls.push('missions');return {advanced:2};},
};
const route=createLocalJobHttpHandler({
  handle:createJobsHandler({jobs,secret:'secret-longer-than-thirty-two-bytes-total'}),
  origin,
});
const call=(path,headers={},method='POST')=>route(new Request(origin+path,{
  method,headers:{authorization:'Bearer secret-longer-than-thirty-two-bytes-total',...headers},
}));

test('loopback cron runner executes the two real service hooks by exact path',async()=>{
  calls.length=0;
  const output=await call('/api/firebase-jobs/all');
  assert.equal(output.status,200);
  assert.deepEqual((await output.json()).results,{
    'publish-due':{status:'ok',count:1},
    'advance-missions':{status:'ok',count:2},
  });
  assert.deepEqual(calls,['newspaper','missions']);
});
test('cron HTTP boundary rejects cookies, remote origin, forwarded host and body',async()=>{
  for(const headers of [
    {cookie:'session=private'},
    {origin:'https://untrusted.example'},
    {'x-forwarded-host':'untrusted.example'},
    {'content-length':'20'},
    {'transfer-encoding':'chunked'},
  ])assert.equal((await call('/api/firebase-jobs/all',headers)).status,403);
  const remote=route(new Request('https://untrusted.example/api/firebase-jobs/all',{
    method:'POST',headers:{authorization:'Bearer secret-longer-than-thirty-two-bytes-total'},
  }));
  assert.equal((await remote).status,403);
});
test('invalid cron secret and forbidden methods are rejected',async()=>{
  assert.equal((await call('/api/firebase-jobs/all',{authorization:'Bearer incorrect'})).status,401);
  assert.equal((await call('/api/firebase-jobs/all',{},'GET')).status,405);
  assert.equal((await call('/api/firebase-jobs/unknown')).status,404);
  assert.equal((await call('/api/firebase-jobs/all?token=never')).status,400);
});
test('a public or remote listener cannot be initialized',()=>{
  assert.throws(()=>createLocalJobHttpHandler({handle:async()=>new Response(),origin:'https://example.org:8790'}));
});
