import test from 'node:test';
import assert from 'node:assert/strict';
import * as s from './spy-agents-core.mjs';

const K=n=>`00000000-0000-4000-8000-00000000000${n}`;
const acc=o=>({userId:'u',active:true,requirePasswordChange:false,profile:'jogador',admin:false,
  playerId:'p',memberHouseIds:['hA'],editHouseIds:['hA'],...o});
const owner=s.spyScope('u',acc());
const reader=s.spyScope('u',acc({editHouseIds:[]}));
const stranger=s.spyScope('u',acc({memberHouseIds:['hB'],editHouseIds:['hB']}));
const narrator=s.spyScope('u',acc({profile:'narrador',admin:true,memberHouseIds:[],editHouseIds:[]}));
const code=fn=>{try{fn();}catch(e){return e.code;}return null;};
let n=100;const newId=()=>'id-'+(n++);
const NOW='2026-05-01T00:00:00.000Z';
const calendar={year:1522,month:0,day:5,festival:null,version:4};
const hold=(o={})=>({id:'h1',name:'Rede Alfa',itemId:'pros-spy-network',status:'active',domainId:'dom1',...o});
const sheet=(o={},hs=[hold()])=>({houseId:'hA',version:7,state:{phase:'active',month:2,base:{wealth:3},
  permanent:{wealth:0},holdings:hs,...o}});
const locations=[{id:'loc1',kind:'domain',refId:'dom1',regionId:'sword-coast'},{id:'loc2',kind:'region',refId:'reg',regionId:null}];
const agent=(o={})=>({id:'a1',ownerHouseId:'hA',kind:'network_cell',codename:'Sombra',sourceHoldingId:'h1',
  currentLocationId:'loc1',status:'available',missionSuccesses:0,portraitId:null,version:2,createdAt:'2026-01-01T00:00:00.000Z',...o});
const recruit=(o={})=>s.recruitAgent({actor:owner,houseId:'hA',sourceHolding:'h1',codename:' Raposa ',key:K(1),sheet:sheet(),
  assets:[],existingByKey:null,existingAgent:null,locations,calendar,newId,now:NOW,...o});

test('rank tiers follow successes', () => {
  assert.deepEqual([0,2,3,6,9,20].map(s.rankOf),['Verde','Verde','Treinada','Veterana','Elite','Elite']);
  assert.equal(s.cunningOf(9),6);assert.equal(s.toNextRank(4),2);assert.equal(s.toNextRank(9),0);
});

test('access: only editors of the house write, members read, others nothing', () => {
  assert.equal(code(()=>recruit({actor:reader})),'denied');
  assert.equal(code(()=>recruit({actor:stranger})),'denied');
  assert.equal(recruit({actor:narrator}).alreadyApplied,false);
  assert.equal(code(()=>s.spyScope('u',acc({active:false}))),'denied');
});

test('recruitment fills a cell and records the history', () => {
  const r=recruit();
  assert.equal(r.agent.codename,'Raposa');assert.equal(r.agent.sourceRef,'replacement:h1:'+K(1));
  assert.equal(r.agent.currentLocationId,'loc1');assert.equal(r.agent.status,'available');
  assert.equal(r.history.eventType,'recruited');assert.equal(r.history.eventDateKey,'1522-01-05');
  assert.equal(r.history.targetRegion,'sword-coast');assert.equal(r.history.calendarVersion,4);
  assert.equal(code(()=>recruit({codename:'x'})),'invalid');
  assert.equal(code(()=>recruit({codename:'a\u0007b'})),'invalid');
  assert.equal(code(()=>recruit({key:'nope'})),'invalid');
  assert.equal(code(()=>recruit({sheet:null})),'invalid');
  assert.equal(code(()=>recruit({sourceHolding:'zzz'})),'invalid');
  assert.equal(code(()=>recruit({sheet:sheet({},[hold({status:'building'})])})),'invalid');
  assert.equal(code(()=>recruit({sheet:sheet({},[hold({parentId:'p'}),{id:'p',status:'destroyed'}])})),'invalid');
  assert.equal(code(()=>recruit({locations:[]})),'invalid');
  // capacity: 3 cells in a base network, retired/dead do not count
  const full=[agent({id:'1'}),agent({id:'2'}),agent({id:'3'})];
  assert.equal(code(()=>recruit({assets:full})),'invalid');
  assert.equal(recruit({assets:[...full.slice(0,2),agent({id:'3',status:'dead'})]}).alreadyApplied,false);
  const ext=hold({id:'h2',itemId:'pros-spy-network--expanded-network'});
  assert.equal(code(()=>recruit({sourceHolding:'h2',sheet:sheet({},[ext]),assets:[agent({id:'1',sourceHoldingId:'h2'}),agent({id:'2',sourceHoldingId:'h2'})]})),'invalid');
});

