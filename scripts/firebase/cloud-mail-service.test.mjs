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
  records.set('campaignMailRuntime/'+snapshot,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceLiveReconciled:true,applicationEnabled:true,mailEnabled:true,
    openRound:3,calendarVersion:5,
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

test('No player mail operations survive missing, inactive or old-season Houses',async()=>{
  const f=fixture('jogador');
  const access='migrationDomainStage/'+snapshot+'/access/player-1';
  const house='migrationDomainStage/'+snapshot+'/houses/'+h('house:house-a');
  const originalAccess=f.records.get(access);
  const originalHouse=f.records.get(house);
  for(const changes of [
    {memberHouseIds:[],editHouseIds:[]},
    {memberHouseIds:['house-a','house-a'],editHouseIds:['house-a']},
    {memberHouseIds:['house-missing'],editHouseIds:['house-missing']},
    {memberHouseIds:['house-a'],editHouseIds:['house-a','house-a']},
  ]){
    f.records.set(access,{...originalAccess,...changes});
    await rejects(()=>f.service().status(sampleToken),'access_denied');
    await rejects(()=>f.service().send(sampleToken,req()),'access_denied');
    await rejects(()=>f.service().markRead(sampleToken,{
      source:'imported',letterId:'historical-001',
    }),'access_denied');
  }
  f.records.set(access,originalAccess);
  for(const changes of [
    {active:false},{season:1},{sourceId:'house-b'},
  ]){
    f.records.set(house,{...originalHouse,...changes});
    await rejects(()=>f.service().status(sampleToken),'access_denied');
    await rejects(()=>f.service().send(sampleToken,req()),'access_denied');
  }
  f.records.delete(house);
  await rejects(()=>f.service().send(sampleToken,req()),'access_denied');
  assert.equal([...f.records].some(([key])=>
    key.startsWith('campaignCloudRuntime/'+snapshot+'/letters/')),false);
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

test('Independent mail runtime must be approved for sends, replies and receipts',async()=>{
  const f=fixture();
  const path='campaignMailRuntime/'+snapshot;
  const approved=f.records.get(path);
  for(const [field,value] of [
    ['status','pending'],['private',false],
    ['sourceSnapshotId','b'.repeat(64)],
    ['sourceLiveReconciled',false],['applicationEnabled',false],
    ['mailEnabled',false],['openRound',4],['calendarVersion',4],
  ]){
    f.records.set(path,{...approved,[field]:value});
    assert.equal((await f.service().status(sampleToken)).canSend,false);
    await rejects(()=>f.service().send(sampleToken,req()),
      'mail_runtime_not_approved',503);
    await rejects(()=>f.service().markRead(sampleToken,{
      source:'imported',letterId:'historical-001',
    }),'mail_runtime_not_approved',503);
    await rejects(()=>f.service().reply(sampleToken,{
      requestKey:'a-valid-key_1234',letterId:'c'.repeat(64),
      content:'Resposta',
    }),'mail_runtime_not_approved',503);
    assert.equal([...f.records].some(([k])=>k.includes('/letters/')),false);
  }
  f.records.delete(path);
  assert.equal((await f.service().status(sampleToken)).canSend,false);
  await rejects(()=>f.service().send(sampleToken,req()),
    'mail_runtime_not_approved',503);
  f.records.set(path,approved);
  assert.equal((await f.service().status(sampleToken)).canSend,true);
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

test('Imported delivered mail records an individual receipt without changing migration snapshot',async()=>{
  const f=fixture();
  const importedId='historical-001';
  const path='migrationDomainStage/'+snapshot+'/letters/'+h('letter:'+importedId);
  const value={
    sourceId:importedId,publicationState:'delivered',deletedAt:null,
    senderUid:'external-author',recipientHouseId:'house-a',
    recipientPlayerId:null,subject:'Carta antiga',content:'Texto',
    createdAt:'2026-11-15T10:00:00Z',
  };
  f.records.set(path,value);
  const before=[...f.records].filter(([key])=>key.startsWith('migration'));
  const first=await f.service().markRead(sampleToken,{
    source:'imported',letterId:importedId,
  });
  assert.equal(first.recorded,true);
  assert.equal(first.alreadyRecorded,false);
  assert.equal(first.readAt,'2026-11-16T12:34:56.000Z');
  const second=await f.service().markRead(sampleToken,{
    source:'imported',letterId:importedId,
  });
  assert.equal(second.alreadyRecorded,true);
  assert.equal(second.readAt,first.readAt);
  const reads=[...f.records].filter(([key])=>
    key.startsWith('campaignCloudRuntime/'+snapshot+'/mailReadReceipts/'));
  assert.equal(reads.length,1);
  assert.equal(reads[0][1].viewerUid,'player-1');
  assert.deepEqual([...f.records].filter(([key])=>key.startsWith('migration')),before);
});

test('A player cannot mark unrelated, sent, deleted or draft letters as read',async()=>{
  const f=fixture();
  const root='migrationDomainStage/'+snapshot+'/letters/';
  const base={
    publicationState:'delivered',deletedAt:null,
    senderUid:'other-author',recipientPlayerId:null,
    recipientHouseId:'house-b',
  };
  for(const [id,changes] of [
    ['other-house',{}],
    ['own-sent',{senderUid:'player-1',recipientHouseId:'house-a'}],
    ['draft',{publicationState:'draft',recipientHouseId:'house-a'}],
    ['deleted',{deletedAt:'2026-11-16T10:00:00Z',recipientHouseId:'house-a'}],
    ['ambiguous',{recipientPlayerId:'player-source-id',recipientHouseId:'house-a'}],
  ])f.records.set(root+h('letter:'+id),{...base,sourceId:id,...changes});
  for(const id of ['other-house','own-sent','draft','deleted','ambiguous']){
    await rejects(()=>f.service().markRead(sampleToken,{
      source:'imported',letterId:id,
    }),'access_denied',403);
  }
  assert.equal([...f.records].filter(([k])=>k.includes('mailReadReceipts/')).length,0);
});

test('Firebase Cloud runtime letters use separate source and reject forged source',async()=>{
  const f=fixture();
  const id=h('cloud-letter');
  const path='campaignCloudRuntime/'+snapshot+'/letters/'+id;
  f.records.set(path,{
    id,source:'firebase-cloud',publicationState:'delivered',
    deletedAt:null,senderUid:'other-author',recipientKind:'house',
    recipientHouseId:'house-a',recipientPlayerId:null,
  });
  const first=await f.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:id,
  });
  assert.equal(first.alreadyRecorded,false);
  await rejects(()=>f.service().markRead(sampleToken,{
    source:'imported',letterId:id,
  }),'access_denied',403);
  await rejects(()=>f.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:'../private',
  }),'invalid_receipt_request',400);
  await rejects(()=>f.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:id,uid:'another',
  }),'invalid_receipt_request',400);
  const root='campaignCloudRuntime/'+snapshot;
  f.records.set(root,{...f.records.get(root),mailWriteApproved:false});
  await rejects(()=>f.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:id,
  }),'mail_runtime_not_approved',503);
});

