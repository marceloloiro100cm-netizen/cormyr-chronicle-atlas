import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResidualPlan} from './stage-residual-emulator.mjs';
import {LINKS} from './spy-missions-core.mjs';

const SNAP='b'.repeat(64);
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const links=()=>tab('public.spy_cormyr_mission_links',LINKS.map(l=>({from_region:l[0],to_region:l[1],passage:l[2],active:'t'})));
function fixture(){
  return [links(),
    tab('public.campaign_migration_backups',[{id:U(1),created_at:'2026-01-01 00:00:00+00',reason:'r',snapshot:'{"a":[1]}'}]),
    tab('public.profiles',[{id:U(2),display_name:'',created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.archive_source_review',[{id:U(3),house_id:'h',source_file_id:'f',modified_at:'t1',remote_text:'',local_text:'x',reason:'r',created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.noble_house_drive_exports',[{binding_id:U(4),house_id:'h',file_id:'',provider_etag:'',content_hash:'',exported_version:'0',status:'pending',error:'',last_synced_at:''}]),
    tab('public.noble_house_source_links',[{house_id:'h',record_id:U(5),source_version:'1',source_file_id:'',source_modified_at:'',confirmed_totals:'{"a":1}',
      source_snapshot:'{}',before_state:'{}',after_version:'2',actor:U(6),created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.noble_house_workbook_imports',[{batch:'b1',house_key:'k',house_id:'',status:'applied',detail:'ok',checked_at:'2026-01-01 00:00:00+00'}]),
    tab('public.spy_legacy_seed_archive',[{id:U(7),owner_house_id:'h',archived_snapshot:'{"x":[[1]]}',archived_at:'2026-01-01 00:00:00+00',reason:'r'}]),
  ];
}
test('valid synthetic backup stages all eight tables and matches the core graph',()=>{
  const p=buildResidualPlan(fixture(),SNAP);
  assert.equal(p.summary.planValid,true,JSON.stringify(p.summary));
  assert.equal(p.summary.stagedCounts.links,LINKS.length);
  assert.equal(p.summary.missionLinksMatchCore,true);
  assert.equal(p.docs.backups[0].payload.snapshotJson,'{"a":[1]}');
  assert.equal(p.docs.driveExports[0].payload.fileId,null);
  assert.equal(p.docs.legacySeed[0].payload.archivedSnapshotJson,'{"x":[[1]]}');
});
test('absent tables stage zero; a link graph that drifts from the core blocks the plan',()=>{
  assert.equal(buildResidualPlan([],SNAP).summary.planValid,true);
  const t=fixture();t[0].rows.pop();
  const s=buildResidualPlan(t,SNAP).summary;
  assert.equal(s.missionLinksMatchCore,false);assert.equal(s.planValid,false);
  const inactive=fixture();inactive[0].rows[0].active='f';
  assert.equal(buildResidualPlan(inactive,SNAP).summary.missionLinksMatchCore,false);
});
test('invalid values, duplicates and oversized documents are counted',()=>{
  const mk=f=>{const t=fixture();f(t);return buildResidualPlan(t,SNAP).summary;};
  assert.equal(mk(t=>{t[0].rows[0].passage='air';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[1].rows.push({...t[1].rows[0]});}).issues.duplicateIds,1);
  assert.equal(mk(t=>{t[1].rows[0].snapshot='not json';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[6].rows[0].status='nope';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[5].rows[0].actor='x';}).planValid,false);
  assert.equal(mk(t=>{t[7].rows[0].archived_snapshot=JSON.stringify({big:'x'.repeat(950*1024)});}).issues.oversizedDocuments,1);
});
test('summary never carries row content',()=>{
  const s=JSON.stringify(buildResidualPlan(fixture(),SNAP).summary);
  assert.ok(!s.includes('pending')&&!s.includes('applied')&&!s.includes('"x"'));
});
