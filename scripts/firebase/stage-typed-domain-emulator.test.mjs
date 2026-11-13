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
      {id:'letter-ab',sender_user_id:'player-a-uid',sender_player_id:'player-a',recipient_player_id:'player-b',recipient_house_id:null,subject:'private subject AB',content:'private message AB',publication_state:'delivered',created_at:'2026-11-12 10:00:00+00'},
      {id:'letter-to-a',sender_user_id:'narrator-uid',sender_player_id:null,recipient_player_id:null,recipient_house_id:'house-a',subject:'private house A',content:'secret A',publication_state:'delivered',created_at:'2026-11-12 11:00:00+00'},
      {id:'letter-to-b',sender_user_id:'narrator-uid',sender_player_id:null,recipient_player_id:null,recipient_house_id:'house-b',subject:'private house B',content:'secret B',publication_state:'delivered',created_at:'2026-11-12 12:00:00+00'},
      {id:'letter-editor',sender_user_id:'editor-uid',sender_player_id:'editor-player',recipient_player_id:null,recipient_house_id:'house-b',subject:'legacy editor mail',content:'must not be readable by editor',publication_state:'delivered',created_at:'2026-11-12 13:00:00+00'},
    ]),
  ];
}

test('type conversion, no leaked passwords or public house internal details',()=>{
  const plan=buildTypedDomainPlan(syntheticDomainTables(),hash);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.summary.accountsWithoutProfile,1);
  assert.deepEqual(plan.summary.typedCollections,{houses:3,players:3,access:5,letters:4,lettersQuarantine:0});
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


test('both null and both populated recipients are preserved in private quarantine',()=>{
  const a=syntheticDomainTables();
  const table=a.find(t=>t.table==='public.campaign_letters');
  table.rows.push({
    id:'unaddressed-legacy',sender_user_id:'player-a-uid',sender_player_id:'player-a',
    recipient_player_id:null,recipient_house_id:null,
    subject:'private to narrator?',content:'secret unaddressed',
    publication_state:'delivered',created_at:'2026-11-12 14:00:00+00',
  });
  table.rows.push({
    id:'double-legacy',sender_user_id:'player-a-uid',sender_player_id:'player-a',
    recipient_player_id:'player-b',recipient_house_id:'house-a',
    subject:'private ambiguous',content:'secret ambiguous',
    publication_state:'delivered',created_at:'2026-11-12 15:00:00+00',
  });
  const plan=buildTypedDomainPlan(a,hash);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.summary.typedCollections.letters,4);
  assert.equal(plan.summary.typedCollections.lettersQuarantine,2);
  assert.deepEqual(plan.summary.recipientShapes,{missingBoth:1,bothPresent:1});
  assert.deepEqual(plan.summary.letterCoverage,{
    source:6,addressed:4,quarantined:2,complete:true,
  });
  assert.equal(plan.summary.issues.orphanLinks,0);
  assert.equal(plan.summary.accountsWithoutProfile,1);
  assert.equal(plan.summary.firebaseCloudWrites,0);

  const privateCopies=plan.docs.lettersQuarantine;
  assert.ok(privateCopies.every(item=>item.payload.sourceTable==='public.campaign_letters'));
  const sourceTable=a.find(t=>t.table==='public.campaign_letters');
  for(const original of sourceTable.rows.slice(-2)){
    const item=privateCopies.find(entry=>entry.id===plan.docs.lettersQuarantine
      .find(candidate=>candidate.payload.rawValues[
        candidate.payload.columns.indexOf('id')]===original.id)?.id);
    assert.ok(item);
    const reconstructed=Object.fromEntries(item.payload.columns.map((key,i)=>
      [key,item.payload.rawValues[i]]));
    assert.deepEqual(reconstructed,original);
    assert.ok(!plan.docs.letters.some(letter=>letter.payload.sourceId===original.id));
  }
  const output=JSON.stringify(plan.summary);
  assert.ok(!output.includes('private ambiguous'));
  assert.ok(!output.includes('secret unaddressed'));
});

