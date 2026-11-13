import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {buildTypedDomainPlan} from './stage-typed-domain-emulator.mjs';

const hash=createHash('sha256').update('private-normalized-source').digest('hex');
const tab=(table,rows)=>({table,columns:rows.length?Object.keys(rows[0]):[],rows});

export function syntheticDomainTables() {
  return [
    tab('auth.users',[
      {id:'narrator-uid',email:'private-narrator@example.invalid',encrypted_password:'private-hash'},
      {id:'player-a-uid',email:'private-a@example.invalid'},
      {id:'player-b-uid',email:'private-b@example.invalid'},
      {id:'editor-uid',email:'private-editor@example.invalid'},
      {id:'unprofiled-uid',email:'private-unknown@example.invalid'},
    ]),
    tab('public.user_roles',[{user_id:'narrator-uid',role:'admin'}]),
    tab('public.campaign_access_profiles',[
      {user_id:'narrator-uid',profile:'narrador',active:'t'},
      {user_id:'player-a-uid',profile:'jogador',active:'t'},
      {user_id:'player-b-uid',profile:'jogador',active:'t'},
      {user_id:'editor-uid',profile:'editor',active:'t'},
    ]),
    tab('public.campaign_houses',[
      {id:'house-a',name:'Casa A',castle:'Castelo A',crest:'crest-a.png',season:'2',active:'t',details:'secret-house-a'},
      {id:'house-b',name:'Casa B',castle:'Castelo B',crest:'crest-b.png',season:'2',active:'t'},
      {id:'house-c',name:'Casa C',castle:'Castelo C',crest:null,season:'2',active:'f'},
    ]),
    tab('public.campaign_players',[
      {id:'player-a',user_id:'player-a-uid',name:'Player A',active:'t',require_password_change:'f',roster_house_id:'house-a'},
      {id:'player-b',user_id:'player-b-uid',name:'Player B',active:'t',require_password_change:'f',roster_house_id:'house-b'},
      {id:'editor-player',user_id:'editor-uid',name:'Editor',active:'t',require_password_change:'f',roster_house_id:null},
    ]),
    tab('public.house_memberships',[
      {player_id:'player-a',house_id:'house-a',can_edit:'t',can_edit_attributes:'f'},
      {player_id:'player-b',house_id:'house-b',can_edit:'t',can_edit_attributes:'t'},
    ]),
    tab('public.campaign_letters',[
      {id:'letter-ab',sender_user_id:'player-a-uid',sender_player_id:'player-a',recipient_player_id:'player-b',recipient_house_id:null,subject:'private subject AB',content:'private message AB',created_at:'2026-11-12 10:00:00+00'},
      {id:'letter-to-a',sender_user_id:'narrator-uid',sender_player_id:null,recipient_player_id:null,recipient_house_id:'house-a',subject:'private house A',content:'secret A',created_at:'2026-11-12 11:00:00+00'},
      {id:'letter-to-b',sender_user_id:'narrator-uid',sender_player_id:null,recipient_player_id:null,recipient_house_id:'house-b',subject:'private house B',content:'secret B',created_at:'2026-11-12 12:00:00+00'},
      {id:'letter-editor',sender_user_id:'editor-uid',sender_player_id:'editor-player',recipient_player_id:null,recipient_house_id:'house-b',subject:'legacy editor mail',content:'must not be readable by editor',created_at:'2026-11-12 13:00:00+00'},
    ]),
  ];
}

