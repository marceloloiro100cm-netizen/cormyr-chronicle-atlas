import test from 'node:test';
import assert from 'node:assert/strict';
import {CORMYR_DOCUMENT_FESTIVALS} from './cormyr-festivals-catalog-20261121.mjs';
import {planFestivalImport} from './import-cormyr-document-festivals-20261121.mjs';

const row=key=>CORMYR_DOCUMENT_FESTIVALS.find(f=>f.key===key);
test('the document catalog contains exactly 25 unique new annual observances',()=>{
 assert.equal(CORMYR_DOCUMENT_FESTIVALS.length,25);
 assert.equal(new Set(CORMYR_DOCUMENT_FESTIVALS.map(x=>x.id)).size,25);
 assert.ok(CORMYR_DOCUMENT_FESTIVALS.every(x=>x.date.year===1522&&x.repeat==='yearly'));
 assert.ok(!CORMYR_DOCUMENT_FESTIVALS.some(x=>/^(midwinter|greengrass|midsummer|shieldmeet|highharvestide|feast-moon)$/i.test(x.key)));
 assert.deepEqual([row('festival-dos-mares').month,row('festival-dos-mares').day,row('festival-dos-mares').durationDays],[2,21,10]);
 assert.equal(row('caravancarai-proskur').day,2);
 assert.equal(row('assembleia-das-casas').day,11);
 assert.equal(row('bencaos-douradas').day,22);
 assert.equal(row('estilhacar').day,15);
});
test('all 25 are proposed when Firestore has no document festival or matching published event',()=>{
 const r=planFestivalImport([],[]);
 assert.deepEqual([r.counts.source,r.counts.create,r.counts.existingFestival,r.counts.existingPublishedEvent],[25,25,0,0]);
});
test('a pre-existing Hub festival suppresses a duplicate creation',()=>{
 const f=row('noite-de-lliira');
 const r=planFestivalImport([{id:'existing-festival',name:f.name,date:f.date,durationDays:1,deleted:false}],[]);
 assert.deepEqual([r.counts.create,r.counts.existingFestival],[24,1]);
});
test('deleted festivals are not resurrected by import',()=>{
 const f=row('noite-de-lliira');
 const r=planFestivalImport([{id:f.id,name:f.name,date:f.date,durationDays:1,deleted:true}],[]);
 assert.deepEqual([r.counts.create,r.counts.existingDeletedFestival],[24,1]);
});
test('a previously registered event also suppresses a duplicate',()=>{
 const f=row('vitoria-de-finder');
 const r=planFestivalImport([],[
  {published:{title:'Festival · Vitória de Finder',date:'1522-10-20'}},
 ]);
 assert.deepEqual([r.counts.create,r.counts.existingPublishedEvent],[24,1]);
});
test('a matching draft and alias name suppress duplicates',()=>{
 const f=row('festival-das-cores');
 const r=planFestivalImport([],[
  {draft:{title:'Festivas das Cores',date:'1522-05-21'}},
 ]);
 assert.deepEqual([r.counts.create,r.counts.existingPublishedEvent],[24,1]);
});
test('same name but divergent date aborts instead of silently altering player/editor calendar',()=>{
 const f=row('assembleia-das-casas');
 assert.throws(()=>planFestivalImport([
  {id:'existing',name:f.name,date:{...f.date,day:7},durationDays:1},
 ],[]),/existing_festival_conflicts/);
 assert.throws(()=>planFestivalImport([],[
  {published:{title:f.name,date:'1522-04-07'}},
 ]),/existing_event_conflicts/);
});
test('a partial duplicate inventory yields only new records, preserving all existing items',()=>{
 const f1=row('noite-dos-mentirosos'),f2=row('vitoria-de-finder');
 const r=planFestivalImport([
  {id:'existing',name:f1.name,date:f1.date,durationDays:1,deleted:false},
 ],[
  {published:{title:f2.name,date:'1522-10-20'}},
 ]);
 assert.deepEqual([r.counts.create,r.counts.existingFestival,r.counts.existingPublishedEvent],[23,1,1]);
});
