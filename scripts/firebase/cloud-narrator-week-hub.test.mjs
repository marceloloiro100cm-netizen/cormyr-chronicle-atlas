import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseNarratorWeekDraft,undoBlocker,planEventPublication,seasonsOf}
  from './cloud-narrator-week-draft.mjs';

/* Hub Temporal V2.1: volta no tempo, desfazer, temporadas, festivais e ajustes. */
const HASH='d'.repeat(64);
const D=(year,month,day,festival=null)=>({year,month,day,festival});

function fixture(){
  const data=new Map();
  let seq=0;
  for(const name of ['migrationDomainStage','migrationAuthStage','migrationTimeEngineStage'])
    data.set(name+'/'+HASH,{status:'complete',private:true});
  data.set('migrationDomainStage/'+HASH+'/access/narrator-1',{userId:'narrator-1',active:true,
    profile:'narrador',admin:true,requirePasswordChange:false});
  data.set('migrationTimeEngineStage/'+HASH+'/calendar/current',{year:1522,month:9,day:1,festival:null,version:4});
  const cal={year:1522,month:9,day:15,festival:null,version:5};
  data.set('campaignCloudRuntime/'+HASH,{status:'active',private:true,calendarSource:'operational',
    sourceSnapshotId:HASH,sourceSnapshotReconciled:true,applicationEnabled:true,
    sourceAuthority:'owner_adopted_firebase',calendar:cal,calendarVersion:5,openRound:3,
    publishedTimeVersion:5,publicTimeApproved:true,mailWriteApproved:true,launchDraftVersion:1});
  data.set('campaignMailRuntime/'+HASH,{status:'active',private:true,sourceSnapshotId:HASH,
    applicationEnabled:true,mailEnabled:true,sourceLiveReconciled:true,calendarVersion:5,openRound:3});
  const query=(path,filters=[],max=Infinity)=>({path,query:true,filters,max,
    where(field,op,value){return query(path,[...filters,[field,value]],max);},
    limit(n){return query(path,filters,n);},
    select(){return query(path,filters,max);}});
  const ref=path=>({path,id:path.split('/').at(-1),
    collection(name){return ref(path+'/'+name);},doc(name){return ref(path+'/'+name);},
    where(f,o,v){return query(path).where(f,o,v);},limit(n){return query(path,[],n);},
    select(){return query(path);}});
  const db={collection(name){return ref(name);},async runTransaction(cb){
    const writes=[];
    const tx={async get(r){
      if(r.query)return {docs:[...data].filter(([p])=>p.startsWith(r.path+'/')&&!p.slice(r.path.length+1).includes('/'))
        .filter(([,v])=>r.filters.every(([f,val])=>v?.[f]===val)).slice(0,r.max)
        .map(([p,v])=>({id:p.split('/').at(-1),data:()=>v}))};
      const v=data.get(r.path);return {id:r.id,exists:v!==undefined,data:()=>v};
    },set(r,v){writes.push([r.path,v]);},
      create(r,v){if(data.has(r.path))throw Error('already exists: '+r.path);writes.push([r.path,v]);}};
    const out=await cb(tx);
    for(const [p,v] of writes)data.set(p,v);
    return out;
  }};
  const auth={async verifyIdToken(t){if(t!=='valid-token')throw Error('bad');return {uid:'narrator-1'};},
    async getUser(uid){return {uid,disabled:false};}};
  const service=createFirebaseNarratorWeekDraft({db,auth,projectId:'cormyr',snapshotId:HASH,
    enabled:true,env:{},now:()=>'2026-11-21T15:00:00.000Z',newId:()=>'id-'+String(++seq).padStart(6,'0')});
  return {service,data,root:'campaignCloudRuntime/'+HASH};
}
const adv=(c={})=>({expectedCalendarVersion:5,expectedOpenRound:3,proposedDate:D(1522,9,21),
  reason:'Abertura da Semana 4 pelo Hub Temporal',requestKey:'hub-advance-0001',...c});