test('quarantine does not bypass missing sender, oversize, invalid rows or duplicate IDs',()=>{
  const t=syntheticDomainTables();
  const letters=t.find(x=>x.table==='public.campaign_letters');
  letters.rows.push({
    id:'missing-sender-quarantine',sender_user_id:'deleted-uid',sender_player_id:null,
    recipient_player_id:null,recipient_house_id:null,subject:'old',content:'text',
    publication_state:'delivered',created_at:'2026-11-12 16:00:00+00',
  });
  let summary=buildTypedDomainPlan(t,hash).summary;
  assert.equal(summary.planValid,false);
  assert.equal(summary.orphanLinksByType.letterSenderMissingAuth,1);
  assert.equal(summary.typedCollections.lettersQuarantine,0);
  assert.equal(summary.letterCoverage.complete,false);

  letters.rows.at(-1).sender_user_id='player-a-uid';
  letters.rows.at(-1).content='x'.repeat(860*1024);
  summary=buildTypedDomainPlan(t,hash).summary;
  assert.equal(summary.planValid,false);
  assert.equal(summary.issues.oversizedDocuments,1);

  letters.rows.at(-1).content='text';
  letters.rows.at(-1).id='letter-ab';
  summary=buildTypedDomainPlan(t,hash).summary;
  assert.equal(summary.planValid,false);
  assert.equal(summary.issues.duplicateIds,1);
});

test('incomplete required tables block the complete domain view',()=>{
  const data=syntheticDomainTables().filter(t=>t.table!=='public.campaign_access_profiles');
  const plan=buildTypedDomainPlan(data,hash);
  assert.equal(plan.summary.planValid,false);
  assert.ok(plan.summary.missingRequiredTables.includes('public.campaign_access_profiles'));
});


test('aggregate 15 dangling historical letter senders without leaking identities',()=>{
  const tables=syntheticDomainTables();
  const letters=tables.find(t=>t.table==='public.campaign_letters');
  for(let i=0;i<15;i++){
    letters.rows.push({
      id:'legacy-'+i,
      sender_user_id:'historical-deleted-uid-'+i,
      sender_player_id:null,
      recipient_player_id:null,
      recipient_house_id:'house-a',
      subject:'historical private subject '+i,
      content:'historical private content '+i,
      publication_state:'delivered',created_at:'2026-11-11 10:00:00+00',
    });
  }
  const report=buildTypedDomainPlan(tables,hash).summary;
  assert.equal(report.planValid,false);
  assert.equal(report.issues.orphanLinks,15);
  assert.equal(report.orphanLinksByType.letterSenderMissingAuth,15);
  assert.equal(report.sourceRowCounts.letters,19);
  assert.equal(report.typedCollections.letters,4);
  assert.equal(
    Object.values(report.orphanLinksByType).reduce((n,x)=>n+x,0),
    report.issues.orphanLinks
  );
  const output=JSON.stringify(report);
  assert.ok(!output.includes('historical-deleted-uid'));
  assert.ok(!output.includes('historical private subject'));
  assert.equal(report.firebaseCloudWrites,0);
});

test('categorizes missing roster, house, membership and recipient separately',()=>{
  const a=syntheticDomainTables();
  a.find(x=>x.table==='public.campaign_players').rows[0].roster_house_id='retired-house';
  a.find(x=>x.table==='public.house_memberships').rows.push({
    player_id:'player-a',house_id:'deleted-house',can_edit:'t',
  });
  a.find(x=>x.table==='public.campaign_letters').rows[0].recipient_player_id='deleted-player';
  a.find(x=>x.table==='public.campaign_letters').rows[1].recipient_house_id='deleted-house';
  const s=buildTypedDomainPlan(a,hash).summary;
  assert.equal(s.planValid,false);
  assert.equal(s.orphanLinksByType.rosterHouseNotInSnapshot,1);
  assert.equal(s.orphanLinksByType.membershipMissingHouse,1);
  assert.equal(s.orphanLinksByType.letterRecipientMissingPlayer,1);
  assert.equal(s.orphanLinksByType.letterRecipientMissingHouse,1);
  assert.equal(s.issues.orphanLinks,4);
  assert.equal(s.firebaseCloudWrites,0);
});
