import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWorkspaceLinks,RELATIONS} from './workspace-link-audit.mjs';
function dataset(){
 const names=new Set(RELATIONS.flatMap(v=>[v[1],v[3]]));
 const tables=Object.fromEntries([...names].map(n=>[n,[]]));
 tables.campaign_houses=[{id:'h1'},{id:'h2'}];
 tables.campaign_players=[{id:'p1'}];
 tables.house_memberships=[{player_id:'p1',house_id:'h1'}];
 tables.campaign_letters=[{id:'letter-1',recipient_player_id:null,
  recipient_house_id:null,origin_house_id:'h1'}];
 tables.letter_replies=[{id:'reply-1',letter_id:'letter-1'}];
 tables.letter_receipts=[{letter_id:'letter-1'}];
 tables.campaign_newspapers=[{id:'paper-1'},{id:'paper-2'}];
 tables.campaign_newspaper_revisions=[
  {newspaper_id:'paper-1'},{newspaper_id:'paper-1'},
  {newspaper_id:'paper-2'}];
 tables.campaign_newspaper_reads=[{newspaper_id:'paper-1'}];
 tables.spy_assets=[{id:'agent-1',owner_house_id:'h1'}];
 tables.spy_operations=[{id:'op-1',agent_id:'agent-1'}];
 tables.spy_mission_timeline=[{operation_id:'op-1'}];
 return tables;
}
test('detects only aggregate cross-module orphan references',()=>{
 const tables=dataset();
 const normal=analyzeWorkspaceLinks(tables);
 assert.equal(normal.status,'complete');
 assert.equal(normal.orphanReferences,0);
 assert.equal(normal.modules.jornal.valid,4);
 assert.equal(normal.modules.espionagem.valid,3);
 assert.equal(normal.operationalConnected,false);
 tables.campaign_newspaper_revisions.push({newspaper_id:'missing-secret-edition'});
 tables.letter_replies.push({id:'reply-2',letter_id:'missing-secret-letter'});
 tables.spy_operations.push({id:'op-2',agent_id:'missing-secret-spy'});
 const broken=analyzeWorkspaceLinks(tables);
 assert.equal(broken.orphanReferences,3);
 assert.equal(broken.modules.jornal.orphan,1);
 assert.equal(broken.modules.missivas.orphan,1);
 assert.equal(broken.modules.espionagem.orphan,1);
 const encoded=JSON.stringify(broken);
 for(const privateId of ['missing-secret-edition','missing-secret-letter','missing-secret-spy'])
  assert.ok(!encoded.includes(privateId));
});
test('missing required tables and invalid rows cannot produce a good report',()=>{
 const tables=dataset();delete tables.campaign_newspapers;
 assert.throws(()=>analyzeWorkspaceLinks(tables),/workspace_links_missing_table/);
 const other=dataset();other.letter_replies.push(null);
 assert.throws(()=>analyzeWorkspaceLinks(other),/workspace_links_invalid/);
});