test('recruitment is idempotent and never crosses houses', () => {
  const again=recruit({existingByKey:{ownerHouseId:'hA'},existingAgent:agent()});
  assert.equal(again.alreadyApplied,true);assert.equal(again.result.codename,'Sombra');
  assert.equal(code(()=>recruit({existingByKey:{ownerHouseId:'hB'},existingAgent:agent()})),'conflict');
});

const buy=(o={})=>s.buyUpgrade({actor:owner,houseId:'hA',agent:agent(),code:'forged_documents',expectedAgentVersion:2,
  expectedHouseVersion:7,key:K(2),sheet:sheet(),keyUpgrade:null,agentUpgrades:[],ledgerKeyTaken:false,historyKeyTaken:false,
  hasActiveOperation:false,calendar,newId,now:NOW,...o});

test('upgrade purchase debits Wealth, bumps versions and ledgers', () => {
  const r=buy();
  assert.equal(r.sheet.state.permanent.wealth,-1);assert.equal(r.sheet.version,8);assert.equal(r.agent.version,3);
  assert.equal(r.ledger.action,'spy_agent_upgrade');assert.equal(r.ledger.campaignMonth,2);
  assert.equal(r.history.eventType,'upgrade_purchased');assert.equal(r.upgrade.upgradeCode,'forged_documents');
  assert.equal(r.result.remainingWealthEstimate,2);
  assert.equal(buy({keyUpgrade:{agentId:'a1',ownerHouseId:'hA',upgradeCode:'forged_documents'}}).alreadyApplied,true);
  assert.equal(code(()=>buy({keyUpgrade:{agentId:'a2',ownerHouseId:'hA',upgradeCode:'forged_documents'}})),'conflict');
  assert.equal(code(()=>buy({ledgerKeyTaken:true})),'conflict');
  assert.equal(code(()=>buy({code:'x'})),'invalid');
  assert.equal(code(()=>buy({agent:agent({status:'traveling'})})),'invalid');
  assert.equal(code(()=>buy({hasActiveOperation:true})),'invalid');
  assert.equal(code(()=>buy({expectedAgentVersion:1})),'conflict');
  assert.equal(code(()=>buy({expectedHouseVersion:1})),'conflict');
  assert.equal(code(()=>buy({agentUpgrades:[{upgradeCode:'forged_documents'}]})),'invalid');
  assert.equal(code(()=>buy({sheet:sheet({base:{wealth:0}})})),'invalid');
  assert.equal(code(()=>buy({agent:agent({ownerHouseId:'hB'})})),'invalid');
});

test('portrait: active catalog, one holder per campaign, never for retired', () => {
  const cat={id:'p1',active:true};
  const ok=s.assignPortrait({actor:owner,houseId:'hA',agent:agent(),portraitId:'p1',expectedVersion:2,catalogItem:cat,heldByOther:false});
  assert.equal(ok.agent.portraitId,'p1');assert.equal(ok.result.version,3);
  const same=s.assignPortrait({actor:owner,houseId:'hA',agent:agent({portraitId:'p1'}),portraitId:'p1',expectedVersion:2,catalogItem:cat,heldByOther:false});
  assert.equal(same.changed,false);assert.equal(same.result.version,2);
  const base={actor:owner,houseId:'hA',agent:agent(),portraitId:'p1',expectedVersion:2,catalogItem:cat,heldByOther:false};
  assert.equal(code(()=>s.assignPortrait({...base,heldByOther:true})),'conflict');
  assert.equal(code(()=>s.assignPortrait({...base,catalogItem:{active:false}})),'invalid');
  assert.equal(code(()=>s.assignPortrait({...base,agent:agent({status:'retired'})})),'invalid');
  assert.equal(code(()=>s.assignPortrait({...base,expectedVersion:1})),'conflict');
});