test('Narrator may acknowledge narrator-addressed Cloud mail, not player-house mail',async()=>{
  const f=fixture('narrador');
  const root='campaignCloudRuntime/'+snapshot+'/letters/';
  const directId=h('to-narrator');
  const houseId=h('to-house');
  for(const [id,kind] of [[directId,'narrator'],[houseId,'house']]){
    f.records.set(root+id,{
      id,source:'firebase-cloud',publicationState:'delivered',deletedAt:null,
      senderUid:'player-other',recipientKind:kind,
      recipientHouseId:kind==='narrator'?null:'house-a',
      recipientPlayerId:null,
    });
  }
  assert.equal((await f.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:directId,
  })).recorded,true);
  await rejects(()=>f.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:houseId,
  }),'access_denied',403);
  const editor=fixture('editor');
  editor.records.set(root+directId,f.records.get(root+directId));
  await rejects(()=>editor.service().markRead(sampleToken,{
    source:'firebase-cloud',letterId:directId,
  }),'access_denied',403);
});

test('Revoked account and in-transaction membership change fail closed on read receipt',async()=>{
  const f=fixture();
  const id='membership-check';
  f.records.set('migrationDomainStage/'+snapshot+'/letters/'+h('letter:'+id),{
    sourceId:id,publicationState:'delivered',deletedAt:null,
    senderUid:'someone-else',recipientPlayerId:null,recipientHouseId:'house-a',
  });
  f.auth.getUser=async uid=>({uid,disabled:true});
  await rejects(()=>f.service().markRead(sampleToken,{source:'imported',letterId:id}),
    'authentication_required',401);
  f.auth.getUser=async uid=>({uid,disabled:false});
  f.records.set('migrationDomainStage/'+snapshot+'/access/player-1',{
    ...f.records.get('migrationDomainStage/'+snapshot+'/access/player-1'),
    memberHouseIds:[],editHouseIds:[],
  });
  await rejects(()=>f.service().markRead(sampleToken,{source:'imported',letterId:id}),
    'access_denied',403);
});


