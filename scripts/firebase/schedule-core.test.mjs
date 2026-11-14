import test from 'node:test';
import assert from 'node:assert/strict';
import {isCampaignDate,applyScheduleSave,publishScheduleSnapshots,publishedForMonth,
  draftsView,requireNarrator,ScheduleError} from './schedule-core.mjs';

const ID='11111111-1111-4111-8111-111111111111';
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof ScheduleError);return e.code;}return null;};
const create=(o={})=>applyScheduleSave({payload:{date:'1520-03-10',title:' Torneio ',description:'d',...o},
  existing:null,newId:ID,actorUid:'n'});

test('campaign dates: regular, festivals and invalid',()=>{
  assert.equal(isCampaignDate('1520-03-10'),true);
  assert.equal(isCampaignDate('1520-F-midwinter'),true);
  assert.equal(isCampaignDate('1521-F-shieldmeet'),false); // leap years only
  assert.equal(isCampaignDate('1520-13-01'),false);
  assert.equal(isCampaignDate('x'),false);
});
test('narrator only; active access only',()=>{
  assert.equal(code(()=>requireNarrator({active:true,profile:'jogador',admin:false})),'denied');
  assert.equal(code(()=>requireNarrator(null)),'denied');
});
test('create trims, v1, audit',()=>{
  const r=create();assert.equal(r.event.draftTitle,'Torneio');assert.equal(r.event.version,1);
  assert.equal(r.audit.before,null);
  assert.equal(code(()=>create({title:''})),'invalid');
  assert.equal(code(()=>create({date:'1520-40-01'})),'invalid');
  assert.equal(code(()=>create({deleted:true})),'invalid');
  assert.equal(code(()=>create({description:'x'.repeat(4001)})),'invalid');
});
test('update needs matching version',()=>{
  const ev=create().event;
  const upd=(o)=>applyScheduleSave({payload:{id:ID,date:'1520-03-11',title:'N',version:1,...o},existing:ev,actorUid:'n'});
  assert.equal(upd({}).event.version,2);
  assert.equal(code(()=>upd({version:7})),'conflict');
  assert.equal(upd({deleted:true}).event.draftDeleted,true);
});
test('publication promotes only changed drafts and audits them',()=>{
  const a={...create().event},b={...create({title:'B'}).event,id:'22222222-2222-4222-8222-222222222222'};
  const pub={...b,publishedDate:b.draftDate,publishedTitle:'B',publishedDescription:'d'};
  const gone={...pub,id:'33333333-3333-4333-8333-333333333333',draftDeleted:true};
  const r=publishScheduleSnapshots({events:[a,pub,gone],actorUid:'n',reason:'Publicação'});
  assert.equal(r.updated.length,2);
  assert.equal(r.updated[0].publishedTitle,'Torneio');assert.equal(r.updated[0].version,2);
  assert.equal(r.updated[1].publishedDate,null);
  assert.equal(r.audits.length,2);
});
test('published month view hides drafts and folds festivals',()=>{
  const ev=(id,d,t,o={})=>({id,publishedDate:d,publishedTitle:t,publishedDescription:null,...o});
  const events=[ev('b','1520-01-05','Jan'),ev('a','1520-F-midwinter','Festa'),ev('c','1520-02-01','Fev'),
    ev('d','1520-03-02','Rascunho',{publishedTitle:null}),ev('e','1520-F-shieldmeet','Escudo')];
  assert.deepEqual(publishedForMonth(events,1520,0).map(x=>x.id),['schedule:b','schedule:a']);
  assert.deepEqual(publishedForMonth(events,1520,6).map(x=>x.id),['schedule:e']);
  assert.deepEqual(publishedForMonth(events,1520,2),[]);
  assert.equal(code(()=>publishedForMonth(events,1520,12)),'invalid');
});
test('drafts view is sorted',()=>{
  const v=draftsView([{...create({date:'1520-05-01'}).event},{...create().event,id:'z'}]);
  assert.equal(v[0].date,'1520-03-10');
});
