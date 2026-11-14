import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './spy-missions-core.mjs';

const K=n=>`00000000-0000-4000-8000-00000000000${n}`;
const acc=o=>({userId:'u',active:true,requirePasswordChange:false,profile:'jogador',admin:false,playerId:'p',
  memberHouseIds:['hA'],editHouseIds:['hA'],...o});
const owner=m.spyScope('u',acc());
const reader=m.spyScope('u',acc({editHouseIds:[]}));
const stranger=m.spyScope('u',acc({memberHouseIds:['hB'],editHouseIds:['hB']}));
const narrator=m.spyScope('u',acc({profile:'narrador',admin:true,memberHouseIds:[],editHouseIds:[]}));
const code=fn=>{try{fn();}catch(e){return e.code;}return null;};
let n=100;const newId=()=>'id-'+(n++);
const NOW='2026-05-01T00:00:00.000Z';
const calendar={year:1522,month:0,day:5,festival:null,version:4};
const REGIONS=['veilstone','ferlin','helmlands','swordmark','crownlands','horselands','dragoncoast','shieldmark','elfhold',
  'volkumburgh','stonelands'];
const locations=REGIONS.map(r=>({id:'L-'+r,kind:'region',refId:r,regionId:r,approved:true}));
const agent=(o={})=>({id:'a1',ownerHouseId:'hA',codename:'Sombra',currentLocationId:'L-ferlin',status:'available',
  missionSuccesses:0,version:2,...o});
const target=(o={})=>({id:'hT',name:'Casa Alvo',classification:'noble',region:'Swordmarch',publicReviewed:true,...o});
const start=(o={})=>m.startMission({actor:owner,houseId:'hA',agent:agent(),target:target(),destination:'swordmark',
  expectedAgentVersion:2,expectedCalendarVersion:4,key:K(1),existingOp:null,existingTimeline:null,keyEvent:null,
  agentLocation:locations.find(l=>l.id==='L-ferlin'),locations,hasOpenOperation:false,calendar,newId,now:NOW,...o});

test('route: BFS, alphabetical neighbours, sea passage preferred, same region is zero', () => {
  assert.deepEqual(m.missionRoute('ferlin','swordmarch',locations),
    {rounds:1,legs:[{fromRegion:'ferlin',toRegion:'swordmark',passage:'land_neighbor'}]});
  assert.equal(m.missionRoute('Dragon Coast','crownland',locations).legs[0].passage,'sea_passage');
  assert.equal(m.missionRoute('elfhold','elfhold',locations).rounds,0);
  assert.equal(m.missionRoute('veilstone','dragoncoast',locations).rounds,3);
  assert.equal(code(()=>m.missionRoute('ferlin','nowhere',locations)),'invalid');
});

test('start: authorization and validation', () => {
  assert.equal(code(()=>start({actor:reader})),'denied');
  assert.equal(code(()=>start({actor:stranger})),'denied');
  assert.equal(start({actor:narrator}).alreadyApplied,false);
  assert.equal(code(()=>start({key:'x'})),'invalid');
  assert.equal(code(()=>start({agent:agent({status:'traveling'})})),'conflict');
  assert.equal(code(()=>start({expectedAgentVersion:9})),'conflict');
  assert.equal(code(()=>start({expectedCalendarVersion:9})),'conflict');
  assert.equal(code(()=>start({hasOpenOperation:true})),'conflict');
  assert.equal(code(()=>start({target:target({id:'hA'})})),'invalid');
  assert.equal(code(()=>start({target:target({publicReviewed:false})})),'invalid');
  assert.equal(code(()=>start({target:target({classification:'vassal'})})),'invalid');
  assert.equal(code(()=>start({destination:'ferlin'})),'invalid');
  assert.equal(code(()=>start({agentLocation:{regionId:'ferlin',approved:false}})),'invalid');
  assert.equal(code(()=>start({keyEvent:{requestKey:K(1)}})),'conflict');
});

test('start: travels with timeline, agent and event', () => {
  const r=start();
  assert.equal(r.result.status,'traveling');assert.equal(r.operation.status,'traveling');
  assert.equal(r.agent.status,'traveling');assert.equal(r.agent.version,3);
  assert.equal(r.agent.currentLocationId,'L-ferlin');
  assert.equal(r.timeline.departureKey,'1522-01-05');assert.equal(r.timeline.arrivalKey,'1522-01-15');
  assert.equal(r.timeline.investigationEndKey,'1522-01-25');assert.equal(r.timeline.travelDays,10);
  assert.equal(r.event.requestKey,K(1));assert.equal(r.event.eventType,'mission_started');
  assert.equal(r.operation.requestedFields[0],'house_resources');
  assert.equal(start({objective:'army'}).operation.requestedFields[0],'army');
  assert.equal(code(()=>start({objective:'gold'})),'invalid');
});

