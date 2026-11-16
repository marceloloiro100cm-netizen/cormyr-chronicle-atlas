import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CloudAccessError} from './cloud-readonly-service.mjs';
import {createFirebaseCloudMail,mailRuntimeReady} from './cloud-mail-service.mjs';

const snapshot='f'.repeat(64);
const uid='player-1';
const token='valid-firebase-id-token';
const key='123e4567-e89b-42d3-a456-426614174000';
const key2='123e4567-e89b-42d3-a456-426614174001';
const hex=s=>createHash('sha256').update(s).digest('hex');
const snap=v=>({exists:v!==undefined,data:()=>v});
const root=name=>name+'/'+snapshot;
function fixture(role='jogador'){
  const docs=new Map();
  const prepared={status:'complete',private:true};
  for(const name of ['migrationDomainStage','migrationAuthStage','migrationTimeEngineStage'])
    docs.set(root(name),{...prepared});
  docs.set(root('campaignMailRuntime'),{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceLiveReconciled:true,applicationEnabled:true,mailEnabled:true,
  });
  const access=role==='narrador'?{
    userId:uid,profile:'narrador',admin:true,active:true,
    requirePasswordChange:false,playerId:null,memberHouseIds:[],editHouseIds:[],
  }:role==='editor'?{
    userId:uid,profile:'editor',admin:false,active:true,
    requirePasswordChange:false,playerId:null,memberHouseIds:[],editHouseIds:[],
  }:{
    userId:uid,profile:'jogador',admin:false,active:true,
    requirePasswordChange:false,playerId:'player-a',memberHouseIds:['h-a'],
    editHouseIds:['h-a'],
  };
  const accessPath=root('migrationDomainStage')+'/access/'+uid;
  docs.set(accessPath,access);
  for(const h of ['h-a','h-b']){
    docs.set(root('migrationDomainStage')+'/houses/'+hex('house:'+h),
      {sourceId:h,name:'House '+h,active:true});
  }
  docs.set(root('migrationTimeEngineStage')+'/calendar/current',
    {year:1522,month:4,day:12,festival:null,version:3});
  const ref=path=>({
    path,
    collection(name){return ref(path+'/'+name);},
    doc(name){return ref(path+'/'+name);},
    async get(){return snap(docs.get(path));},
  });
  const db={
    collection(name){return ref(name);},
    async runTransaction(callback){
      const tx={
        async get(doc){return snap(docs.get(doc.path));},
        create(doc,data){
          assert.equal(docs.has(doc.path),false);
          docs.set(doc.path,data);
        },
        set(doc,data){docs.set(doc.path,data);},
      };
      return callback(tx);
    },
  };
  const auth={
    async verifyIdToken(v,revoked){
      assert.equal(revoked,true);
      if(v!==token)throw Error('invalid token');
      return {uid};
    },
    async getUser(){return {uid,disabled:false};},
  };
  const service=()=>createFirebaseCloudMail({auth,db,snapshotId:snapshot,
    projectId:'cormyr',enabled:true,env:{},
    clock:()=>new Date('2026-11-16T10:00:00.000Z'),
  });
  const request=(extra={})=>({
    requestKey:key,originHouseId:'h-a',recipient:'h:h-b',
    subject:'Carta de teste',content:'Texto de missiva.',...extra,
  });
  return {service,request,docs,db,auth,accessPath};
}
const expectCode=(code,status)=>e=>
  e instanceof CloudAccessError&&e.code===code&&e.status===status;

test('disabled by default and refuses emulator, unexpected project and malformed snapshot',()=>{
  const f=fixture();
  const config={auth:f.auth,db:f.db,snapshotId:snapshot,
    projectId:'cormyr',env:{}};
  assert.throws(()=>createFirebaseCloudMail(config),
    expectCode('firebase_mail_disabled',503));
  assert.throws(()=>createFirebaseCloudMail({...config,enabled:true,
    env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}}),
    expectCode('firebase_mail_disabled',503));
  assert.throws(()=>createFirebaseCloudMail({...config,enabled:true,
    projectId:'another-project'}),expectCode('firebase_mail_disabled',503));
  assert.throws(()=>createFirebaseCloudMail({...config,enabled:true,
    snapshotId:'../../private'}),expectCode('firebase_mail_disabled',503));
});