const event=(data,root,id,date,extra={})=>data.set(root+'/scheduleEvents/'+id,{id,version:1,
  draft:{date,title:'Evento '+id,description:'',deleted:false,scope:'kingdom',region:null,...extra},published:null});

test('abertura publica só os rascunhos do período da nova semana, menos os desmarcados',async()=>{
  const {service,data,root}=fixture();
  event(data,root,'evt-in-period1','1522-10-24');
  event(data,root,'evt-in-period2','1522-10-27');
  event(data,root,'evt-next-month','1522-11-05');
  event(data,root,'evt-other-year','1300-10-24');
  const r=await service.advance('valid-token',adv({excludeEventIds:['evt-in-period2']}));
  assert.equal(r.publishedEvents,1);
  assert.ok(data.get(root+'/scheduleEvents/evt-in-period1').published);
  for(const id of ['evt-in-period2','evt-next-month','evt-other-year'])
    assert.equal(data.get(root+'/scheduleEvents/'+id).published,null,id);
  const audit=data.get('campaignNarratorDrafts/'+HASH+'/calendarAudit/'+data.get(root).lastAdvanceAuditId);
  assert.equal(audit.eventsBefore.length,1);
});

test('volta no tempo exige confirmação, avança a semana e não cobra meses das Casas',async()=>{
  const {service,data,root}=fixture();
  await assert.rejects(service.advance('valid-token',adv({proposedDate:D(1522,8,1)})),
    e=>e.code==='advance_backdate_forbidden');
  const r=await service.advance('valid-token',adv({proposedDate:D(1522,8,1),
    allowBackdate:true,acknowledgeIrreversibleEffects:true}));
  assert.equal(r.openRound,4);assert.equal(r.monthsCrossed,0);
  assert.equal(data.get(root).pendingHouseEffectMonths,0);
  const hist=await service.history('valid-token');
  assert.equal(hist[0].flashback,true);
  await assert.rejects(service.advance('valid-token',adv({expectedCalendarVersion:6,expectedOpenRound:4,
    proposedDate:D(1400,0,1),allowBackdate:true,acknowledgeIrreversibleEffects:true,requestKey:'hub-advance-0002'})),
    e=>e.code==='flashback_too_far');
});

test('desfazer reverte data, semana e eventos; bloqueia com missiva nova',async()=>{
  const {service,data,root}=fixture();
  event(data,root,'evt-in-period1','1522-10-24');
  const before=JSON.stringify(data.get(root+'/scheduleEvents/evt-in-period1'));
  await service.advance('valid-token',adv());
  const hub=await service.hubData('valid-token');
  assert.equal(hub.undo.available,true);
  data.set(root+'/letters/l-1',{creationRound:4,publicationState:'delivered',deletedAt:null,campaignDate:'1522-10-22'});
  await assert.rejects(service.undo('valid-token',{expectedCalendarVersion:6,expectedOpenRound:4,requestKey:'undo-key-0001'}),
    e=>e.code==='undo_new_week_has_mail');
  data.delete(root+'/letters/l-1');
  const u=await service.undo('valid-token',{expectedCalendarVersion:6,expectedOpenRound:4,requestKey:'undo-key-0001'});
  assert.equal(u.openRound,3);assert.equal(u.calendar.day,15);assert.equal(u.calendar.version,7);
  assert.equal(data.get('campaignMailRuntime/'+HASH).openRound,3);
  assert.equal(data.get('campaignMailRuntime/'+HASH).calendarVersion,7);
  assert.equal(JSON.stringify(data.get(root+'/scheduleEvents/evt-in-period1')),before);
  const again=await service.undo('valid-token',{expectedCalendarVersion:7,expectedOpenRound:3,requestKey:'undo-key-0001'});
  assert.equal(again.duplicate,true);
  // A semana pode ser reaberta depois do desfazer, com a mesma chave de antes.
  const re=await service.advance('valid-token',adv({expectedCalendarVersion:7}));
  assert.equal(re.duplicate,false);assert.equal(re.openRound,4);
  const hist=await service.history('valid-token');
  assert.ok(hist.some(h=>h.action==='undo_advance'));
  assert.ok(hist.some(h=>h.action==='advance_week'&&h.undone));
});

