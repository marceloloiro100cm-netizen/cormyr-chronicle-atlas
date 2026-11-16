import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CloudMailError,createFirebaseCloudMail} from './cloud-mail-service.mjs';

const snapshot='a'.repeat(64);
const h=x=>createHash('sha256').update(x).digest('hex');
const sampleToken='firebase-synthetic-valid-idtoken';
const req=(overrides={})=>({
  requestKey:'a-valid-key_1234',
  originHouseId:'house-a',recipientKind:'house',recipientHouseId:'house-b',
  subject:'Convite',content:'Solicitamos audiência',...overrides,
});
const doc=v=>({exists:v!==undefined,data:()=>v});

function fixture(role='jogador'){
  const records=new Map();
  const root=name=>records.set(name+'/'+snapshot,{status:'complete',private:true});
  ['migrationDomainStage','migrationAuthStage','migrationTimeEngineStage'].forEach(root);
  records.set('migrationTimeEngineStage/'+snapshot+'/calendar/current',{
    year:1522,month:0,day:10,festival:null,version:5,
  });
  records.set('campaignCloudRuntime/'+snapshot,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,mailWriteApproved:true,
    applicationEnabled:true,openRound:3,calendarVersion:5,
  });
  records.set('migrationDomainStage/'+snapshot+'/access/player-1',{
    userId:'player-1',profile:role,active:true,
    requirePasswordChange:false,admin:role==='narrador',
    playerId:role==='jogador'?'player-source-id':null,
    memberHouseIds:role==='jogador'?['house-a']:[],
    editHouseIds:role==='jogador'?['house-a']:[],
  });
  for(const name of ['house-a','house-b'])
    records.set('migrationDomainStage/'+snapshot+'/houses/'+h('house:'+name),{
      active:true,season:2,sourceId:name,name,
    });
  function node(path=''){
    return {
      path,
      collection(name){return node(path?path+'/'+name:name);},
      doc(id){return node(path+'/'+id);},
      async get(){return doc(records.get(path));},
    };
  }
  const db={
    collection:name=>node(name),
    async runTransaction(work){
      const writes=[];
      const tx={
        get:ref=>ref.get(),
        create(ref,value){writes.push({type:'create',path:ref.path,value});},
        update(ref,value){writes.push({type:'update',path:ref.path,value});},
      };
      const result=await work(tx);
      for(const w of writes){
        if(w.type==='create'&&records.has(w.path))
          throw Error('duplicate document');
        if(w.type==='update'&&!records.has(w.path))
          throw Error('missing document');
      }
      for(const w of writes){
        records.set(w.path,w.type==='create'?structuredClone(w.value):
          {...records.get(w.path),...structuredClone(w.value)});
      }
      return result;
    },
  };
  const auth={
    async verifyIdToken(value,revoked){
      assert.equal(revoked,true);
      if(value!=='firebase-synthetic-valid-idtoken')throw Error('revoked');
      return {uid:'player-1'};
    },
    async getUser(uid){return {uid,disabled:false};},
  };
  const service=(override={})=>createFirebaseCloudMail({
    db,auth,snapshotId:snapshot,projectId:'cormyr',enabled:true,
    env:{},clock:()=>'2026-11-16T12:34:56.000Z',...override,
  });
  return {records,db,auth,service};
}
async function rejects(fn,code,status=403){
  await assert.rejects(fn,e=>e instanceof CloudMailError&&
    e.code===code&&e.status===status);
}

test('Service is Cloud-only, explicit off by default and denies emulators',()=>{
  const {db,auth}=fixture();
  const p={db,auth,snapshotId:snapshot,projectId:'cormyr',env:{}};
  assert.throws(()=>createFirebaseCloudMail(p),/cloud_mail_disabled/);
  assert.throws(()=>createFirebaseCloudMail({...p,enabled:true,
    projectId:'demo-cormyr-migration'}),/cloud_mail_disabled/);
  assert.throws(()=>createFirebaseCloudMail({...p,enabled:true,
    env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}}),/cloud_mail_disabled/);
  assert.throws(()=>createFirebaseCloudMail({...p,enabled:true,
    snapshotId:'invalid'}),/cloud_mail_disabled/);
});

test('The enabled owner can send once; retries do not double-send or double-count',async()=>{
  const {records,service}=fixture();
  const before=[...records].filter(([k])=>k.startsWith('migration'));
  const srv=service();
  const a=await srv.send(sampleToken,req());
  assert.equal(a.duplicate,false);
  assert.equal(a.state,'delivered');
  assert.equal(a.deliveryRound,3);
  assert.match(a.id,/^[a-f0-9]{64}$/);
  const letter=records.get('campaignCloudRuntime/'+snapshot+'/letters/'+a.id);
  assert.equal(letter.senderUid,'player-1');
  assert.equal(letter.originHouseId,'house-a');
  assert.equal(letter.recipientHouseId,'house-b');
  assert.equal(letter.campaignDate,'1522-01-10');
  assert.equal(letter.publicationState,'delivered');
  assert.equal(letter.source,'firebase-cloud');
  assert.equal(letter.content,'Solicitamos audiência');
  const b=await srv.send(sampleToken,req());
  assert.equal(b.duplicate,true);
  assert.equal(b.id,a.id);
  const prefix='campaignCloudRuntime/'+snapshot+'/mailSenderRoundCounts/';
  assert.equal([...records].find(([k])=>k.startsWith(prefix))[1].count,1);
  await rejects(()=>srv.send(sampleToken,req({subject:'Outra carta'})),
    'request_key_conflict',409);
  assert.deepEqual([...records].filter(([k])=>k.startsWith('migration')),before);
});

