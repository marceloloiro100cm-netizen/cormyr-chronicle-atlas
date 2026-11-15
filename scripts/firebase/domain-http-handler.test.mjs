import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEmulatorDomainHttpHandler,assertLocalDomainEnvironment,DOMAIN_OPERATIONS} from './domain-http-handler.mjs';
const origin='http://127.0.0.1:8788';
const env={FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'};
const auth={verifyIdToken:async()=>({uid:'u1'}),
  getUser:async uid=>({uid,disabled:false})};
const make=(path,method='POST',body={domain:'time',action:'getCalendar',args:[]},headers={})=>
  new Request(origin+path,{method,headers:{
    authorization:'Bearer emu-token',...(method==='POST'?{'content-type':'application/json'}:{}),
    ...headers,
  },...(method==='POST'?{body:JSON.stringify(body)}:{})});
const h=(services,other={})=>createEmulatorDomainHttpHandler({services,auth,env,origin,...other});

test('default deny on hosts, origin, cookies, URL query and unsupported domains',async()=>{
  assert.throws(()=>assertLocalDomainEnvironment({
    ...env,FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443'},origin));
  assert.throws(()=>assertLocalDomainEnvironment(env,'https://127.0.0.1:8788'));
  const handler=h({time:{getCalendar:async()=>({year:1522})}});
  assert.equal((await handler(make('/api/domain','POST',{domain:'time',action:'getCalendar',args:[]},
    {cookie:'sid=1'}))).status,403);
  assert.equal((await handler(make('/api/domain?token=secret'))).status,403);
  assert.equal((await handler(make('/api/domain','POST',{domain:'time',action:'getCalendar',args:[]},
    {origin:'https://other.example'}))).status,403);
  assert.equal((await handler(make('/api/domain','POST',{domain:'admin',action:'deleteAll',args:[]}))).status,400);
  assert.equal((await handler(make('/api/domain','POST',{domain:'time',action:'__proto__',args:[]}))).status,400);
});
test('revoked, disabled, missing credentials are denied',async()=>{
  const valid=h({time:{getCalendar:async()=>({year:1522})}});
  const r=make('/api/domain');
  r.headers.delete('authorization');
  assert.equal((await valid(r)).status,401);
  const bad=h({},{auth:{verifyIdToken:async()=>({uid:'u1'}),
    getUser:async()=>({uid:'u1',disabled:true})}});
  assert.equal((await bad(make('/api/domain'))).status,401);
});
test('authenticated per-domain method receives verified token, not client-selected identity',async()=>{
  const calls=[];
  const handler=h({time:{getCalendar:async (...a)=>{calls.push(a);return {year:1522,month:1};}}});
  const answer=await handler(make('/api/domain'));
  assert.equal(answer.status,200);
  assert.deepEqual(await answer.json(),{result:{year:1522,month:1}});
  assert.deepEqual(calls,[['emu-token']]);
  assert.equal((await handler(make('/api/domain/session','GET'))).status,200);
  assert.deepEqual(await (await handler(make('/api/domain/session','GET'))).json(),{authenticated:true});
});
test('mail operation injects server token and cannot accept client token',async()=>{
  const calls=[];
  const handler=h({mailbox:{list:async x=>{calls.push(x);return {items:[]};}}});
  const good=await handler(make('/api/domain','POST',{domain:'mailbox',action:'list',
    args:[{folder:'all',pageSize:10}]}));
  assert.equal(good.status,200);
  assert.deepEqual(calls,[{folder:'all',pageSize:10,idToken:'emu-token'}]);
  assert.equal((await handler(make('/api/domain','POST',{domain:'mailbox',action:'list',
    args:[{idToken:'forged'}]}))).status,400);
});
test('no internal or server-only methods exposed; errors do not leak secrets',async()=>{
  assert.equal(DOMAIN_OPERATIONS.records.includes('serverSaveImportedSource'),false);
  assert.equal(DOMAIN_OPERATIONS.drive.includes('runSync'),false);
  const handler=h({records:{listRecords:async()=>{throw Error('private uid secret')}}});
  const bad=await handler(make('/api/domain','POST',{domain:'records',action:'listRecords',args:[{}]}));
  assert.equal(bad.status,503);
  assert.equal(JSON.stringify(await bad.json()).includes('secret'),false);
});
