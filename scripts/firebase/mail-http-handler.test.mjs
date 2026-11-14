import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEmulatorMailHttpHandler,MAX_MAIL_BODY} from './mail-http-handler.mjs';

const origin='http://127.0.0.1:8787';
const env={FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'};
let authCalls=0;
const ref={runTransaction(){throw Error('Must not run');},collection(){return this;},doc(){return this;}};
const config={origin,env,db:ref,snapshotId:'1'.repeat(64),auth:{
  async verifyIdToken(){authCalls++;throw Error('SECRET_TOKEN_ERROR');},
  async getUser(){throw Error('Must not run');},
}};
const handle=createEmulatorMailHttpHandler(config);
function req({url=origin+'/api/firebase-mail/list',method='POST',headers={},body='{}'}={}){
  return new Request(url,{method,headers:{authorization:'Bearer synthetic:alice',
    'content-type':'application/json',...headers},...(['GET','HEAD'].includes(method)?{}:{body})});
}
test('requires both local emulators and a fixed loopback origin',()=>{
  for(const overrides of [
    {env:{}},{env:{...env,FIREBASE_AUTH_EMULATOR_HOST:'auth.example:9099'}},
    {env:{...env,FIRESTORE_EMULATOR_HOST:'cloud.example:8080'}},
    {origin:'http://0.0.0.0:8787'},{origin:'https://127.0.0.1:8787'},
  ])assert.throws(()=>createEmulatorMailHttpHandler({...config,...overrides}));
});
test('rejects untrusted requests before reaching auth or Firestore',async()=>{
  const cases=[
    [{headers:{origin:'https://evil.example'}},403],
    [{headers:{'sec-fetch-site':'cross-site'}},403],
    [{url:'http://evil.example/api/firebase-mail/list'},403],
    [{method:'GET'},405],
    [{url:origin+'/api/firebase-mail/list?token=secret'},400],
    [{url:origin+'/api/firebase-mail/constructor'},404],
    [{url:origin+'/api/firebase-mail/unknown'},404],
    [{headers:{authorization:''}},401],
    [{headers:{authorization:'Bearer a b'}},401],
    [{headers:{'content-type':'text/plain'}},415],
    [{headers:{'content-encoding':'gzip'}},415],
    [{body:'['},400],[{body:'null'},400],[{body:'[]'},400],
    [{body:JSON.stringify({idToken:'synthetic:narrator'})},400],
    [{body:JSON.stringify({snapshotId:'2'.repeat(64)})},400],
    [{body:JSON.stringify({admin:true})},400],
    [{body:'{"__proto__":{"admin":true}}'},400],
    [{url:origin+'/api/firebase-mail/login',body:'{"email":"test@example.invalid","password":"test","host":"evil.example"}'},400],
    [{url:origin+'/api/firebase-mail/login',body:'{"email":"","password":""}'},400],
    [{body:'x'.repeat(MAX_MAIL_BODY+1)},413],
  ];
  const before=authCalls;
  for(const [input,status] of cases){
    const response=await handle(req(input));
    assert.equal(response.status,status,JSON.stringify(input).slice(0,100));
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
  assert.equal(authCalls,before);
});
test('invalid token is denied without leaking underlying exception',async()=>{
  const response=await handle(req());
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'access_denied'});
});
test('backend failure is opaque',async()=>{
  const failing=createEmulatorMailHttpHandler({...config,auth:{
    async verifyIdToken(){return {uid:'alice'};},
    async getUser(){return {uid:'alice',disabled:false};},
  },db:{...ref,async get(){throw Error('PRIVATE_BACKEND_VALUE');}}});
  const response=await failing(req());
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'internal_error'});
});
