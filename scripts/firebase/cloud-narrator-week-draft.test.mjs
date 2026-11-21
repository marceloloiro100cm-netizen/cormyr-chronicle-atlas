import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseNarratorWeekDraft,planNarratorWeekDraft,planCalendarDateChange,
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

/* ---- Abertura semanal após o lançamento ---- */
async function launched(){
  const f=readyLaunch();
  await f.service.save('valid-token',request);
  f.data.delete('campaignNarratorDrafts/'+HASH+'/calendarAudit/audit-1');
  await f.service.publish('valid-token',{expectedDraftVersion:1,adoptFirebaseSource:true});
  f.data.delete('campaignNarratorDrafts/'+HASH+'/calendarAudit/audit-1');
  return f;
}
const advanceReq=(changes={})=>({expectedCalendarVersion:5,expectedOpenRound:3,
  proposedDate:{year:1522,month:0,day:21,festival:null},
  reason:'Abertura da próxima désdia pelo Narrador',requestKey:'advance-key-01',...changes});

test('advance opens exactly the next round, moves both runtimes and keeps mail aligned',async()=>{
  const {service,data}=await launched();
  const r=await service.advance('valid-token',advanceReq());
  assert.deepEqual([r.openRound,r.calendar.day,r.calendar.version,r.monthsCrossed],[4,21,6,0]);
  const live=data.get('campaignCloudRuntime/'+HASH),gate=data.get('campaignMailRuntime/'+HASH);
  assert.equal(live.openRound,4);assert.equal(gate.openRound,4);
  assert.equal(gate.calendarVersion,6);assert.equal(live.publishedTimeVersion,6);
  const view=await service.get('valid-token');
  assert.equal(view.mailEnabled,true);assert.equal(view.openRound,4);
  // Repetir a mesma solicitação não abre outra semana.
  const again=await service.advance('valid-token',advanceReq());
  assert.equal(again.duplicate,true);assert.equal(data.get('campaignCloudRuntime/'+HASH).openRound,4);
  const hist=await service.history('valid-token');
  assert.equal(hist[0].action,'advance_week');
  assert.deepEqual([hist[0].fromRound,hist[0].toRound],[3,4]);
  assert.ok(!JSON.stringify(hist).includes('narrator-1'),'sem UID no histórico');
});

test('advance refuses stale versions, backdating, skipped acknowledgement and non-narrators',async()=>{
  const {service,data}=await launched();
  await assert.rejects(service.advance('valid-token',advanceReq({expectedCalendarVersion:4})),e=>e.code==='calendar_version_conflict');
  await assert.rejects(service.advance('valid-token',advanceReq({expectedOpenRound:2})),e=>e.code==='calendar_version_conflict');
  await assert.rejects(service.advance('valid-token',advanceReq({proposedDate:{year:1522,month:0,day:1,festival:null}})),e=>e.code==='advance_backdate_forbidden');
  await assert.rejects(service.advance('valid-token',advanceReq({proposedDate:{year:1522,month:1,day:1,festival:null}})),e=>e.code==='house_effects_acknowledgement_required');
  await assert.rejects(service.advance('valid-token',advanceReq({requestKey:'x'})),e=>e.code==='advance_invalid_request');
  const ok=await service.advance('valid-token',advanceReq({proposedDate:{year:1522,month:1,day:1,festival:null},
    acknowledgeHouseEffectsPending:true,requestKey:'advance-key-02'}));
  assert.equal(ok.monthsCrossed,1);
  assert.equal(data.get('campaignCloudRuntime/'+HASH).pendingHouseEffectMonths,1);
  for(const config of [{profile:'jogador'},{profile:'editor'}]){
    const other=readyLaunch(config);
    await assert.rejects(other.service.advance('valid-token',advanceReq()));
  }
});

test('advance is impossible before the campaign launch',async()=>{
  const {service}=readyLaunch();
  await service.save('valid-token',request);
  await assert.rejects(service.advance('valid-token',advanceReq()),e=>e.code==='campaign_not_launched');
});

