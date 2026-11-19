import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseNarratorWeekDraft,planNarratorWeekDraft,
  NarratorWeekDraftError} from './cloud-narrator-week-draft.mjs';

const HASH='c'.repeat(64);
const historical={year:1522,month:0,day:1,festival:null,version:4,lastRound:2};
const request={
  expectedCalendarVersion:4,expectedDraftVersion:0,
  proposedDate:{year:1522,month:0,day:11,festival:null},
  openRound:3,reason:'Semana escolhida pelo Narrador para homologação',
};
const args={archivedCalendar:historical,previous:null,request,
  actorUid:'narrator-1',at:'2026-11-18T22:00:00Z'};
const rejectCode=(fn,code,status)=>assert.throws(fn,e=>
  e instanceof NarratorWeekDraftError&&e.code===code&&e.status===status);

test('draft contains no live runtime approval or imported calendar write',()=>{
  const p=planNarratorWeekDraft(args);
  assert.equal(p.status,'pending');
  assert.equal(p.applied,false);
  assert.equal(p.currentRoundApproved,false);
  assert.equal(p.sourceDeltaReconciled,false);
  assert.equal(p.proposedOpenRound,3);
  assert.equal(p.expectedCalendarVersion,4);
  assert.equal(p.draftVersion,1);
  assert.equal(historical.lastRound,2);
});

test('archive/draft concurrency cannot silently overwrite changes',()=>{
  rejectCode(()=>planNarratorWeekDraft({...args,request:{
    ...request,expectedCalendarVersion:5,
  }}),'calendar_version_conflict',409);
  rejectCode(()=>planNarratorWeekDraft({...args,previous:{
    ...planNarratorWeekDraft(args),draftVersion:3,
  }}),'draft_version_conflict',409);
  rejectCode(()=>planNarratorWeekDraft({...args,previous:{
    ...planNarratorWeekDraft(args),status:'active',
  }}),'draft_state_conflict',409);
});

test('reject impossible dates, absent round and weak reason',()=>{
  for(const invalid of [
    {...request,proposedDate:{year:1522,month:12,day:1,festival:null}},
    {...request,proposedDate:{year:1523,month:6,day:30,festival:'shieldmeet'}},
  ])rejectCode(()=>planNarratorWeekDraft({...args,request:invalid}),
    'draft_date_invalid',400);
  rejectCode(()=>planNarratorWeekDraft({...args,request:{
    ...request,openRound:0,
  }}),'draft_round_invalid',400);
  rejectCode(()=>planNarratorWeekDraft({...args,request:{
    ...request,reason:'ok',
  }}),'draft_reason_invalid',400);
});

function fixture({profile='narrador',active=true,disabled=false}={}){
  const data=new Map();
  const set=(p,v)=>data.set(p,v);
  for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage'])
    set(name+'/'+HASH,{status:'complete',private:true});
  set('migrationDomainStage/'+HASH+'/access/narrator-1',{
    userId:'narrator-1',active,profile,admin:profile==='narrador',
    requirePasswordChange:false,
  });
  set('migrationTimeEngineStage/'+HASH+'/calendar/current',historical);
  const ref=path=>({
    path,collection(name){return ref(path+'/'+name);},
    doc(name){return ref(path+'/'+name);},
    limit(n){return {...ref(path),query:true,max:n};},
  });
  const db={
    collection(name){return ref(name);},
    async runTransaction(cb){
      const writes=[];
      const tx={
        async get(r){
          if(r.query)return {docs:[...data].filter(([p])=>p.startsWith(r.path+'/')).slice(0,r.max).map(([p,v])=>({id:p.split('/').at(-1),data:()=>v}))};
          const value=data.get(r.path);
          return {exists:value!==undefined,data:()=>value};
        },
        set(r,v){writes.push([r.path,v]);},
        create(r,v){if(data.has(r.path))throw Error('already exists');writes.push([r.path,v]);},
      };
      const result=await cb(tx);
      for(const [path,value] of writes)data.set(path,value);
      return result;
    },
  };
  const auth={
    async verifyIdToken(token){if(token!=='valid-token')throw Error('bad');return {uid:'narrator-1'};},
    async getUser(uid){return {uid,disabled};},
  };
  const service=createFirebaseNarratorWeekDraft({
    db,auth,projectId:'cormyr',snapshotId:HASH,enabled:true,env:{},
    now:()=> '2026-11-18T22:00:00.000Z',
    newId:()=> 'audit-1',
  });
  return {service,data};
}

test('authorized Narrator can store a pending Firestore proposal with audit',async()=>{
  const {service,data}=fixture();
  const before=await service.get('valid-token');
  assert.equal(before.archivedCalendar.version,4);
  assert.equal(before.draft,null);
  const saved=await service.save('valid-token',request);
  assert.equal(saved.saved,true);
  assert.equal(saved.draft.proposedOpenRound,3);
  assert.equal(saved.calendarPublished,false);
  assert.equal(data.get('migrationTimeEngineStage/'+HASH+'/calendar/current').day,1);
  assert.equal(data.has('campaignCloudRuntime/'+HASH),false);
  assert.equal(data.has('campaignMailRuntime/'+HASH),false);
  assert.equal(data.get('campaignNarratorDrafts/'+HASH+'/calendar/current').status,'pending');
  assert.equal(data.get('campaignNarratorDrafts/'+HASH+'/calendarAudit/audit-1').applied,false);
  await assert.rejects(service.save('valid-token',request),
    e=>e.code==='draft_version_conflict'&&e.status===409);
});