const create=(o={},ctx={})=>s.createAgent({actor:owner,houseId:'hA',sourceHolding:'h1',codename:'Corvo',portraitId:'p1',
  upgrades:['forged_documents','ace_in_the_hole'],key:K(3),newId,now:NOW,ctx:{existingByKey:null,existingAgent:null,
  existingAgentUpgrades:[],portrait:{id:'p1',active:true},portraitHeldByOther:false,catalogHasActive:true,
  sheet:sheet({base:{wealth:5}}),assets:[],locations,calendar,ledgerKeysTaken:new Set(),historyKeysTaken:new Set(),...ctx},...o});

test('creation = recruit + portrait + paid upgrades in one unit', () => {
  const r=create();
  assert.equal(r.agent.portraitId,'p1');assert.equal(r.upgrades.length,2);
  assert.equal(r.sheet.state.permanent.wealth,-2);assert.equal(r.sheet.version,9);
  assert.equal(r.agent.version,3);                                 // 1 + two purchases (portrait does not bump)
  assert.deepEqual(r.histories.map(h=>h.eventType),['recruited','upgrade_purchased','upgrade_purchased']);
  assert.equal(r.ledgers.length,2);assert.match(r.ledgers[0].operationKey,/^[0-9a-f-]{36}$/);
  assert.notEqual(r.ledgers[0].operationKey,r.ledgers[1].operationKey);
  assert.equal(s.upgradeKeyFor(K(3),'forged_documents'),r.ledgers[0].operationKey);
  assert.equal(code(()=>create({upgrades:['x']})),'invalid');
  assert.equal(code(()=>create({upgrades:['forged_documents','forged_documents']})),'invalid');
  assert.equal(code(()=>create({portraitId:null})),'invalid');
  assert.equal(create({portraitId:null},{catalogHasActive:false}).agent.portraitId,null);
  assert.equal(code(()=>create({},{portrait:{active:false}})),'invalid');
  assert.equal(code(()=>create({},{portraitHeldByOther:true})),'conflict');
  assert.equal(code(()=>create({},{sheet:sheet({base:{wealth:1}})})),'invalid'); // only 1 point for 2 upgrades
});

test('creation retry returns the same agent only with identical data', () => {
  const a=agent({codename:'Corvo',portraitId:'p1'});
  const ex={existingByKey:{ownerHouseId:'hA',eventType:'recruited'},existingAgent:a,
    existingAgentUpgrades:[{upgradeCode:'ace_in_the_hole'},{upgradeCode:'forged_documents'}]};
  assert.equal(create({},ex).alreadyApplied,true);
  assert.equal(code(()=>create({codename:'Outro'},ex)),'conflict');
  assert.equal(code(()=>create({portraitId:'p2'},ex)),'conflict');
  assert.equal(code(()=>create({upgrades:['forged_documents']},ex)),'conflict');
  assert.equal(code(()=>create({},{existingByKey:{ownerHouseId:'hA',eventType:'upgrade_purchased'}})),'conflict');
});

const remove=(o={})=>s.removeAgent({actor:owner,houseId:'hA',agent:agent({portraitId:'p1'}),expectedAgentVersion:2,
  expectedHouseVersion:7,key:K(4),sheet:sheet({permanent:{wealth:-2}}),previousRemoval:null,keyRemoval:null,
  ledgerKeyTaken:false,agentUpgrades:[{costWealth:1},{costWealth:1}],hasActiveOperation:false,calendar,newId,now:NOW,...o});

