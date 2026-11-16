import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {
  CloudMailError,createCloudMailService,validateCloudMailRequest,
} from './cloud-mail-service.mjs';

const H=hash=>createHash('sha256').update(hash).digest('hex');
const SNAP='a'.repeat(64);
const TOKEN='firebase-cloud-test-token';
const BASE='campaignRuntime/'+SNAP;
const DOC=(name)=>name+'/'+SNAP;
const access=uid=>DOC('migrationDomainStage')+'/access/'+uid;
const house=id=>DOC('migrationDomainStage')+'/houses/'+H('house:'+id);
const current=DOC('migrationTimeEngineStage')+'/calendar/current';
const user=(role='jogador',extra={})=>({
  userId:'u-1',active:true,profile:role,admin:role==='narrador',
  playerId:role==='jogador'?'player-1':null,
  memberHouseIds:role==='jogador'?['h-a']:[],
  editHouseIds:role==='jogador'?['h-a']:[],
  requirePasswordChange:false,...extra,
});
const req=()=>({
  requestKey:'123e4567-e89b-42d3-a456-426614174000',
  originHouseId:'h-a',recipientHouseId:'h-b',
  toNarrator:false,subject:'Convite',content:'Uma carta de teste',
});
const err=async(action,code,status)=>{
  await assert.rejects(action,e=>
    e instanceof CloudMailError&&e.code===code&&e.status===status);
};

function fixture(profile='jogador'){
  const docs=new Map();
  for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage'])docs.set(DOC(name),{
      status:'complete',private:true,
    });
  docs.set(BASE,{
    status:'active',mode:'firebase-only',private:true,
    writesEnabled:true,sourceLiveReconciled:true,readyForCutover:true,
    sourceSnapshotId:SNAP,calendarVersion:8,
  });
  docs.set(access('u-1'),user(profile));
  docs.set(current,{year:1522,month:1,day:12,festival:null,version:8});
  for(const name of ['h-a','h-b'])docs.set(house(name),{
    sourceId:name,active:true,season:2,
  });

  const ref=path=>({
    path,
    collection:name=>col(path+'/'+name),
    get:async()=>snapshot(path),
  });
  const col=path=>({
    doc:id=>ref(path+'/'+id),
  });
  const snapshot=path=>({
    exists:docs.has(path),
    data:()=>docs.get(path),
  });
  let totalWrites=0,now=new Date('2026-11-16T12:00:00.000Z');
  const db={
    collection:col,
    async runTransaction(fn){
      const pending=[];
      const tx={
        get:async ref=>snapshot(ref.path),
        create:(ref,value)=>pending.push(['create',ref.path,value]),
        set:(ref,value)=>pending.push(['set',ref.path,value]),
      };
      const output=await fn(tx);
      for(const [type,path] of pending)
        if(type==='create'&&docs.has(path))throw Error('already_exists');
      for(const [,path,value] of pending){
        docs.set(path,value);totalWrites++;
      }
      return output;
    }
  };
  const auth={
    disabled:false,
    async verifyIdToken(t,revoked){
      assert.equal(revoked,true);
      if(t==='expired-token')throw Error('expired_token');
      return {uid:'u-1'};
    },
    async getUser(uid){return {uid,disabled:this.disabled};},
  };
  const service=(opts={})=>createCloudMailService({
    db,auth,snapshotId:SNAP,projectId:'cormyr',
    enabled:true,env:{},clock:()=>now,...opts,
  });
  return {docs,auth,db,service,setTime:d=>{now=new Date(d);},
    getWrites:()=>totalWrites};
}

test('Cloud-only writes default disabled, reject alternate project and emulator',()=>{
  const f=fixture(),config={
    db:f.db,auth:f.auth,snapshotId:SNAP,projectId:'cormyr',env:{},
  };
  assert.throws(()=>createCloudMailService(config),/firebase_cloud_mail_disabled/);
  assert.throws(()=>createCloudMailService({
    ...config,enabled:true,projectId:'demo-cormyr-migration',
  }),/firebase_cloud_mail_disabled/);
  assert.throws(()=>createCloudMailService({
    ...config,enabled:true,env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'},
  }),/firebase_cloud_mail_disabled/);
});

test('Request schema denies extra fields, ambiguous recipient and oversized text',()=>{
  assert.equal(validateCloudMailRequest(req()).subject,'Convite');
  for(const invalid of [
    {...req(),senderUid:'admin'},
    {...req(),toNarrator:true},
    {...req(),recipientHouseId:null,toNarrator:false},
    {...req(),requestKey:'not-a-uuid'},
    {...req(),subject:' '},
    {...req(),content:'x'.repeat(20_001)},
  ])assert.throws(()=>validateCloudMailRequest(invalid),
    e=>e instanceof CloudMailError&&e.status===400);
});