test('start: same region starts operating at once and moves the agent', () => {
  const r=start({agentLocation:{regionId:'swordmarch',approved:true},agent:agent({currentLocationId:'L-ferlin'})});
  assert.equal(r.result.status,'operating');assert.equal(r.timeline.travelDays,0);
  assert.equal(r.timeline.arrivalKey,'1522-01-05');assert.equal(r.agent.currentLocationId,'L-swordmark');
});

test('start: idempotent replay and key reuse', () => {
  const first=start();
  const again=start({existingOp:first.operation,existingTimeline:first.timeline});
  assert.equal(again.alreadyApplied,true);assert.equal(again.result.arrivalKey,'1522-01-15');
  assert.equal(code(()=>start({existingOp:{...first.operation,targetId:'other'}})),'conflict');
  assert.equal(code(()=>start({existingOp:{...first.operation,status:'cancelled'}})),'conflict');
  assert.equal(code(()=>start({objective:'army',existingOp:first.operation})),'conflict');
  assert.equal(start({existingOp:{...first.operation,requestedFields:['house_overview']},existingTimeline:first.timeline}).alreadyApplied,true);
});

test('cancel: frees the agent, versions, replay and denial', () => {
  const first=start();
  const cancel=(o={})=>m.cancelMission({actor:owner,houseId:'hA',operation:first.operation,agent:first.agent,previousEvent:null,
    expectedVersion:1,key:K(2),calendar,newId,now:NOW,...o});
  const r=cancel();
  assert.equal(r.operation.status,'cancelled');assert.equal(r.agent.status,'available');assert.equal(r.agent.version,4);
  assert.equal(r.event.oldState,'traveling');
  assert.equal(code(()=>cancel({actor:reader})),'denied');
  assert.equal(code(()=>cancel({expectedVersion:5})),'conflict');
  assert.equal(code(()=>cancel({operation:{...first.operation,status:'completed'}})),'invalid');
  assert.equal(code(()=>cancel({operation:{...first.operation,status:'cancelled'}})),'conflict');
  assert.equal(code(()=>cancel({agent:{...first.agent,status:'available'}})),'invalid');
  assert.equal(cancel({previousEvent:{operationId:first.operation.id,eventType:'mission_cancelled'}}).alreadyApplied,true);
  assert.equal(code(()=>cancel({previousEvent:{operationId:'x',eventType:'mission_cancelled'}})),'conflict');
});

test('hub clock moves traveling to operating to review, idempotently', () => {
  const first=start();
  const items=()=>[{timeline:first.timeline,operation:first.operation,agent:first.agent}];
  const at=(day)=>({...calendar,day});
  assert.equal(m.advanceMissions({actor:narrator,items:items(),calendar:at(14),newId}).length,0);
  const op=m.advanceMissions({actor:narrator,items:items(),calendar:{...calendar,month:0,day:15},newId});
  assert.equal(op[0].operation.status,'operating');assert.equal(op[0].agent.currentLocationId,'L-swordmark');
  const rev=m.advanceMissions({actor:narrator,items:items(),calendar:{...calendar,month:0,day:25},newId});
  assert.equal(rev[0].operation.status,'pending_narrator_review');assert.equal(rev[0].agent.status,'pending_review');
  assert.equal(m.advanceMissions({actor:narrator,items:[{...items()[0],operation:rev[0].operation}],
    calendar:{...calendar,month:0,day:25},newId}).length,0);
  assert.equal(code(()=>m.advanceMissions({actor:owner,items:items(),calendar,newId})),'denied');
});