test('runtime root requires explicit source reconciliation and operation approval',async()=>{
  const f=fixture();
  assert.equal((await f.service().status(token)).ready,true);
  const p=root('campaignMailRuntime');
  for(const [field,value] of [
    ['status','incomplete'],['private',false],
    ['sourceLiveReconciled',false],['applicationEnabled',false],
    ['mailEnabled',false],['sourceSnapshotId','a'.repeat(64)],
  ]){
    const old=f.docs.get(p);
    f.docs.set(p,{...old,[field]:value});
    assert.equal((await f.service().status(token)).ready,false);
    await assert.rejects(()=>f.service().send(token,f.request()),
      expectCode('firebase_mail_not_ready',503));
    f.docs.set(p,old);
  }
  assert.equal(mailRuntimeReady(f.docs.get(p),snapshot),true);
  assert.equal((await f.service().status(token)).canCompose,true);
});

test('player composes to House with a fresh Cloud transaction and no writes to stage',async()=>{
  const f=fixture();
  const result=await f.service().send(token,f.request());
  assert.equal(result.duplicate,false);
  assert.equal(result.delivered,true);
  const d=f.docs.get(root('campaignMailRuntime')+'/letters/'+result.id);
  assert.equal(d.recipientKind,'house');
  assert.equal(d.recipientHouseId,'h-b');
  assert.equal(d.originHouseId,'h-a');
  assert.equal(d.campaignDate,'1522-05-12');
  assert.equal(d.senderUid,uid);
  assert.equal(d.content,'Texto de missiva.');
  assert.equal(d.publicationState,'delivered');
  assert.equal(f.docs.get(root('migrationDomainStage')).status,'complete');
  assert.equal([...f.docs.keys()].filter(x=>x.includes('/letters/')).length,1);
});

test('same idempotent replay succeeds, changing content conflicts; new message rate limited',async()=>{
  const f=fixture();
  const first=await f.service().send(token,f.request());
  const second=await f.service().send(token,f.request());
  assert.equal(second.duplicate,true);
  assert.equal(second.id,first.id);
  await assert.rejects(()=>f.service().send(token,f.request({
    content:'Changed body',
  })),expectCode('operation_key_conflict',409));
  await assert.rejects(()=>f.service().send(token,f.request({
    requestKey:key2,
  })),expectCode('send_rate_limited',429));
});

test('cannot forge origin, send as Editor, or send from Narrator to Narrator',async()=>{
  const f=fixture();
  await assert.rejects(()=>f.service().send(token,f.request({
    originHouseId:'h-b',
  })),expectCode('access_denied',403));
  const editor=fixture('editor');
  await assert.rejects(()=>editor.service().send(token,editor.request()),
    expectCode('access_denied',403));
  const narrator=fixture('narrador');
  await assert.rejects(()=>narrator.service().send(token,narrator.request({
    originHouseId:null,recipient:'narrator',
  })),expectCode('access_denied',403));
  const sent=await narrator.service().send(token,narrator.request({
    originHouseId:null,
  }));
  assert.equal(sent.delivered,true);
});

test('player can send to Narrator; invalid unknown or archived House cannot receive',async()=>{
  const f=fixture();
  const result=await f.service().send(token,f.request({recipient:'narrator'}));
  assert.equal(result.delivered,true);
  const record=f.docs.get(root('campaignMailRuntime')+'/letters/'+result.id);
  assert.equal(record.recipientKind,'narrator');
  assert.equal(record.recipientHouseId,null);
  const other=fixture();
  await assert.rejects(()=>other.service().send(token,other.request({
    recipient:'h:h-unknown',
  })),expectCode('invalid_recipient',400));
});

test('reject malformed input and excessive content',async()=>{
  const f=fixture();
  for(const change of [
    {requestKey:'not-a-uuid'},
    {subject:' '},
    {content:''},
    {recipient:'h:../outside'},
    {recipient:'user:someone'},
    {content:'m'.repeat(12001)},
    {extraField:'unexpected'},
  ]){
    await assert.rejects(()=>f.service().send(token,f.request(change)),
      expectCode('invalid_request',400));
  }
});

test('disabled Auth and transaction-revoked membership refuse writes',async()=>{
  const f=fixture();
  f.auth.getUser=async()=>({uid,disabled:true});
  await assert.rejects(()=>f.service().send(token,f.request()),
    expectCode('authentication_required',401));
  f.auth.getUser=async()=>({uid,disabled:false});
  const old=f.db.runTransaction;
  f.db.runTransaction=async cb=>{
    f.docs.set(f.accessPath,{...f.docs.get(f.accessPath),editHouseIds:[]});
    return old(cb);
  };
  await assert.rejects(()=>f.service().send(token,f.request()),
    expectCode('access_denied',403));
});

test('status must never reveal composer to editorial or unapproved runtime',async()=>{
  const editor=fixture('editor');
  const status=await editor.service().status(token);
  assert.equal(status.ready,true);
  assert.equal(status.canCompose,false);
  assert.deepEqual(status.originHouseIds,[]);
});
