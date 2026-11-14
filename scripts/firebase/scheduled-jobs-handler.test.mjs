import test from 'node:test';
import assert from 'node:assert/strict';
import {createJobsHandler,createInternalAuth} from './scheduled-jobs-handler.mjs';

const req=(path,{method='POST',auth='Bearer s3cret'}={})=>new Request('http://x'+path,{method,headers:auth?{authorization:auth}:{}});
const mk=(jobs,extra={})=>createJobsHandler({jobs,secret:'s3cret',...extra});

test('authentication mirrors the cron rule',async()=>{
  const calls=[];const h=mk({'publish-due':async()=>{calls.push(1);return 2;}});
  assert.equal((await h(req('/api/firebase-jobs/publish-due',{auth:null}))).status,401);
  assert.equal((await h(req('/api/firebase-jobs/publish-due',{auth:'Bearer nope'}))).status,401);
  assert.equal((await h(req('/api/firebase-jobs/publish-due',{auth:'Basic s3cret'}))).status,401);
  assert.equal(calls.length,0);
  assert.equal((await createJobsHandler({jobs:{},secret:''})(req('/api/firebase-jobs/all'))).status,500);
  const prev=createJobsHandler({jobs:{'publish-due':async()=>1},secret:'new',previousSecret:'old'});
  assert.equal((await prev(req('/api/firebase-jobs/publish-due',{auth:'Bearer old'}))).status,200);
  assert.equal((await prev(req('/api/firebase-jobs/publish-due',{auth:'Bearer new'}))).status,200);
});
test('only POST, no query string, known paths',async()=>{
  const h=mk({'publish-due':async()=>1});
  assert.equal((await h(req('/api/firebase-jobs/publish-due',{method:'GET'}))).status,405);
  assert.equal((await h(req('/api/firebase-jobs/publish-due?x=1'))).status,400);
  assert.equal((await h(req('/api/firebase-jobs/other'))).status,404);
  assert.equal((await h(req('/elsewhere'))).status,404);
  assert.equal((await h(req('/api/firebase-jobs/constructor'))).status,404);
});
test('runs one job or all and returns counts only',async()=>{
  const h=mk({'publish-due':async()=>3,'advance-missions':async()=>({advanced:2})});
  const one=await (await h(req('/api/firebase-jobs/publish-due'))).json();
  assert.deepEqual(one,{ok:true,results:{'publish-due':{status:'ok',count:3}}});
  const all=await (await h(req('/api/firebase-jobs/all'))).json();
  assert.deepEqual(all.results,{'publish-due':{status:'ok',count:3},'advance-missions':{status:'ok',count:2}});
});
test('a failing job returns 500 without leaking the error and does not stop the others',async()=>{
  const h=mk({'publish-due':async()=>{throw new Error('secret detail');},'advance-missions':async()=>1});
  const res=await h(req('/api/firebase-jobs/all'));
  assert.equal(res.status,500);
  const text=await res.text();
  assert.ok(!text.includes('secret detail'));
  assert.deepEqual(JSON.parse(text).results,{'publish-due':{status:'error'},'advance-missions':{status:'ok',count:1}});
});
test('internal identity resolves only its own token',async()=>{
  const {token,auth}=createInternalAuth('narrator-uid');
  assert.deepEqual(await auth.verifyIdToken(token),{uid:'narrator-uid'});
  await assert.rejects(auth.verifyIdToken('job.'+'0'.repeat(48)));
  await assert.rejects(auth.verifyIdToken(''));
  await assert.rejects(auth.verifyIdToken(undefined));
  assert.throws(()=>createInternalAuth(''));
  const other=createInternalAuth('x');
  await assert.rejects(other.auth.verifyIdToken(token));
});