test('invalid, disabled or non-Narrator users cannot read or write drafts',async()=>{
  for(const config of [{disabled:true},{profile:'jogador'},{active:false}]){
    const {service,data}=fixture(config);
    await assert.rejects(service.get('valid-token'));
    await assert.rejects(service.save('valid-token',request));
    assert.equal(data.has('campaignNarratorDrafts/'+HASH+'/calendar/current'),false);
  }
  const {service}=fixture();
  await assert.rejects(service.save('bad-token',request),
    e=>e.code==='authentication_required'&&e.status===401);
});

test('service refuses absent flags, invalid project and emulators',()=>{
  rejectCode(()=>createFirebaseNarratorWeekDraft({
    projectId:'cormyr',snapshotId:HASH,enabled:false,
  }),'draft_service_disabled',503);
  rejectCode(()=>createFirebaseNarratorWeekDraft({
    projectId:'other',snapshotId:HASH,enabled:true,
  }),'draft_service_disabled',503);
});

function readyLaunch(config={}){
  const f=fixture(config);
  f.data.set('campaignCloudRuntime/'+HASH,{status:'pending',private:true,
    sourceSnapshotId:HASH,applicationEnabled:false,mailWriteApproved:false});
  f.data.set('campaignMailRuntime/'+HASH,{status:'pending',private:true,
    sourceSnapshotId:HASH,applicationEnabled:false,mailEnabled:false});
  f.data.set('migrationNewspaperRuntimeStage/'+HASH,{status:'complete',private:true});
  f.data.set('migrationNewspaperRuntimeStage/'+HASH+'/editions/imported',
    {editionNo:7});
  return f;
}
test('launch publishes selected baseline, mail and newspaper sequence atomically; import unchanged',async()=>{
  const {service,data}=readyLaunch();
  const historicalBefore=JSON.stringify(data.get('migrationTimeEngineStage/'+HASH+'/calendar/current'));
  await service.save('valid-token',request);
  // Fixture audit ID is fixed: use a different slot for the launch audit.
  data.delete('campaignNarratorDrafts/'+HASH+'/calendarAudit/audit-1');
  const result=await service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true});
  assert.equal(result.calendar.day,11);
  assert.equal(result.calendar.version,5);
  assert.equal(result.openRound,3);
  assert.equal(JSON.stringify(data.get('migrationTimeEngineStage/'+HASH+'/calendar/current')),historicalBefore);
  const runtime=data.get('campaignCloudRuntime/'+HASH);
  assert.equal(runtime.mailWriteApproved,true);
  assert.equal(runtime.nextNewspaperEditionNo,8);
  assert.equal(runtime.sourceAuthority,'owner_adopted_firebase');
  assert.equal(data.get('campaignMailRuntime/'+HASH).openRound,3);
  const again=await service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true});
  assert.equal(again.duplicate,true);
  assert.equal((await service.get('valid-token')).editable,false);
  await assert.rejects(service.save('valid-token',{...request,expectedDraftVersion:1}),e=>e.status===409);
});
test('launch rejects missing confirmation, stale draft, wrong role and existing active runtime',async()=>{
  for(const config of [{profile:'jogador'},{profile:'editor'},{disabled:true}]){
    const {service}=readyLaunch(config);
    await assert.rejects(service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true}));
  }
  const {service,data}=readyLaunch();
  await service.save('valid-token',request);
  await assert.rejects(service.publish('valid-token',{expectedDraftVersion:1}),e=>e.status===400);
  await assert.rejects(service.publish('valid-token',{expectedDraftVersion:2,adoptFirebaseSource:true}),e=>e.status===409);
  data.set('campaignCloudRuntime/'+HASH,{status:'active'});
  await assert.rejects(service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true}),e=>e.status===409);
  assert.equal(data.get('campaignMailRuntime/'+HASH).applicationEnabled,false);
});
test('invalid imported edition sequence aborts without partial runtime writes',async()=>{
  const {service,data}=readyLaunch();
  await service.save('valid-token',request);
  data.set('migrationNewspaperRuntimeStage/'+HASH+'/editions/imported',{editionNo:'7'});
  await assert.rejects(service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true}),e=>e.status===503);
  assert.equal(data.get('campaignCloudRuntime/'+HASH).status,'pending');
  assert.equal(data.get('campaignMailRuntime/'+HASH).status,'pending');
});


test('narrator confirmation reads actual published Harptos date and both mail gates',async()=>{
  const {service,data}=readyLaunch();
  await service.save('valid-token',{
    ...request,proposedDate:{year:1522,month:0,day:21,festival:null},
    reason:'Abertura da terceira désdia e rodada três',
  });
  data.delete('campaignNarratorDrafts/'+HASH+'/calendarAudit/audit-1');
  await service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true});
  const published=await service.get('valid-token');
  assert.equal(published.calendarPublished,true);
  assert.equal(published.mailEnabled,true);
  assert.equal(published.openRound,3);
  assert.deepEqual(published.operationalCalendar,{
    year:1522,month:0,day:21,festival:null,version:5,
  });
  const mailKey='campaignMailRuntime/'+HASH;
  data.set(mailKey,{...data.get(mailKey),openRound:4});
  const blockedMail=await service.get('valid-token');
  assert.equal(blockedMail.calendarPublished,true);
  assert.equal(blockedMail.mailEnabled,false);
  const runtimeKey='campaignCloudRuntime/'+HASH;
  data.set(runtimeKey,{...data.get(runtimeKey),
    calendar:{year:1522,month:0,day:99,festival:null,version:5}});
  const invalidClock=await service.get('valid-token');
  assert.equal(invalidClock.calendarPublished,false);
  assert.equal(invalidClock.editable,false);
  assert.equal(invalidClock.requiresReconciliation,true);
  assert.equal(invalidClock.mailEnabled,false);
  assert.equal(invalidClock.operationalCalendar,null);
  assert.equal(invalidClock.openRound,null);
});
