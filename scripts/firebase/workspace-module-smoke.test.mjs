import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectModuleSourceContracts,MODULE_TABLES}
  from './workspace-module-smoke.mjs';
const data=()=>Object.fromEntries(MODULE_TABLES.map(name=>[name,[]]));
const add=(t)=>{
 t.campaign_records=[{id:'r1',visibility:'house',kind:'document',
   house_id:'h1',title:'Private Record',content:'Private text',version:1}];
 t.record_versions=[{record_id:'r1',version:1,snapshot:{title:'Private Record'}}];
 t.campaign_newspapers=[{id:'n1',edition_no:1,title:'Private title',
   subtitle:'',state:'published',blocks:[],version:2,publication_revision:1}];
 t.campaign_newspaper_revisions=[{id:1,newspaper_id:'n1',
   previous_version:1,snapshot:{title:'Old private title'}}];
 t.spy_assets=[{id:'a1',owner_house_id:'h1',codename:'Private agent',
   status:'available',mission_successes:0,version:1}];
 t.spy_operations=[{id:'o1',asset_id:'a1',owner_house_id:'h1',
   status:'completed',mission_kind:'intelligence',
   target_type:'house',target_id:'secret-house'}];
 t.spy_mission_timeline=[{operation_id:'o1',agent_id:'a1',owner_house_id:'h1'}];
 t.campaign_players=[{id:'p1',user_id:'u1',active:true,
   require_password_change:false,roster_house_id:'h1'}];
 t.house_memberships=[{player_id:'p1',house_id:'h1'}];
 t.campaign_houses=[{id:'h1',name:'Private House'}];
 t.noble_house_sheets=[{house_id:'h1',version:2,
   state:{schemaVersion:1,houseId:'h1',phase:'active',
     units:[{id:'troop-1',name:'Private troops'}],
     holdings:[{id:'holding-1',name:'Private estate'}],
     projects:[{id:'project-1',name:'Private project'}],
     domains:[{id:'domain-1',name:'Private domain'}],
     court:[{id:'court-1',name:'Private court member'}]}}];
 t.noble_house_ledger=[{id:'ledger-1',house_id:'h1',version:2,
   action:'purchase'}];
 t.campaign_letters=[{id:'l1'}];
 t.letter_rounds=[{number:1,status:'open'}];
 return t;
};
const mail=(rows,viewer,input)=>{
 assert.ok(viewer.profile==='jogador'||viewer.profile==='narrador');
 assert.equal(input.size,20);
 return {total:rows.campaign_letters.length,letters:[],replies:[]};
};
test('all module projections verify shape with aggregate-only output',()=>{
 const v=inspectModuleSourceContracts(add(data()),mail);
 assert.equal(v.status,'source_projection_consistent');
 assert.equal(v.moduleCount,5);
 assert.equal(v.casas.houses,1);
 assert.equal(v.casas.sheets,1);
 assert.equal(v.casas.units,1);
 assert.equal(v.casas.holdings,1);
 assert.equal(v.casas.projects,1);
 assert.equal(v.casas.ledger,1);
 assert.equal(v.records.items,1);
 assert.equal(v.newspaper.editions,1);
 assert.equal(v.espionagem.agents,1);
 assert.equal(v.missivas.playerProjection,'source_shape_valid');
 assert.equal(v.operationalUIConnected,false);
 const encoded=JSON.stringify(v);
 for(const secret of ['Private','secret-house','u1','p1','h1'])
   assert.ok(!encoded.includes(secret));
});
test('malformed historical records fail closed with only a public module label',()=>{
 const data1=add(data());
 data1.spy_operations[0].asset_id='a2';
 assert.throws(()=>inspectModuleSourceContracts(data1,mail),
   e=>e.message==='workspace_module_contract_spies_failed');
 const badHouse=add(data());
 badHouse.noble_house_sheets[0].state.houseId='foreign';
 assert.throws(()=>inspectModuleSourceContracts(badHouse,mail),
   e=>e.message==='workspace_module_contract_houses_failed');
 const data2=add(data());
 data2.record_versions[0].record_id='lost';
 assert.throws(()=>inspectModuleSourceContracts(data2,mail),
   e=>e.message==='workspace_module_contract_records_failed');
});
test('partial tables and thrown mail projection never become success',()=>{
 const partial=add(data());delete partial.campaign_houses;
 assert.throws(()=>inspectModuleSourceContracts(partial,mail),
   /workspace_module_source_invalid/);
 const t=add(data());
 assert.throws(()=>inspectModuleSourceContracts(t,()=>{
   throw Error('PRIVATE_CONTENT_SHOULD_NOT_LEAK');
 }),e=>e.message==='workspace_module_contract_mail_failed'&&
     !e.message.includes('PRIVATE_CONTENT_SHOULD_NOT_LEAK'));
});