test('type conversion, no leaked passwords or public house internal details',()=>{
  const plan=buildTypedDomainPlan(syntheticDomainTables(),hash);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.summary.accountsWithoutProfile,1);
  assert.deepEqual(plan.summary.typedCollections,{houses:3,players:3,access:5,letters:4});
  const house=plan.docs.houses.find(x=>x.payload.sourceId==='house-a').payload;
  assert.equal(house.active,true);
  assert.equal(house.season,2);
  assert.equal(Object.hasOwn(house,'details'),false);
  const a=plan.docs.access.find(x=>x.id==='player-a-uid').payload;
  assert.deepEqual(a.memberHouseIds,['house-a']);
  assert.deepEqual(a.editHouseIds,['house-a']);
  assert.deepEqual(a.attrHouseIds,[]);
  const unknown=plan.docs.access.find(x=>x.id==='unprofiled-uid').payload;
  assert.equal(unknown.profile,null);
  assert.equal(unknown.active,false);
  assert.deepEqual(unknown.memberHouseIds,[]);
  const editor=plan.docs.access.find(x=>x.id==='editor-uid').payload;
  assert.equal(editor.profile,'editor');
  assert.equal(editor.admin,false);
  assert.deepEqual(editor.memberHouseIds,[]);
  assert.ok(!JSON.stringify(plan).includes('private-hash'));
  assert.ok(!JSON.stringify(plan).includes('private-unknown@example.invalid'));
  assert.ok(!JSON.stringify(plan.summary).includes('private message AB'));
  assert.equal(plan.summary.firebaseCloudWrites,0);
});

test('denies editor membership, invalid role assertions and dangling recipients before staging',()=>{
  const data=syntheticDomainTables();
  data.find(t=>t.table==='public.house_memberships').rows.push({
    player_id:'editor-player',house_id:'house-a',can_edit:'t',can_edit_attributes:'t',
  });
  const plan=buildTypedDomainPlan(data,hash);
  assert.equal(plan.summary.planValid,false);
  assert.equal(plan.summary.issues.editorHouseConflicts,1);

  const invalid=syntheticDomainTables();
  invalid.find(t=>t.table==='public.campaign_letters').rows[0].recipient_player_id='missing-player';
  invalid.find(t=>t.table==='public.campaign_access_profiles').rows[0].profile='jogador';
  const p=buildTypedDomainPlan(invalid,hash);
  assert.equal(p.summary.planValid,false);
  assert.ok(p.summary.issues.roleConflicts>0);
  assert.ok(p.summary.issues.orphanLinks>0);
});

test('missing profile never becomes player by roster or membership alone',()=>{
  const data=syntheticDomainTables();
  const player=data.find(t=>t.table==='public.campaign_players');
  player.rows.push({
    id:'unknown-player',user_id:'unprofiled-uid',name:'Unprofiled',
    active:'t',require_password_change:'f',roster_house_id:'house-c',
  });
  data.find(t=>t.table==='public.house_memberships').rows.push({
    player_id:'unknown-player',house_id:'house-c',can_edit:'t',can_edit_attributes:'t',
  });
  const plan=buildTypedDomainPlan(data,hash);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.summary.accountsWithoutProfile,1);
  const unknown=plan.docs.access.find(x=>x.id==='unprofiled-uid').payload;
  assert.equal(unknown.profile,null);
  assert.equal(unknown.active,false);
  assert.deepEqual(unknown.memberHouseIds,[]);
});

test('invalid source flags and oversized content fail closed',()=>{
  const data=syntheticDomainTables();
  data.find(t=>t.table==='public.campaign_houses').rows[0].active='maybe';
  data.find(t=>t.table==='public.campaign_letters').rows[0].content='x'.repeat(860*1024);
  const plan=buildTypedDomainPlan(data,hash);
  assert.equal(plan.summary.planValid,false);
  assert.ok(plan.summary.issues.invalidValues>0);
  assert.equal(plan.summary.issues.oversizedDocuments,1);
});

test('incomplete required tables block the complete domain view',()=>{
  const data=syntheticDomainTables().filter(t=>t.table!=='public.campaign_access_profiles');
  const plan=buildTypedDomainPlan(data,hash);
  assert.equal(plan.summary.planValid,false);
  assert.ok(plan.summary.missingRequiredTables.includes('public.campaign_access_profiles'));
});
