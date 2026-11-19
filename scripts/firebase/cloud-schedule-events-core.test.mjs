import test from 'node:test';
import assert from 'node:assert/strict';
import {planEventSave,publishEvent,parseEventDate} from './cloud-schedule-events-core.mjs';
const deny=(code,status)=>{throw Object.assign(Error(code),{status});};
const ctx={deny,newId:()=>'evento-0001',uid:'gm',at:'2026-11-19T10:00:00Z'};
test('save creates a private draft, edits need the current version, publish exposes it',()=>{
  const a=planEventSave(null,{id:null,version:null,date:'1522-11-05',title:' Feira ',description:'',deleted:false},ctx);
  assert.deepEqual([a.id,a.version,a.published,a.draft.title],['evento-0001',1,null,'Feira']);
  assert.throws(()=>planEventSave(a,{id:a.id,version:3,date:'1522-11-05',title:'x',description:'',deleted:false},ctx),/event_version_conflict/);
  const p=publishEvent(a,'2026-11-20T10:00:00Z');
  assert.deepEqual(p.published,{date:'1522-11-05',title:'Feira',description:''});
  assert.equal(p.draft,null);
  const del=planEventSave(p,{id:a.id,version:p.version,date:'1522-11-05',title:'Feira',description:'',deleted:true},ctx);
  assert.equal(del.published.title,'Feira','continua visível até publicar a exclusão');
  assert.equal(publishEvent(del,'x').published,null);
  assert.equal(publishEvent(publishEvent(del,'x'),'y'),null);
});
test('dates and payloads are validated',()=>{
  assert.equal(parseEventDate('1522-13-01'),null);
  assert.deepEqual(parseEventDate('1522-F-midwinter'),{year:1522,month:0,day:30,festival:'midwinter'});
  for(const bad of [{id:null,version:null,date:'ontem',title:'x',description:'',deleted:false},
    {id:null,version:null,date:'1522-01-01',title:'',description:'',deleted:false},
    {id:null,version:null,date:'1522-01-01',title:'x',description:'',deleted:false,extra:1}])
    assert.throws(()=>planEventSave(null,bad,ctx),/invalid_event/);
  assert.throws(()=>planEventSave(null,{id:'evento-9999',version:1,date:'1522-01-01',title:'x',description:'',deleted:false},ctx),/event_not_found/);
});