const sheetState=(o={})=>({base:{law:20},permanent:{law:4},holdings:[],units:[],mailConsequences:[],...o});
test('preview uses the corrected difficulty and the source of the law', () => {
  const pv=(o={})=>m.previewMission({actor:owner,houseId:'hA',agent:agent(),target:target(),sheet:null,stats:null,...o});
  assert.equal(pv().source,'regional_fallback');assert.equal(pv().houseDefense,6);
  assert.equal(pv({stats:{law:50,regionId:'swordmark'}}).houseDefense,6+3*4);
  const s=pv({sheet:{state:sheetState({regionalApplied:true,method:'build',
    mailConsequences:[{active:true,changes:{law:6}},{active:false,changes:{law:99}},{active:true,changes:{law:-5}}],
    holdings:[{id:'x',itemId:'pros-secret-police',status:'active'},{id:'k',parentId:'x',itemId:'pros-dog-kennels--guard-dogs',status:'active'},
      {id:'b',parentId:'gone',itemId:'pros-black-market--ear-in-the-underworld',status:'active'}]})}});
  assert.equal(s.source,'operational_sheet');assert.equal(s.houseDefense,6+3*Math.floor(Math.max(0,20+4+10+6-30)/5)+9);
  assert.equal(pv().agentRank,'Verde');assert.equal(pv({agent:agent({missionSuccesses:9})}).agentCunning,6);
  assert.equal(code(()=>pv({actor:stranger})),'denied');
  assert.equal(code(()=>pv({agent:agent({status:'traveling'})})),'invalid');
  assert.equal(code(()=>pv({target:target({id:'hA'})})),'invalid');
  assert.equal(code(()=>pv({target:target({region:'Atlantis'})})),'invalid');
  assert.equal(code(()=>pv({sheet:{state:{base:{},permanent:{law:1}}}})),'invalid');
});

const REVIEW=(()=>{const f=start();return {...f.operation,status:'pending_narrator_review',version:3};})();
const review=()=>REVIEW;
const resolve=(o={})=>m.resolveMission({actor:narrator,operation:review(),agent:agent({status:'pending_review',version:5}),
  previousHistory:null,segments:[],upgrades:[],target:target(),sheet:null,stats:{law:20,regionId:'swordmark'},roll:9,modifier:0,
  discovered:false,guardOverride:true,prisonOverride:true,expectedVersion:5,key:K(3),reason:' ok ',calendar,newId,now:NOW,...o});

test('resolve: success increments successes and promotes at three', () => {
  const r=resolve();
  assert.equal(r.result.outcome,'mission_success');assert.equal(r.result.difficulty,6);
  assert.equal(r.agent.status,'available');assert.equal(r.agent.missionSuccesses,1);assert.equal(r.operation.status,'completed');
  assert.equal(r.decision.resolution,'success');assert.equal(r.history.length,1);assert.match(r.history[0].detail,/ · ok$/);
  const p=resolve({agent:agent({status:'pending_review',version:5,missionSuccesses:2}),roll:9});
  assert.equal(p.result.promoted,true);assert.equal(p.history[1].eventType,'promoted');assert.equal(p.history[1].agentRank,'Treinada');
  assert.equal(p.result.cunning,4);
});

test('resolve: failure and detection outcomes', () => {
  const hard={law:60,regionId:'swordmark'};//dc=6+3*6=24
  assert.equal(resolve({stats:hard,roll:9}).result.outcome,'mission_failure');
  assert.equal(resolve({stats:hard,roll:9,discovered:true,modifier:7,prisonOverride:false}).result.outcome,'escaped');//total16, deg 2, law60 guard, no prison
  assert.equal(resolve({stats:hard,roll:9,discovered:true,modifier:7,prisonOverride:true}).result.outcome,'captured');
  assert.equal(resolve({stats:hard,roll:9,discovered:true}).result.outcome,'dead');//deg3
  assert.equal(resolve({stats:hard,roll:9,discovered:true,upgrades:[{upgradeCode:'ace_in_the_hole'}]}).result.outcome,'captured');
  assert.equal(resolve({stats:hard,roll:9,discovered:true,upgrades:[{upgradeCode:'forged_documents'}]}).result.effectiveFailureDegrees,2);
  assert.equal(resolve({stats:hard,roll:9,discovered:true,guardOverride:false}).result.outcome,'escaped');
  const dead=resolve({stats:hard,roll:9,discovered:true});
  assert.equal(dead.agent.status,'dead');assert.equal(dead.decision.resolution,'dead');
});

test('resolve: sheet target derives guard, prison and defense bonus', () => {
  const state=sheetState({base:{law:60},permanent:{law:0},holdings:[{id:'g',itemId:'pros-gaol',status:'active'},
    {id:'p',itemId:'pros-secret-police',status:'active'}]});
  const r=resolve({sheet:{state},stats:null,guardOverride:undefined,prisonOverride:undefined,roll:9,discovered:true,modifier:7});
  assert.equal(r.result.difficulty,6+3*6+6);assert.equal(r.history[0].guardPresent,true);assert.equal(r.history[0].prisonPresent,true);
  const unit=resolve({sheet:{state:sheetState({units:[{name:'Guarda da Cidade',destroyed:false}]})},stats:null});
  assert.equal(unit.history[0].guardPresent,true);
  assert.equal(code(()=>resolve({sheet:{state:{base:{law:1},permanent:{}}}})),'invalid');
});

