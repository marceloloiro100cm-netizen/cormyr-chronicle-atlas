import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planEventSave,publishEvent} from './firebase/cloud-schedule-events-core.mjs';

const source=path=>readFileSync(path,'utf8');
const chronology=JSON.parse(source('public/cormyr/chronicle-timeline.json'));
test('annual chronology preserves 77 year-only records from the supplied timeline',()=>{
  assert.equal(chronology.schemaVersion,1);
  assert.equal(chronology.events.length,77);
  assert.equal(chronology.events[0].year,1350);
  assert.equal(Math.max(...chronology.events.map(e=>e.yearEnd||e.year)),1520);
  assert.ok(chronology.events.every(e=>
    Number.isInteger(e.year)&&e.year>=1350&&e.year<=1520&&
    typeof e.title==='string'&&e.title.length>0&&
    typeof e.description==='string'&&e.description.length>0&&
    !('day' in e)&&!('month' in e)&&e.scope==='kingdom'));
  const march=chronology.events.find(e=>e.year===1455&&e.yearEnd===1460);
  assert.ok(march,'1455–1460 continuous March of Iron must remain one record');
  for(const [year,count] of [[1372,2],[1499,2],[1510,2]])
    assert.equal(chronology.events.filter(e=>e.year===year).length,count);
  assert.equal(new Set(chronology.events.map(e=>e.id)).size,77);
});
test('public site calendar appears directly below Jornal and never exposes letters',()=>{
  const page=source('public/cormyr/index.html');
  assert.match(page,/<a href="#jornal" data-view="jornal">Jornal<\/a><a href="#calendario" data-view="calendario">Calendário<\/a>/);
  assert.match(page,/id="view-calendario"/);
  assert.match(page,/src="\/cormyr\/calendar.html"/);
  const html=source('public/cormyr/calendar.html');
  for(const id of ['chronicle-year','chronicle-mode','chronicle-month','chronicle-tenday',
    'chronicle-day','chronicle-region','chronicle-year-events','chronicle-dated-events'])
    assert.ok(html.includes('id="'+id+'"'),id);
  const client=source('public/cormyr/public-calendar.js');
  assert.match(client,/\/api\/public\/calendar-events\?year=/);
  assert.match(client,/\/api\/public\/time/);
  assert.doesNotMatch(client,/\/api\/firebase-workspace|\/api\/firebase-cloud-mail|sessionStorage|localStorage|bearer|authorization/i);
});
test('Cloud events require separate opt-in even if published to authenticated players',()=>{
  const deny=(code)=>{throw Error(code);};
  const ctx={deny,newId:()=>'evento-0001',uid:'narrator',at:'2026-11-22T00:00:00Z'};
  const body={id:null,version:null,date:'1522-01-01',title:'Convocação pública',description:'Texto',deleted:false};
  const privateDraft=planEventSave(null,body,ctx);
  assert.equal(privateDraft.draft.public,undefined);
  assert.equal(publishEvent(privateDraft,'now').published.public,undefined);
  const approved=planEventSave(null,{...body,public:true},ctx);
  assert.equal(publishEvent(approved,'now').published.public,true);
  assert.throws(()=>planEventSave(null,{...body,public:'yes'},ctx),/invalid_event/);
});
test('workspace logo returns to front and public event API is fail-closed',()=>{
  const narrator=source('src/components/players/narrator/NarratorWorkspace.tsx');
  assert.match(narrator,/className="nw-brand" href="\/cormyr\/index.html"/);
  const editor=source('src/components/newspaper/NewspaperEditorialDesk.tsx');
  assert.match(editor,/className="folha-top-brand folha-site-home" href="\/cormyr\/index.html"/);
  assert.match(editor,/<PublicChronicleCalendar\/>/);
  const reader=source('src/lib/calendar/firebase-public-events.server.ts');
  assert.match(reader,/published\['public'\]!==true/);
  assert.match(reader,/f\.public!==true/);
  assert.doesNotMatch(reader,/collection\('mail'\)|collection\('letters'\)|collection\('house'/);
  const middleware=source('src/lib/archive-only.ts');
  assert.match(middleware,/pathname === '\/api\/public\/calendar-events'/);
});