test('desfazer não reverte economia das Casas nem virada de ano',()=>{
  const live={openRound:4,calendarVersion:6};
  const base={action:'advance_week',eventsBefore:[],from:D(1522,9,21),to:{...D(1522,10,1),version:6},toRound:4};
  assert.equal(undoBlocker({...base,monthsCrossed:1},live).reason,'undo_house_effects_applied');
  assert.equal(undoBlocker({...base,monthsCrossed:0,to:{...D(1523,0,1),version:6}},live).reason,'undo_house_effects_applied');
  assert.equal(undoBlocker({...base,monthsCrossed:0,to:{...D(1522,9,25),version:6}},live).available,true);
  assert.equal(undoBlocker({...base,monthsCrossed:0,to:{...D(1522,9,25),version:7}},live).reason,'undo_calendar_changed');
  assert.equal(undoBlocker(undefined,live).reason,'no_hub_opening');
});

test('nova temporada muda a era sem efeitos mensais e pode ser desfeita',async()=>{
  const {service,data,root}=fixture();
  assert.deepEqual(seasonsOf(data.get(root)).map(s=>s.number),[2]);
  const r=await service.startSeason('valid-token',{expectedCalendarVersion:5,expectedOpenRound:3,
    proposedDate:D(1300,3,5),name:'A Era Antiga',reason:'Início da Temporada 3 em 1300',requestKey:'season-key-001'});
  assert.equal(r.season,3);assert.equal(r.openRound,4);assert.equal(r.calendar.year,1300);
  const live=data.get(root);
  assert.equal(live.pendingHouseEffectMonths,undefined);
  assert.deepEqual(live.seasons.map(s=>[s.number,s.status,s.startRound??null,s.endRound??null]),
    [[2,'closed',null,3],[3,'active',4,null]]);
  assert.equal([...data.keys()].some(k=>k.includes('characterYearTransitions')),false);
  const u=await service.undo('valid-token',{expectedCalendarVersion:6,expectedOpenRound:4,requestKey:'undo-season-01'});
  assert.equal(u.calendar.year,1522);
  assert.equal(data.get(root).seasons,null);
});

test('festivais e ajustes ficam no runtime, com versão e auditoria',async()=>{
  const {service,data,root}=fixture();
  const f=await service.saveFestival('valid-token',{name:'Feira da Colheita',scope:'region',region:'1',
    date:D(1522,9,25),repeat:'once',durationDays:3,notify:true,description:''});
  assert.equal(f.version,1);
  await assert.rejects(service.saveFestival('valid-token',{id:f.id,version:9,name:'X',scope:'kingdom',region:null,
    date:D(1522,9,25),repeat:'once',durationDays:1,notify:true}),e=>e.code==='festival_version_conflict');
  const s=await service.saveSettings('valid-token',{newspaperOneEditionPerWeek:true,fixedFestivalNotify:{'feast-moon':false}});
  assert.equal(s.settings.newspaperOneEditionPerWeek,true);
  await assert.rejects(service.saveSettings('valid-token',{fixedFestivalNotify:{nope:true}}),e=>e.code==='invalid_settings');
  const hub=await service.hubData('valid-token');
  assert.equal(hub.festivals.length,1);
  assert.equal(hub.fixedFestivalNotify['feast-moon'],false);
  await service.deleteFestival('valid-token',{id:f.id,version:1});
  assert.equal((await service.hubData('valid-token')).festivals.length,0);
  assert.equal(data.get(root).newspaperOneEditionPerWeek,true);
});

test('seleção de eventos aplica exclusões pendentes de qualquer data',()=>{
  const doc=(id,draft)=>({id,data:()=>({id,version:1,draft})});
  const chosen=planEventPublication([
    doc('evt-delete-1',{date:'1520-01-01',title:'',description:'',deleted:true}),
    doc('evt-later-01',{date:'1522-12-01',title:'x',description:'',deleted:false}),
  ],D(1522,9,21));
  assert.deepEqual(chosen.map(d=>d.id),['evt-delete-1']);
});
