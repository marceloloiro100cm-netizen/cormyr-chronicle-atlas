import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPrivateAccessGraph } from './audit-private-access-graph.mjs';

const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const fixture=()=>[
  tab('auth.users',[
    {id:'admin-secret'},{id:'player-secret'},{id:'editor-secret'},
  ]),
  tab('public.campaign_players',[
    {id:'p1',user_id:'player-secret',active:'t',require_password_change:'f',roster_house_id:'house1'},
    {id:'p2',user_id:'editor-secret',active:'t',require_password_change:'f',roster_house_id:null},
  ]),
  tab('public.campaign_houses',[{id:'house1'}]),
  tab('public.house_memberships',[
    {player_id:'p1',house_id:'house1',can_edit:'t',can_edit_attributes:'f'},
  ]),
  tab('public.user_roles',[{user_id:'admin-secret',role:'admin'}]),
  tab('public.campaign_access_profiles',[
    {user_id:'admin-secret',profile:'narrador',active:'t'},
    {user_id:'player-secret',profile:'jogador',active:'t'},
    {user_id:'editor-secret',profile:'editor',active:'t'},
  ]),
];

test('consistent narrator, player and editor are counted without printing identities', () => {
  const report=assessPrivateAccessGraph(fixture());
  assert.equal(report.internallyConsistent,true);
  assert.equal(report.counts.sourceAuthAccounts,3);
  assert.equal(report.counts.adminRoleRecords,1);
  assert.equal(report.counts.editorProfiles,1);
  assert.equal(report.counts.editorsWithHouseMembership,0);
  assert.equal(report.counts.editorsWithRosterHouse,0);
  assert.equal(report.readyForCloudAuthorization,false);
  assert.ok(!JSON.stringify(report).includes('admin-secret'));
  assert.ok(!JSON.stringify(report).includes('house1'));
  assert.ok(!JSON.stringify(report).includes('p1'));
});

test('editor gains no house or narrator access even when malformed source rows exist', () => {
  const tabs=fixture();
  tabs[3].rows.push({player_id:'p2',house_id:'house1',can_edit:'t',can_edit_attributes:'t'});
  tabs[1].rows[1].roster_house_id='house1';
  tabs[4].rows.push({user_id:'editor-secret',role:'admin'});
  const report=assessPrivateAccessGraph(tabs);
  assert.equal(report.internallyConsistent,false);
  assert.equal(report.counts.editorsWithHouseMembership,1);
  assert.equal(report.counts.editorsWithRosterHouse,1);
  assert.equal(report.counts.editorsWithAdminRole,1);
  assert.ok(report.blockers.some(e=>e.reason==='editorsWithHouseMembership'));
  assert.ok(report.blockers.some(e=>e.reason==='narratorRoleConflicts'));
});

test('reports missing dependencies, orphan users and invalid permission flag without leaking identifiers', () => {
  const tabs=fixture();
  tabs[1].rows[0].user_id='not-in-auth';
  tabs[3].rows[0].house_id='missing-house-name';
  tabs[3].rows[0].can_edit='GRANTED';
  tabs[3].rows.push({player_id:'unknown-player',house_id:'house1',can_edit:'f'});
  tabs.splice(tabs.findIndex(e=>e.table==='public.campaign_access_profiles'),1);
  const report=assessPrivateAccessGraph(tabs);
  assert.equal(report.internallyConsistent,false);
  assert.ok(report.missingRequiredTables.includes('public.campaign_access_profiles'));
  assert.ok(report.counts.orphanPlayers>0);
  assert.ok(report.counts.missingMembershipHouses>0);
  assert.ok(report.counts.orphanMembershipPlayers>0);
  assert.ok(report.counts.invalidPermissionFlags>0);
  assert.ok(!JSON.stringify(report).includes('not-in-auth'));
  assert.ok(!JSON.stringify(report).includes('missing-house-name'));
});

test('narrator without matching admin role must be reconciled before migration',()=>{
  const tabs=fixture();
  tabs.find(t=>t.table==='public.user_roles').rows=[];
  const report=assessPrivateAccessGraph(tabs);
  assert.equal(report.counts.narratorRoleConflicts,1);
  assert.equal(report.readyForCloudAuthorization,false);
});

test('same auth UID mapped to multiple campaign players is detected',()=>{
  const tabs=fixture();
  tabs.find(t=>t.table==='public.campaign_players').rows.push({
    id:'p3', user_id:'player-secret', active:'t', require_password_change:'f',
    roster_house_id:null,
  });
  const report=assessPrivateAccessGraph(tabs);
  assert.equal(report.counts.duplicatePlayerAccounts,1);
});