test('One private gate or stale calendar stops every write',async()=>{
  const f=fixture();
  const key='campaignCloudRuntime/'+snapshot;
  const base=f.records.get(key);
  for(const field of ['sourceSnapshotReconciled','mailWriteApproved','applicationEnabled']){
    f.records.set(key,{...base,[field]:false});
    await rejects(()=>f.service().send(sampleToken,req()),
      'mail_runtime_not_approved',503);
  }
  f.records.set(key,{...base,calendarVersion:4});
  await rejects(()=>f.service().send(sampleToken,req()),
    'mail_runtime_not_approved',503);
  f.records.set(key,base);
  f.records.set('migrationDomainStage/'+snapshot,{status:'incomplete',private:true});
  await rejects(()=>f.service().send(sampleToken,req()),
    'migration_stage_not_ready',503);
});

test('Disabled, revoked and access-inactive Firebase accounts cannot send',async()=>{
  const f=fixture();
  f.auth.getUser=async(uid)=>({uid,disabled:true});
  await rejects(()=>f.service().send(sampleToken,req()),
    'authentication_required',401);
  f.auth.getUser=async(uid)=>({uid,disabled:false});
  await rejects(()=>f.service().send('bad-token',req()),
    'authentication_required',401);
  const key='migrationDomainStage/'+snapshot+'/access/player-1';
  const raw=f.records.get(key);
  f.records.set(key,{...raw,active:false});
  await rejects(()=>f.service().send(sampleToken,req()),'access_denied');
  f.records.set(key,{...raw,requirePasswordChange:true});
  await rejects(()=>f.service().send(sampleToken,req()),'access_denied');
});

test('A player cannot send from another House or to a nonexisting House',async()=>{
  const f=fixture();
  await rejects(()=>f.service().send(sampleToken,
    req({originHouseId:'house-b'})),'origin_house_not_authorized');
  await rejects(()=>f.service().send(sampleToken,
    req({recipientHouseId:'house-c'})),'house_unavailable',404);
  await rejects(()=>f.service().send(sampleToken,
    req({originHouseId:null})),'origin_house_not_authorized');
});

test('Narrator is authorized only for House recipients, not narrator-to-narrator',async()=>{
  const f=fixture('narrador');
  const out=await f.service().send(sampleToken,
    req({originHouseId:null}));
  assert.equal(out.duplicate,false);
  await rejects(()=>f.service().send(sampleToken,
    req({recipientKind:'narrator',recipientHouseId:null,originHouseId:null,
      requestKey:'different-key-1'})),'invalid_origin_house',400);
  const editor=fixture('editor');
  await rejects(()=>editor.service().send(sampleToken,req()),'access_denied');
});

test('Players may address Narrator from their own authorized House',async()=>{
  const f=fixture();
  const result=await f.service().send(sampleToken,req({
    recipientKind:'narrator',recipientHouseId:null,
  }));
  const row=f.records.get('campaignCloudRuntime/'+snapshot+'/letters/'+result.id);
  assert.equal(row.recipientKind,'narrator');
  assert.equal(row.recipientHouseId,null);
});

test('Inputs are bounded and sender per-round limit is enforced',async()=>{
  const f=fixture();
  await rejects(()=>f.service().send(sampleToken,
    req({content:'a'.repeat(21_000)})),'invalid_mail_request',400);
  await rejects(()=>f.service().send(sampleToken,
    req({subject:' '*5})),'invalid_mail_request',400);
  await rejects(()=>f.service().send(sampleToken,
    req({requestKey:'x'})),'invalid_mail_request',400);
  const countId=h('mail-count:player-1:3');
  f.records.set('campaignCloudRuntime/'+snapshot+
    '/mailSenderRoundCounts/'+countId,{count:100,round:3,actorUid:'player-1'});
  await rejects(()=>f.service().send(sampleToken,req()),'mail_round_limit',429);
});

test('Status reveals no private campaign data and is denied to the editor',async()=>{
  const f=fixture();
  const status=await f.service().status(sampleToken);
  assert.equal(status.canSend,true);
  assert.deepEqual(status.originHouseIds,['house-a']);
  assert.ok(!JSON.stringify(status).includes('player-1'));
  const e=fixture('editor');
  await rejects(()=>e.service().status(sampleToken),'access_denied');
  f.records.get('campaignCloudRuntime/'+snapshot).mailWriteApproved=false;
  assert.equal((await f.service().status(sampleToken)).canSend,false);
});

test('Harptos festival yields the canonical, fixed campaign date',async()=>{
  const f=fixture();
  f.records.set('migrationTimeEngineStage/'+snapshot+'/calendar/current',{
    year:1522,month:0,day:1,festival:'midwinter',version:5,
  });
  const r=await f.service().send(sampleToken,req());
  const row=f.records.get('campaignCloudRuntime/'+snapshot+'/letters/'+r.id);
  assert.equal(row.campaignDate,'1522-F-midwinter');
});