test('removal retires, refunds paid upgrades and frees the portrait', () => {
  const r=remove();
  assert.equal(r.agent.status,'retired');assert.equal(r.agent.portraitId,null);assert.equal(r.agent.version,3);
  assert.equal(r.sheet.state.permanent.wealth,0);assert.equal(r.removal.refundedWealth,2);
  assert.equal(r.removal.portraitId,'p1');assert.equal(r.ledger.action,'spy_agent_removed');
  assert.equal(r.history.eventType,'retired');assert.equal(r.result.portraitReleased,true);
  assert.equal(remove({agentUpgrades:[]}).result.refundedWealth,0);
  assert.equal(remove({previousRemoval:{requestKey:K(4),refundedWealth:2,portraitId:'p1'}}).alreadyApplied,true);
  assert.equal(code(()=>remove({previousRemoval:{requestKey:K(5),refundedWealth:2}})),'conflict');
  assert.equal(code(()=>remove({keyRemoval:{}})),'conflict');
  assert.equal(code(()=>remove({agent:agent({status:'operating'})})),'invalid');
  assert.equal(code(()=>remove({hasActiveOperation:true})),'invalid');
  assert.equal(code(()=>remove({expectedAgentVersion:9})),'conflict');
  assert.equal(code(()=>remove({agentUpgrades:[{costWealth:1},{costWealth:1},{costWealth:1}]})),'invalid');
  assert.equal(code(()=>remove({sheet:sheet({permanent:{}})})),'invalid');
  assert.equal(code(()=>remove({actor:reader})),'denied');
});

test('management view and recruitment options', () => {
  const assets=[agent({missionSuccesses:4,portraitId:'p1'}),agent({id:'a2',ownerHouseId:'hB',portraitId:'p2'}),
    agent({id:'a3',status:'retired',createdAt:'2026-02-01T00:00:00.000Z'})];
  const catalog=[{id:'p2',label:'B',imageUrl:'u',active:true,sortOrder:2},{id:'p1',label:'A',imageUrl:'u',active:true,sortOrder:1},
    {id:'p3',label:'C',imageUrl:'u',active:false,sortOrder:0}];
  const v=s.houseManagement({actor:owner,houseId:'hA',assets:assets.filter(a=>a.ownerHouseId==='hA'),allAssets:assets,
    operations:[{id:'o1',ownerHouseId:'hA',assetId:'a1',missionKind:'k',targetType:'house',targetId:'t',status:'active',createdAt:'2026-03-01'},
      {id:'o2',ownerHouseId:'hB'}],
    segments:[{operationId:'o1',status:'arrived',ordinal:1,durationDays:2,arrivalKey:'1522-01-07'},
      {operationId:'o1',status:'cancelled',ordinal:3,durationDays:9,arrivalKey:'x'},
      {operationId:'o1',status:'arrived',ordinal:2,durationDays:3,arrivalKey:'1522-01-10'}],
    history:[{id:'h1',ownerHouseId:'hA',createdAt:'1'},{id:'h2',ownerHouseId:'hB',createdAt:'2'}],
    upgrades:[{agentId:'a1',upgradeCode:'ace_in_the_hole'}],locations,sheet:sheet(),catalog});
  assert.equal(v.agents.length,2);
  assert.equal(v.agents[0].rank,'Treinada');assert.equal(v.agents[0].toNextRank,2);assert.equal(v.agents[0].aceInTheHole,true);
  assert.equal(v.agents[0].currentRegion,'sword-coast');
  assert.deepEqual(v.operations.map(o=>[o.travelDays,o.arrivalKey]),[[5,'1522-01-10']]);
  assert.equal(v.history.length,1);assert.equal(v.houseVersion,7);
  assert.deepEqual(v.portraits.map(p=>[p.id,p.assignedAgentId,p.occupied]),[['p1','a1',true],['p2',null,true]]);
  assert.equal(v.recruitment[0].capacity,3);assert.equal(v.recruitment[0].occupied,1); // retired is free
  assert.equal(code(()=>s.houseManagement({actor:stranger,houseId:'hA',assets:[],allAssets:[],operations:[],segments:[],history:[],upgrades:[],locations,sheet:null,catalog:[]})),'denied');
  const o=s.recruitmentOptions({actor:reader,houseId:'hA',assets,allAssets:assets,sheet:sheet({phase:'draft'}),catalog});
  assert.deepEqual(o.recruitment,[]);
  assert.equal(s.recruitmentOptions({actor:reader,houseId:'hA',assets,allAssets:assets,sheet:sheet(),catalog}).recruitment.length,1);
});
