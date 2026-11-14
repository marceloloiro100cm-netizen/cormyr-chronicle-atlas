import assert from 'node:assert/strict';
import test from 'node:test';
import {stagerCoverage,tablesByStager,loadStagerSources} from './audit-stager-coverage.mjs';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';

const table=(name,n)=>({table:name,columns:['id'],rows:Array.from({length:n},(_,i)=>({id:'secret'+i}))});

test('extracts table names per stager source',()=>{
  const m=tablesByStager([{file:'a',text:"const T={x:'public.spy_assets',y:\"public.spy_locations\"}"},{file:'b',text:"'public.spy_assets' `auth.users`"}]);
  assert.deepEqual([...m.get('public.spy_assets')].sort(),['a','b']);
  assert.ok(m.has('public.spy_locations')&&m.has('auth.users'));
});
test('separates consumed and unconsumed tables without row content',()=>{
  const r=stagerCoverage([table('public.spy_assets',3),table('public.battle_sim_sessions',2),table('public.unknown_thing',7)],
    [{file:'s',text:"'public.spy_assets' 'public.battle_sim_sessions' 'public.ghost'"}]);
  assert.equal(r.consumedTables,2);assert.equal(r.consumedRows,5);
  assert.equal(r.unconsumedTables,1);assert.equal(r.unconsumedRows,7);
  assert.deepEqual(r.unconsumed,[{table:'public.unknown_thing',rows:7}]);
  assert.deepEqual(r.stagerTablesAbsentFromBackup,['public.ghost']);
  assert.equal(r.byDomain.espionage.consumedRows,3);
  assert.equal(r.readyForCutover,false);assert.equal(r.cloudWrites,0);
  assert.ok(!JSON.stringify(r).includes('secret'));
});
test('rejects duplicated tables',()=>{
  assert.throws(()=>stagerCoverage([table('public.a',1),table('public.a',1)],[]));
});
test('real stager sources cover the espionage and battle tables',async()=>{
  const src=await loadStagerSources(dirname(fileURLToPath(import.meta.url)));
  const m=tablesByStager(src);
  for(const t of ['public.spy_assets','public.spy_intelligence_findings','public.battle_sim_sessions','public.battle_dnd_verified_sources'])
    assert.ok(m.has(t),t);
});