test('Recipient House replies atomically to author House without client routing',async()=>{
  const f=fixture();
  const originalId=h('received-from-b');
  const root='campaignCloudRuntime/'+snapshot+'/';
  const incoming={
    id:originalId,source:'firebase-cloud',sourceSnapshotId:snapshot,
    publicationState:'delivered',deletedAt:null,senderUid:'writer-b',
    originHouseId:'house-b',recipientKind:'house',
    recipientHouseId:'house-a',recipientPlayerId:null,
    subject:'Convite de outro feudo',content:'Saudações',
  };
  f.records.set(root+'letters/'+originalId,incoming);
  const before=[...f.records].filter(([p])=>p.startsWith('migration'));
  const first=await f.service().reply(sampleToken,{
    requestKey:'reply-to-b-001',letterId:originalId,content:'Recebido com honra',
  });
  assert.equal(first.duplicate,false);
  const written=f.records.get(root+'letters/'+first.id);
  assert.equal(written.replyToId,originalId);
  assert.equal(written.originHouseId,'house-a');
  assert.equal(written.recipientKind,'house');
  assert.equal(written.recipientHouseId,'house-b');
  assert.equal(written.subject,'Re: Convite de outro feudo');
  assert.equal(written.content,'Recebido com honra');
  assert.equal(f.records.get(root+'mailAudits/'+first.id).action,'reply');
  const second=await f.service().reply(sampleToken,{
    requestKey:'reply-to-b-001',letterId:originalId,content:'Recebido com honra',
  });
  assert.equal(second.duplicate,true);
  assert.equal(first.id,second.id);
  await rejects(()=>f.service().reply(sampleToken,{
    requestKey:'reply-to-b-001',letterId:originalId,content:'Texto diferente',
  }),'request_key_conflict',409);
  assert.equal(f.records.get(root+'mailSenderRoundCounts/'+h('mail-count:player-1:3')).count,1);
  assert.deepEqual([...f.records].filter(([p])=>p.startsWith('migration')),before);
});

test('Narrator replies only to a letter addressed to Narrator',async()=>{
  const f=fixture('narrador'),id=h('house-to-gm');
  const root='campaignCloudRuntime/'+snapshot+'/';
  f.records.set(root+'letters/'+id,{
    id,source:'firebase-cloud',sourceSnapshotId:snapshot,
    publicationState:'delivered',deletedAt:null,senderUid:'player-other',
    originHouseId:'house-a',recipientKind:'narrator',
    recipientHouseId:null,recipientPlayerId:null,
    subject:'Petição',content:'Solicitamos audiência',
  });
  const response=await f.service().reply(sampleToken,{
    requestKey:'narrator-reply-1',letterId:id,content:'Audiência concedida',
  });
  const letter=f.records.get(root+'letters/'+response.id);
  assert.equal(letter.originHouseId,null);
  assert.equal(letter.recipientKind,'house');
  assert.equal(letter.recipientHouseId,'house-a');
  assert.equal(letter.replyToId,id);
});

