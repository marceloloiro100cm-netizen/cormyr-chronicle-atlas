import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBattlePlan} from './stage-battle-emulator.mjs';
import {battleHash} from './battle-core.mjs';

const SNAP='a'.repeat(64);
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
function fixture(){
  const ini={rulesVersion:'PTE-2.0',phase:'ready'},s1={rulesVersion:'PTE-2.0',phase:'active',n:1};
  const ih=battleHash(ini),h1=battleHash(s1);
  return [
    tab('public.battle_sim_sessions',[{id:U(1),created_by:U(9),name:'Teste',status:'active',rules_version:'PTE-2.0',schema_version:'2',
      initial_state_json:JSON.stringify(ini),current_state_json:JSON.stringify(s1),initial_state_hash:ih,state_hash:h1,state_version:'1',
      created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_sim_events',[{session_id:U(1),seq:'1',command_id:'cmd-1',actor_id:U(9),command_json:'{"type":"X"}',
      event_json:'{"actionSeq":1}',prev_hash:ih,state_hash:h1,created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_sim_scenarios',[{id:U(2),created_by:U(9),name:'Cenário',map_json:'{"w":1}',units_json:'[[1,2]]',schema_version:'2',
      rules_version:'PTE-2.0',created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_v3_invitations',[{id:U(3),title:'Convocação',target_house_id:'hA',created_by:U(9),scenario:'plain-open',
      attacker_model_id:'ashkar-model',defender_model_id:'evenhand-model',attacker_commander:'ranger',defender_commander:'knight',
      status:'open',created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_v3_live_matches',[{id:U(4),title:'Partida 1',attacker_house_id:'hA',defender_house_id:'hB',created_by:U(9),
      state_version:'0',state_hash:'b'.repeat(64),replay_json:'{"finalHash":"x","steps":[[1]]}',status:'active',
      created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_house_roster_imports',[{source_key:'k1',house_id:'hA',unit_name:'U',catalog_id:'c',unit_type:'t',training:'green',
      quantity:'2',standard_unit_strength:'10',unit_strength_basis:'',source_status:'ok',source_region:'r',source_domain:'',source_row:'1',
      source_file_id:'f',source_url:'',source_note:'',simulation_only:'t',imported_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_dnd_cormyr_monsters',[{id:'orc',name:'Orc',group_name:'Humanoides',source:'S',challenge_rating:'0.500',hp:'15',ac:'13',
      size:'M',speed_ft:'30',melee:'[{"a":[1]}]',ranged:'',catalog_version:'1'}]),
    tab('public.battle_dnd_sessions',[{owner_id:U(9),battle_id:'dnd-training-1',replay:'"{\\"a\\":1}"',report:'',updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_dnd_monster_overrides',[{monster_id:'orc',combat_patch:'{"hp":20}',updated_by:U(9),updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_dnd_custom_monsters',[{id:'custom-x',payload:'{"id":"custom-x"}',catalog_version:'2',created_by:U(9),updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_dnd_verified_sources',[{monster_id:'orc',combat_defaults:'{"x":1}',source_filename:'orc.pdf',verified_at:'2026-01-01 00:00:00+00'}]),
  ];
}
test('valid synthetic backup stages everything with JSON text and intact chains',()=>{
  const p=buildBattlePlan(fixture(),SNAP);
  assert.equal(p.summary.planValid,true,JSON.stringify(p.summary));
  assert.equal(p.summary.stagedCounts.states,2);assert.equal(p.summary.stagedCounts.liveReplays,1);
  assert.equal(typeof p.docs.states[0].payload.json,'string');
  assert.equal(p.docs.liveReplays[0].payload.json,'{"finalHash":"x","steps":[[1]]}');
  assert.equal(p.docs.dndSessions[0].payload.replay,'{"a":1}');
  assert.equal(p.docs.monsters[0].payload.rangedJson,null);
  assert.equal(p.docs.roster[0].payload.unitStrengthBasis,'unit-military-standard');
  assert.equal(p.docs.events[0].id,U(1)+':1');
});
test('missing tables stage zero without failing',()=>{
  const p=buildBattlePlan([],SNAP);
  assert.equal(p.summary.planValid,true);assert.equal(p.summary.stagedCounts.sessions,0);
});
test('broken chain, orphans, duplicates and bad values block the plan',()=>{
  const mk=f=>{const t=fixture();f(t);return buildBattlePlan(t,SNAP).summary;};
  assert.equal(mk(t=>{t[1].rows[0].prev_hash='c'.repeat(64);}).issues.brokenChains,1);
  assert.equal(mk(t=>{t[1].rows[0].session_id=U(77);}).issues.orphanLinks,1);
  assert.equal(mk(t=>{t[0].rows.push({...t[0].rows[0]});}).issues.duplicateIds,1);
  assert.equal(mk(t=>{t[3].rows[0].scenario='nope';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[4].rows[0].defender_house_id='hA';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[5].rows[0].simulation_only='f';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[8].rows[0].monster_id='ghost';}).issues.orphanLinks,1);
  assert.equal(mk(t=>{t[9].rows[0].payload='{"id":"custom-y"}';}).issues.invalidValues,1);
  assert.equal(mk(t=>{t[0].rows[0].state_version='5';}).planValid,false);
  assert.equal(mk(t=>{t[0].rows[0].initial_state_json='x'.repeat(10);}).planValid,false);
});
test('summary never carries row content',()=>{
  const s=JSON.stringify(buildBattlePlan(fixture(),SNAP).summary);
  assert.ok(!s.includes('Teste')&&!s.includes('Orc')&&!s.includes('Convocação'));
});