test('Snapshot immutable; only explicit reconciled Firebase-only runtime can write',async()=>{
  const f=fixture();
  f.docs.delete(BASE);
  await err(()=>f.service().send(TOKEN,req()),'cloud_mail_cutover_not_ready',503);
  assert.equal(f.getWrites(),0);
  f.docs.set(BASE,{status:'active',mode:'firebase-only',
    private:true,sourceSnapshotId:SNAP,calendarVersion:8,
    writesEnabled:true,sourceLiveReconciled:false,readyForCutover:false});
  await err(()=>f.service().send(TOKEN,req()),'cloud_mail_cutover_not_ready',503);
  assert.equal(f.getWrites(),0);
  f.docs.set(BASE,{...f.docs.get(BASE),sourceLiveReconciled:true,
    readyForCutover:true,calendarVersion:9});
  await err(()=>f.service().send(TOKEN,req()),'cloud_mail_cutover_not_ready',503);
  f.docs.set(BASE,{...f.docs.get(BASE),calendarVersion:8});
  f.docs.set(DOC('migrationAuthStage'),{status:'incomplete',private:true});
  await err(()=>f.service().send(TOKEN,req()),'migration_stage_not_ready',503);
  assert.equal(f.getWrites(),0);
});

test('Transactional delivery authorized to own editable House, not another House',async()=>{
  const f=fixture();
  const originSize=f.docs.size;
  const beforeHouses=new Map([...f.docs].filter(([key])=>key.startsWith('migration')));
  const sent=await f.service().send(TOKEN,req());
  assert.equal(sent.duplicate,false);
  assert.equal(sent.publicationState,'delivered');
  assert.deepEqual(sent.campaignDate,{
    year:1522,month:1,day:12,festival:null,calendarVersion:8,
  });
  const entry=f.docs.get(BASE+'/letters/'+sent.id);
  assert.equal(entry.senderUid,'u-1');
  assert.equal(entry.recipientKind,'house');
  assert.equal(entry.recipientHouseId,'h-b');
  assert.equal(entry.originHouseId,'h-a');
  assert.equal(entry.content,'Uma carta de teste');
  assert.equal(f.docs.size,originSize+2);
  assert.deepEqual(new Map([...f.docs].filter(([key])=>key.startsWith('migration'))),
    beforeHouses);

  f.setTime('2026-11-16T12:00:10.000Z');
  await err(()=>f.service().send(TOKEN,{
    ...req(),requestKey:randomUUID(),originHouseId:'h-b',
  }),'access_denied',403);
  assert.equal(f.getWrites(),2);
});

test('Idempotency cannot duplicate mail or bypass content changes',async()=>{
  const f=fixture();
  const sent=await f.service().send(TOKEN,req());
  const replay=await f.service().send(TOKEN,req());
  assert.equal(replay.duplicate,true);
  assert.equal(replay.id,sent.id);
  assert.equal(f.getWrites(),2);
  await err(()=>f.service().send(TOKEN,{
    ...req(),content:'OUTRO TEXTO',
  }),'idempotency_conflict',409);
  assert.equal(f.getWrites(),2);
});

test('Players may address narrator, but narrator can address Houses only',async()=>{
  const f=fixture();
  const letter=await f.service().send(TOKEN,{
    ...req(),toNarrator:true,recipientHouseId:null,
  });
  assert.equal(f.docs.get(BASE+'/letters/'+letter.id).recipientKind,'narrator');

  const g=fixture('narrador');
  await err(()=>g.service().send(TOKEN,req()),'access_denied',403);
  await err(()=>g.service().send(TOKEN,{
    ...req(),originHouseId:null,toNarrator:true,recipientHouseId:null,
  }),'access_denied',403);
  const narratorSent=await g.service().send(TOKEN,{
    ...req(),originHouseId:null,
  });
  assert.equal(g.docs.get(BASE+'/letters/'+narratorSent.id).senderName,'Narrador');
});

test('Editor, disabled Auth user, locked player and inactive House cannot send',async()=>{
  const editor=fixture('editor');
  await err(()=>editor.service().send(TOKEN,{
    ...req(),originHouseId:null,
  }),'access_denied',403);
  const disabled=fixture();
  disabled.auth.disabled=true;
  await err(()=>disabled.service().send(TOKEN,req()),
    'authentication_required',401);
  const locked=fixture();
  locked.docs.set(access('u-1'),user('jogador',{requirePasswordChange:true}));
  await err(()=>locked.service().send(TOKEN,req()),'access_denied',403);
  const missing=fixture();
  missing.docs.set(house('h-b'),{sourceId:'h-b',active:false,season:2});
  await err(()=>missing.service().send(TOKEN,req()),'house_unavailable',404);
});

test('Per-account rate limit protects outbound message delivery',async()=>{
  const f=fixture();
  await f.service().send(TOKEN,req());
  await err(()=>f.service().send(TOKEN,{
    ...req(),requestKey:randomUUID(),
  }),'mail_rate_limited',429);
  f.setTime('2026-11-16T12:00:10.000Z');
  const second=await f.service().send(TOKEN,{
    ...req(),requestKey:randomUUID(),
  });
  assert.equal(second.duplicate,false);
});

test('Quota rejects a 51st same-day message',async()=>{
  const f=fixture();
  f.docs.set(BASE+'/mailQuotas/'+H('cloud-mail-quota:u-1'),{
    day:'2026-11-16',count:50,lastSendAt:'2026-11-16T11:00:00.000Z',
  });
  await err(()=>f.service().send(TOKEN,req()),'mail_quota_exceeded',429);
  assert.equal(f.getWrites(),0);
});