test('opening the week publishes pending calendar events; explicit publish also works',async()=>{
  const {service,data}=await launched();
  const ev='campaignCloudRuntime/'+HASH+'/scheduleEvents/evt-1';
  data.set(ev,{id:'evt-1',version:1,draft:{date:'1522-01-25',title:'Feira',description:'',deleted:false},published:null});
  const r=await service.advance('valid-token',advanceReq());
  assert.equal(r.publishedEvents,1);
  assert.deepEqual(data.get(ev).published,{date:'1522-01-25',title:'Feira',description:''});
  data.set(ev,{...data.get(ev),draft:{date:'1522-01-25',title:'Feira',description:'',deleted:true}});
  data.delete('campaignNarratorDrafts/'+HASH+'/calendarAudit/audit-1');
  assert.equal((await service.publishEvents('valid-token')).published,1);
  assert.equal(data.get(ev).published,null);
});

test('virada anual gera uma auditoria por ano e retry não duplica eventos',async()=>{
 const {service,data}=await launched();
 const root='campaignCloudRuntime/'+HASH;
 const live=data.get(root);
 data.set(root,{...live,
  calendar:{year:1522,month:11,day:20,festival:null,version:5},
  calendarVersion:5});
 const request={expectedCalendarVersion:5,expectedOpenRound:3,
  proposedDate:{year:1523,month:0,day:1,festival:null},
  reason:'Abertura do novo ano do calendário oficial',
  requestKey:'year-turn-1523-0001',acknowledgeHouseEffectsPending:true};
 const advanced=await service.advance('valid-token',request);
 assert.equal(advanced.calendar.year,1523);
 const prefix=root+'/characterYearTransitions/';
 const before=[...data].filter(([path])=>path.startsWith(prefix));
 assert.equal(before.length,1);
 assert.equal(before[0][1].fromYear,1522);
 assert.equal(before[0][1].toYear,1523);
 assert.equal(before[0][1].calendarVersion,6);
 assert.equal(before[0][1].actor,'narrator-1');
 const retry=await service.advance('valid-token',request);
 assert.equal(retry.duplicate,true);
 assert.equal([...data].filter(([path])=>path.startsWith(prefix)).length,1);
 assert.equal(data.get('migrationTimeEngineStage/'+HASH+'/calendar/current').year,1522);
});

/* ---- Data oficial independente da semana de correspondência ---- */
const dateChangeReq=(changes={})=>({
 expectedCalendarVersion:5,expectedOpenRound:3,
 proposedDate:{year:1522,month:0,day:12,festival:null},
 reason:'Correção independente do dia oficial pelo Narrador',
 requestKey:'date-change-unique-01',...changes,
});

test('independent date command keeps mail round and archive unchanged and audits once',async()=>{
 const {service,data}=await launched();
 const source='migrationTimeEngineStage/'+HASH+'/calendar/current';
 const historical=JSON.stringify(data.get(source));
 const event='campaignCloudRuntime/'+HASH+'/scheduleEvents/evt-test';
 data.set(event,{id:'evt-test',version:1,
  draft:{date:'1522-01-14',title:'Evento rascunho',description:'',deleted:false},
  published:null});
 const result=await service.changeDate('valid-token',dateChangeReq());
 assert.equal(result.changed,true);
 assert.equal(result.openRound,3);
 assert.equal(result.calendar.day,12);
 assert.equal(result.calendar.version,6);
 assert.equal(data.get('campaignCloudRuntime/'+HASH).openRound,3);
 assert.equal(data.get('campaignMailRuntime/'+HASH).openRound,3);
 assert.equal(data.get('campaignMailRuntime/'+HASH).calendarVersion,6);
 assert.equal(data.get('campaignCloudRuntime/'+HASH).publishedTimeVersion,6);
 assert.equal(JSON.stringify(data.get(source)),historical);
 assert.equal(data.get(event).published,null,'date edit must not publish event drafts');
 const view=await service.get('valid-token');
 assert.equal(view.calendarPublished,true);
 assert.equal(view.mailEnabled,true);
 assert.equal(view.openRound,3);
 const history=await service.history('valid-token');
 assert.equal(history[0].action,'set_calendar_date');
 assert.deepEqual([history[0].fromRound,history[0].toRound],[3,3]);
 const again=await service.changeDate('valid-token',dateChangeReq());
 assert.equal(again.duplicate,true);
 assert.equal(data.get('campaignCloudRuntime/'+HASH).calendarVersion,6);
});