test('Reply rejects forged direction, foreign House, sent, draft and deleted letters',async()=>{
  const f=fixture(),root='campaignCloudRuntime/'+snapshot+'/letters/';
  const cases=[
    ['foreign-house',{recipientHouseId:'house-b'}],
    ['sender',{senderUid:'player-1'}],
    ['draft',{publicationState:'draft'}],
    ['deleted',{deletedAt:'2026-11-16T11:00:00Z'}],
    ['foreign-snapshot',{sourceSnapshotId:'b'.repeat(64)}],
    ['source-imported',{source:'imported'}],
    ['different-recipient',{recipientKind:'narrator',recipientHouseId:null}],
    ['invalid-origin',{originHouseId:'../danger'}],
    ['same-house',{originHouseId:'house-a'}],
  ];
  const base={
    source:'firebase-cloud',sourceSnapshotId:snapshot,
    publicationState:'delivered',deletedAt:null,senderUid:'external-player',
    originHouseId:'house-b',recipientKind:'house',recipientHouseId:'house-a',
    recipientPlayerId:null,subject:'Pedido',content:'Responda',
  };
  for(const [k,override] of cases){
    const id=h(k);
    f.records.set(root+id,{...base,...override,id});
    await rejects(()=>f.service().reply(sampleToken,{
      requestKey:'reply-'+k+'-01',letterId:id,content:'Resposta',
    }),'reply_not_authorized');
  }
  await rejects(()=>f.service().reply(sampleToken,{
    requestKey:'reply-missing-1',letterId:h('missing'),content:'Resposta',
  }),'reply_not_authorized');
  assert.equal([...f.records].filter(([k])=>k.includes('/mailAudits/')).length,0);
});

test('Reply refuses extra browser-selected destinations, bad IDs and missing edit scope',async()=>{
  const f=fixture();
  const id=h('reply-scope'),root='campaignCloudRuntime/'+snapshot+'/';
  f.records.set(root+'letters/'+id,{
    id,source:'firebase-cloud',sourceSnapshotId:snapshot,
    publicationState:'delivered',deletedAt:null,senderUid:'other',
    originHouseId:'house-b',recipientKind:'house',recipientHouseId:'house-a',
    recipientPlayerId:null,subject:'Hello',content:'World',
  });
  for(const input of [
    {requestKey:'reply-scope-1',letterId:id,content:'Okay',recipientHouseId:'house-c'},
    {requestKey:'reply-scope-1',letterId:'../hidden',content:'Okay'},
    {requestKey:'reply-scope-1',letterId:id,content:''},
    {requestKey:'short',letterId:id,content:'Okay'},
  ])await rejects(()=>f.service().reply(sampleToken,input),'invalid_reply_request',400);
  const access='migrationDomainStage/'+snapshot+'/access/player-1';
  f.records.set(access,{...f.records.get(access),
    memberHouseIds:['house-a'],editHouseIds:[]});
  await rejects(()=>f.service().reply(sampleToken,{
    requestKey:'reply-scope-2',letterId:id,content:'Okay',
  }),'reply_not_authorized');
  const editor=fixture('editor');
  editor.records.set(root+'letters/'+id,f.records.get(root+'letters/'+id));
  await rejects(()=>editor.service().reply(sampleToken,{
    requestKey:'reply-editor-1',letterId:id,content:'Okay',
  }),'access_denied');
});

test('Reply fails closed on runtime revocation and cannot bypass round limits',async()=>{
  const f=fixture(),id=h('reply-gated'),root='campaignCloudRuntime/'+snapshot+'/';
  f.records.set(root+'letters/'+id,{
    id,source:'firebase-cloud',sourceSnapshotId:snapshot,
    publicationState:'delivered',deletedAt:null,senderUid:'writer-b',
    originHouseId:'house-b',recipientKind:'house',recipientHouseId:'house-a',
    recipientPlayerId:null,subject:'Convite',content:'Olá',
  });
  const live=f.records.get(root.slice(0,-1));
  f.records.set(root.slice(0,-1),{...live,sourceSnapshotReconciled:false});
  await rejects(()=>f.service().reply(sampleToken,{
    requestKey:'reply-gated-1',letterId:id,content:'Resposta',
  }),'mail_runtime_not_approved',503);
  f.records.set(root.slice(0,-1),live);
  f.records.set(root+'mailSenderRoundCounts/'+h('mail-count:player-1:3'),{
    count:100,round:3,actorUid:'player-1',
  });
  await rejects(()=>f.service().reply(sampleToken,{
    requestKey:'reply-gated-1',letterId:id,content:'Resposta',
  }),'mail_round_limit',429);
  f.auth.getUser=async(uid)=>({uid,disabled:true});
  await rejects(()=>f.service().reply(sampleToken,{
    requestKey:'reply-gated-1',letterId:id,content:'Resposta',
  }),'authentication_required',401);
});
