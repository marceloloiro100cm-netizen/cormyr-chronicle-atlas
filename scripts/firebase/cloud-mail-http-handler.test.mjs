import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudMailHttpHandler} from './cloud-mail-http-handler.mjs';
import {CloudMailError} from './cloud-mail-service.mjs';

const url='https://atlas.cormyr.com.br/api/firebase-cloud-mail';
const token='firebase-id-token-for-test';
const request={
  requestKey:'123e4567-e89b-42d3-a456-426614174000',
  originHouseId:'h-a',recipientHouseId:'h-b',toNarrator:false,
  subject:'Convite',content:'Encontro na fortaleza',
};
const make=(data={action:'send',request},headers={})=>new Request(url,{
  method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+token,...headers,
  },
  body:JSON.stringify(data),
});

test('Disabled Cloud gateway fails before executing any service method',async()=>{
  let calls=0;
  const handler=createCloudMailHttpHandler({
    service:{send(){calls++;throw Error('should not happen');}},
  });
  const result=await handler(make());
  assert.equal(result.status,503);
  assert.equal((await result.json()).error,'firebase_cloud_mail_disabled');
  assert.equal(calls,0);
});

test('Authorized same-origin POST delivers only via injected service',async()=>{
  const seen=[];
  const handler=createCloudMailHttpHandler({
    enabled:true,
    service:{async send(tokenValue,input){
      seen.push({tokenValue,input});
      return {id:'created-mail',duplicate:false};
    }},
  });
  const response=await handler(make());
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{
    result:{id:'created-mail',duplicate:false},
  });
  assert.equal(response.headers.get('cache-control')?.includes('no-store'),true);
  assert.equal(seen[0].tokenValue,token);
  assert.deepEqual(seen[0].input,request);
});

test('Anonymous, cross-site, cookies and URL query cannot perform writes',async()=>{
  let calls=0;
  const handler=createCloudMailHttpHandler({enabled:true,service:{
    async send(){calls++;return {id:'bad'};},
  }});
  const anonymous=make();
  anonymous.headers.delete('Authorization');
  assert.equal((await handler(anonymous)).status,401);
  assert.equal((await handler(make(undefined,{'Origin':'https://attacker.example'}))).status,403);
  assert.equal((await handler(make(undefined,{'Cookie':'sid=unsafe'}))).status,403);
  assert.equal((await handler(make(undefined,{'Sec-Fetch-Site':'cross-site'}))).status,403);
  const query=new Request(url+'?snapshot=unknown',{
    method:'POST',headers:{
      'Authorization':'Bearer '+token,'Content-Type':'application/json',
    },body:JSON.stringify({action:'send',request}),
  });
  assert.equal((await handler(query)).status,403);
  assert.equal(calls,0);
});

test('Malformed JSON and excessive message bodies fail closed',async()=>{
  let count=0;
  const handler=createCloudMailHttpHandler({enabled:true,service:{
    async send(){count++;return {};}
  }});
  assert.equal((await handler(make({action:'unknown',request}))).status,400);
  assert.equal((await handler(make({
    action:'send',request,extra:true,
  }))).status,400);
  assert.equal((await handler(make({
    action:'send',request:{...request,content:'a'.repeat(30_000)},
  }))).status,413);
  const malformed=new Request(url,{method:'POST',headers:{
    'Authorization':'Bearer '+token,'Content-Type':'application/json',
  },body:'{broken'});
  assert.equal((await handler(malformed)).status,400);
  assert.equal(count,0);
});

test('Only typed error codes escape, not private Cloud exceptions',async()=>{
  const typed=createCloudMailHttpHandler({enabled:true,service:{
    async send(){throw new CloudMailError('mail_rate_limited',429);}
  }});
  assert.equal((await typed(make())).status,429);
  const leaked='private-secret-uid-and-token';
  const hidden=createCloudMailHttpHandler({enabled:true,service:{
    async send(){throw Error(leaked);}
  }});
  const response=await hidden(make());
  assert.equal(response.status,503);
  assert.ok(!JSON.stringify(await response.json()).includes(leaked));
});