test('date-only command rejects stale version, unsafe regressions and invalid scope',async()=>{
 const {service}=await launched();
 for(const changes of [{expectedCalendarVersion:4},{expectedOpenRound:2}]){
  await assert.rejects(service.changeDate('valid-token',dateChangeReq(changes)),
   e=>e.code==='calendar_version_conflict'&&e.status===409);
 }
 await assert.rejects(service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1522,month:0,day:11,festival:null},
 })),e=>e.code==='date_unchanged');
 await assert.rejects(service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1522,month:0,day:10,festival:null},
 })),e=>e.code==='date_backdate_acknowledgement_required');
 await assert.rejects(service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1521,month:11,day:30,festival:null},
  allowBackdate:true,acknowledgeIrreversibleEffects:true,
 })),e=>e.code==='historical_month_reversal_forbidden');
 await assert.rejects(service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1522,month:1,day:1,festival:null},
 })),e=>e.code==='house_effects_acknowledgement_required');
 await assert.rejects(service.changeDate('valid-token',dateChangeReq({
  requestKey:'short',
 })),e=>e.code==='date_change_invalid_request');
 await assert.rejects(service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1522,month:13,day:1,festival:null},
 })),e=>e.code==='draft_date_invalid');
 const accepted=await service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1522,month:0,day:10,festival:null},
  allowBackdate:true,acknowledgeIrreversibleEffects:true,
 }));
 assert.equal(accepted.openRound,3);
 assert.equal(accepted.calendar.day,10);
 for(const config of [{profile:'editor'},{profile:'jogador'},{active:false}]){
  const f=readyLaunch(config);
  await assert.rejects(f.service.changeDate('valid-token',dateChangeReq()));
 }
});

test('date-only month and year transition records pending effects without opening a week',async()=>{
 const {service,data}=await launched();
 const root='campaignCloudRuntime/'+HASH;
 const live=data.get(root);
 data.set(root,{...live,calendar:{year:1522,month:11,day:30,festival:null,version:5},
  calendarVersion:5});
 const result=await service.changeDate('valid-token',dateChangeReq({
  proposedDate:{year:1523,month:0,day:1,festival:null},
  acknowledgeHouseEffectsPending:true,requestKey:'date-1523-transition',
 }));
 assert.equal(result.openRound,3);
 assert.equal(result.monthsCrossed,1);
 assert.equal(result.calendar.year,1523);
 assert.equal(data.get(root).pendingHouseEffectMonths,1);
 assert.equal(data.get('campaignMailRuntime/'+HASH).openRound,3);
 const transitions=[...data].filter(([k])=>k.startsWith(root+'/characterYearTransitions/'));
 assert.equal(transitions.length,1);
 assert.equal(transitions[0][1].fromYear,1522);
 assert.equal(transitions[0][1].toYear,1523);
 assert.equal(data.get('migrationTimeEngineStage/'+HASH+'/calendar/current').year,1522);
});

test('pure date planner enforces mail round and month boundaries',()=>{
 const live={calendar:{year:1522,month:9,day:20,festival:null,version:3},
  calendarVersion:3,openRound:3};
 const req={expectedCalendarVersion:3,expectedOpenRound:3,
  proposedDate:{year:1522,month:9,day:21,festival:null},
  reason:'Mudar para a terceira désdia em Marpenoth'};
 assert.deepEqual(planCalendarDateChange({live,request:req}).openRound,3);
 rejectCode(()=>planCalendarDateChange({live,request:{...req,expectedOpenRound:4}}),
  'calendar_version_conflict',409);
 rejectCode(()=>planCalendarDateChange({live,request:{...req,
  proposedDate:{year:1522,month:8,day:30,festival:null},
  allowBackdate:true,acknowledgeIrreversibleEffects:true}}),
 'historical_month_reversal_forbidden',400);
});