test('resolve: guards and idempotency', () => {
  assert.equal(code(()=>resolve({actor:owner})),'denied');
  assert.equal(code(()=>resolve({operation:{...review(),status:'operating'}})),'invalid');
  assert.equal(code(()=>resolve({segments:[{status:'pending'}]})),'invalid');
  assert.equal(code(()=>resolve({expectedVersion:1})),'conflict');
  assert.equal(code(()=>resolve({roll:2})),'invalid');assert.equal(code(()=>resolve({roll:19})),'invalid');
  assert.equal(code(()=>resolve({modifier:10})),'invalid');assert.equal(code(()=>resolve({discovered:'no'})),'invalid');
  assert.equal(code(()=>resolve({reason:'x'.repeat(1201)})),'invalid');
  assert.equal(code(()=>resolve({stats:null,guardOverride:undefined})),'invalid');
  assert.equal(code(()=>resolve({target:target({publicReviewed:false})})),'invalid');
  const done=resolve({previousHistory:{agentId:'a1',operationId:review().id}});
  assert.equal(done.alreadyApplied,true);
  assert.equal(code(()=>resolve({previousHistory:{agentId:'zz',operationId:review().id}})),'conflict');
});

const H=(o)=>({id:'x',ownerHouseId:'hB',agentId:'a1',operationId:'o1',eventType:'escaped',eventDateKey:'1522-02-01',
  targetHouseId:'hA',createdAt:'2026-01-01T00:00:00.000Z',detail:'d',targetRegion:'swordmark',...o});
const OP=(o)=>({id:'o1',ownerHouseId:'hB',targetType:'house',targetId:'hA',status:'completed',assetId:'a1',requestedFields:['army'],
  createdAt:'2026-01-01T00:00:00.000Z',...o});

test('counterintelligence counts detections once per operation, newest first, no outsiders', () => {
  const r=m.counterintelligence({actor:owner,houseId:'hA',operations:[OP(),OP({id:'o2'}),OP({id:'o3',status:'operating'}),
    OP({id:'o4',ownerHouseId:'hA'})],
    history:[H({id:'1'}),H({id:'2',eventType:'captured',createdAt:'2026-01-02T00:00:00.000Z'}),
      H({id:'3',operationId:'o2',eventDateKey:'1522-F-midsummer',eventType:'dead'}),H({id:'4',eventType:'mission_success'}),
      H({id:'5',operationId:'o3'}),H({id:'6',operationId:'o4',ownerHouseId:'hA'}),H({id:'7',targetHouseId:'zz'})]});
  assert.equal(r.totalDetections,2);
  assert.deepEqual(r.alerts,[{dateKey:'1522-F-midsummer',result:'dead'},{dateKey:'1522-02-01',result:'captured'}]);
  assert.equal(code(()=>m.counterintelligence({actor:stranger,houseId:'hA',operations:[],history:[]})),'denied');
});

test('narrator panels: dashboard order, objective default and incidents', () => {
  const catalog=[{id:'hA',name:'Alfa'},{id:'hB',name:'Beta'}];
  const dash=m.narratorOperations({actor:narrator,catalog,assets:[{id:'a1',codename:'Sombra',status:'available'}],timelines:[],
    decisions:[{operationId:'o2',resolution:'success',createdAt:'2026-01-01'}],
    operations:[OP({id:'o1',status:'completed'}),OP({id:'o2',status:'pending_narrator_review',requestedFields:['house_overview']}),
      OP({id:'o3',status:'traveling',targetType:'region'})]});
  assert.deepEqual(dash.map(d=>d.operationId),['o2','o1']);assert.equal(dash[0].objective,'house_resources');
  assert.equal(dash[1].objective,'army');assert.equal(dash[0].outcome,'success');assert.equal(dash[0].agentName,'Sombra');
  assert.equal(code(()=>m.narratorOperations({actor:owner,operations:[],catalog,assets:[],timelines:[],decisions:[]})),'denied');
  const inc=m.incidentHistory({actor:narrator,operations:[OP()],catalog,assets:[{id:'a1',codename:'Sombra'}],
    history:[H({id:'1'}),H({id:'2',eventType:'promoted'}),H({id:'3',ownerHouseId:'zz'})]});
  assert.equal(inc.length,1);assert.equal(inc[0].ownerHouseName,'Beta');assert.equal(inc[0].targetHouseName,'Alfa');
  assert.equal(code(()=>m.incidentHistory({actor:owner,operations:[],history:[],catalog,assets:[]})),'denied');
});
