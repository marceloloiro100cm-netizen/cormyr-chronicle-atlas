import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDrivePlan} from './stage-drive-emulator.mjs';
const SNAP='a'.repeat(64);
const U=n=>String(n).repeat(8)+'-1111-4111-8111-'+String(n).repeat(12);
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const binding={id:U(1),folder_id:'F',scope:'house',house_id:'h',player_id:null,owner_user_id:U(2),confirmed_by:U(2),
  privacy_reviewed:'t',runtime_authorized:'t',enabled:'t',technical_folder_id:'T',last_checked_at:null,last_error:null,
  lease_token:U(9),lease_until:'2030-01-01 00:00:00+00'};
const base=()=>[
  tab('public.drive_sync_bindings',[binding]),
  tab('public.drive_sync_files',[{id:U(3),binding_id:U(1),entity_type:'record',entity_id:U(4),file_id:'f',etag:'e',
    base_snapshot:'{"a":1}',remote_hash:'h',last_synced_at:'2026-01-01 00:00:00+00'}]),
  tab('public.drive_sync_inbox',[{id:U(5),binding_id:U(1),file_id:'f',remote_hash:'h',etag:null,site_snapshot:null,
    folder_snapshot:'{"x":1}',state:'review',created_at:'2026-01-01 00:00:00+00'}]),
  tab('public.sync_outbox',[{id:U(6),entity_type:'record',entity_id:U(4),version:'2',payload:'{}',state:'pending',attempts:'0',
    error:null,created_at:'2026-01-01 00:00:00+00',last_attempt_at:null,next_attempt_at:'2026-01-01 00:00:00+00'}]),
  tab('public.sync_conflicts',[]),
];
test('valid plan; leases are never carried over',()=>{
  const p=buildDrivePlan(base(),SNAP);
  assert.equal(p.summary.planValid,true);
  assert.deepEqual(p.summary.stagedCounts,{bindings:1,files:1,inbox:1,outbox:1,conflicts:0});
  assert.equal(p.docs.bindings[0].payload.leaseToken,null);assert.equal(p.docs.bindings[0].payload.leaseUntil,null);
  assert.equal(p.summary.enabledBindings,1);
});
test('orphans, duplicates, bad scope and missing tables are counted without values',()=>{
  const t=base();
  t[0].rows.push({...binding,id:U(7),scope:'player',player_id:null});
  t[1].rows.push({...t[1].rows[0],id:U(8)},{...t[1].rows[0],id:U(8),binding_id:U(9),entity_id:U(5)});
  const p=buildDrivePlan(t,SNAP);
  assert.equal(p.summary.planValid,false);
  assert.equal(p.summary.issues.invalidValues,1);
  assert.equal(p.summary.issues.duplicateIds,1);
  assert.equal(p.summary.issues.orphanLinks,1);
  assert.equal(buildDrivePlan([],SNAP).summary.missingTables,5);
});
