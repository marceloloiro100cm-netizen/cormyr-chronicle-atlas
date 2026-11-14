import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as i from './spy-intel-core.mjs';
import {spyScope} from './spy-agents-core.mjs';

const acc=o=>({userId:'u',active:true,requirePasswordChange:false,profile:'jogador',admin:false,playerId:'p',
  memberHouseIds:['hA'],editHouseIds:['hA'],...o});
const owner=spyScope('u',acc());
const stranger=spyScope('u',acc({memberHouseIds:['hB'],editHouseIds:['hB']}));
const narrator=spyScope('u',acc({profile:'narrador',admin:true,memberHouseIds:[],editHouseIds:[]}));
const code=fn=>{try{fn();}catch(e){return e.code;}return null;};
let n=100;const newId=()=>'id-'+(n++);
const NOW='2026-05-01T00:00:00.000Z';
const calendar={year:1522,month:1,day:3,festival:null,version:6};
const stats={houseId:'hT',defense:7,influence:3,lands:4,law:25,power:5,population:6,wealth:8};
const operation=(o={})=>({id:'op1',ownerHouseId:'hA',targetId:'hT',targetType:'house',status:'completed',requestedFields:['house_resources'],...o});
const decision=(o={})=>({resolution:'success',difficulty:10,modifiers:{roll:12,modifier:3},...o});
const award=(o={})=>i.awardOnDecision({decision:decision(),operation:operation(),dossier:null,findings:[],awardExists:false,stats,sheet:null,
  calendar,newId,now:NOW,...o});
const md5=s=>createHash('md5').update(s).digest('hex');

test('capacity grows with the success margin up to seven', () => {
  assert.deepEqual([0,4,5,10,15,20,40].map(i.capacityOf),[3,3,4,5,6,7,7]);
});

test('award: reveals capacity attributes in md5 order for the operation', () => {
  const r=award();//margin 5 -> capacity 4
  assert.equal(r.award.revealCapacity,4);assert.equal(r.award.successDegrees,1);assert.equal(r.award.processingState,'complete');
  const expected=[...i.RESOURCES].sort((a,b)=>md5('op1:'+a)<md5('op1:'+b)?-1:1).slice(0,4);
  assert.deepEqual(r.findings.map(f=>f.subjectKey),expected);
  assert.equal(r.award.revealedCount,4);assert.equal(r.events.every(e=>e.eventType==='revealed'),true);
  assert.deepEqual(r.findings[0].valueSnapshot,{value:stats[expected[0]],source:'official_noble_stats'});
  assert.equal(r.findings[0].discoveredDateKey,'1522-02-03');assert.equal(r.events[0].calendarVersion,6);
  assert.equal(r.dossier.ownerHouseId,'hA');assert.equal(r.dossier.targetHouseId,'hT');
});

test('award: refreshes known findings when nothing new remains', () => {
  const known=i.RESOURCES.map(k=>({id:'f-'+k,dossierId:'d1',objective:'house_resources',subjectKey:k,
    valueSnapshot:{value:0},discoveredOperationId:'older',verifiedOperationId:'older'}));
  const r=award({dossier:{id:'d1',ownerHouseId:'hA',targetHouseId:'hT'},findings:known});
  assert.equal(r.award.revealedCount,0);assert.equal(r.award.refreshedCount,4);
  assert.equal(r.events.every(e=>e.eventType==='refreshed'&&e.previousSnapshot.value===0),true);
  assert.equal(r.findings.every(f=>f.verifiedOperationId==='op1'&&f.id.startsWith('f-')),true);
  const adminKnown=known.map(f=>({...f,discoveredOperationId:null}));
  assert.equal(award({dossier:{id:'d1'},findings:adminKnown}).award.refreshedCount,0);   // NULL origin never refreshed by the trigger
});

test('award: waits for the catalog (sheet, army, no stats) and skips other results', () => {
  assert.equal(award({sheet:{state:{}}}).award.processingState,'waiting_catalog');
  assert.equal(award({stats:null}).award.processingState,'waiting_catalog');
  const army=award({operation:operation({requestedFields:['army']})});
  assert.equal(army.award.processingState,'waiting_catalog');assert.equal(army.award.objective,'army');
  assert.equal(award({operation:operation({requestedFields:['house_overview']})}).award.objective,'house_resources');
  assert.equal(award({decision:decision({resolution:'failure'})}),null);
  assert.equal(award({operation:operation({status:'operating'})}),null);
  assert.equal(award({operation:operation({requestedFields:['x']})}),null);
});

test('award: missing roll data, replay and negative margin', () => {
  assert.equal(code(()=>award({decision:decision({modifiers:{cunning:3}})})),'invalid');
  assert.equal(award({decision:decision({modifiers:{roll:5,modifier:0}})}),null);
  const again=award({awardExists:true,dossier:{id:'d1'}});
  assert.equal(again.award,null);assert.equal(again.findings.length,0);
});

const state={units:[{id:'u1',name:'Guarda',types:['inf'],strength:3,training:'v'},{id:'u2',destroyed:true},{id:'u3',destroyed:'false'},{name:'sem id'}],
  domains:[{id:'d1',name:'Vale'},{id:'d2'}],holdings:[{id:'h1',name:'Forja',category:'Industria',status:'active'},{id:'h2',status:'building'}]};

test('source items: resources, army and possessions', () => {
  assert.equal(i.sourceItems({objective:'house_resources',sheet:null,stats:null}),null);
  assert.equal(i.sourceItems({objective:'house_resources',sheet:null,stats}).length,7);
  assert.equal(i.sourceItems({objective:'house_resources',sheet:{state},stats:null}),null);
  const res={defense:1,influence:2,lands:3,law:4,power:5,population:6,wealth:7};
  assert.equal(i.sourceItems({objective:'house_resources',sheet:{state},stats:null,resources:res})[0].snapshot.source,'operational_house_balances');
  assert.equal(code(()=>i.sourceItems({objective:'house_resources',sheet:{state},resources:{...res,law:1.5}})),'invalid');
  assert.equal(code(()=>i.sourceItems({objective:'house_resources',sheet:{state},resources:{...res,law:1234567}})),'invalid');
  assert.deepEqual(i.sourceItems({objective:'army',sheet:{state}}).map(x=>x.key),['u1','u3']);
  assert.equal(i.sourceItems({objective:'army',sheet:{state}})[1].snapshot.name,'Unidade sem nome');
  assert.deepEqual(i.sourceItems({objective:'possessions',sheet:{state}}).map(x=>x.key),['domain:d1','domain:d2','holding:h1']);
  assert.equal(i.sourceItems({objective:'army',sheet:null}),null);
  assert.equal(code(()=>i.sourceItems({objective:'gold'})),'invalid');
});

const pending={operationId:'op1',dossierId:'d1',objective:'army',revealCapacity:4,revealedCount:0,refreshedCount:0,
  processingState:'waiting_catalog',campaignDateKey:'1522-02-01'};
const dossier={id:'d1',ownerHouseId:'hA',targetHouseId:'hT'};
const fin=(o={})=>i.finalize({actor:narrator,award:pending,operation:operation(),decision:decision(),dossier,findings:[],
  items:i.sourceItems({objective:'army',sheet:{state}}),calendar,newId,now:NOW,...o});

test('finalize: confirms with the observed date, then is idempotent', () => {
  const r=fin();
  assert.equal(r.result.status,'complete');assert.equal(r.result.revealed,2);assert.equal(r.award.processingState,'complete');
  assert.equal(r.findings[0].discoveredDateKey,'1522-02-03');
  assert.equal(i.finalize({actor:narrator,award:r.award}).result.alreadyApplied,true);
  assert.equal(fin({award:null}).result.status,'no_success_award');
  assert.equal(fin({items:null}).result.status,'waiting_catalog');
  const prior=[{id:'f1',dossierId:'d1',objective:'army',subjectKey:'u1',valueSnapshot:{name:'old'},discoveredOperationId:null,
    verifiedOperationId:null}];
  const mixed=fin({findings:prior});
  assert.equal(mixed.result.revealed,1);assert.equal(mixed.result.refreshed,1);
  assert.equal(mixed.events.find(e=>e.eventType==='refreshed').previousSnapshot.name,'old');
});

test('finalize: guards', () => {
  assert.equal(code(()=>fin({actor:owner})),'denied');
  assert.equal(code(()=>fin({decision:decision({resolution:'failure'})})),'invalid');
  assert.equal(code(()=>fin({operation:operation({ownerHouseId:'zz'})})),'invalid');
  assert.equal(code(()=>fin({calendar:{...calendar,month:0,day:1}})),'invalid');   // clock before the mission
});

test('admin action: reveal, revalidate, revoke with audit and validation', () => {
  const items=i.sourceItems({objective:'army',sheet:{state}});
  const act=(o={})=>i.adminAction({actor:narrator,dossier,objective:'army',subjectKey:'u1',action:'reveal',reason:'  Revelado pelo Narrador ',
    existing:null,items,calendar,newId,now:NOW,...o});
  const r=act();
  assert.equal(r.finding.discoveredOperationId,null);assert.equal(r.audit.reason,'Revelado pelo Narrador');
  assert.equal(r.audit.beforeSnapshot,null);assert.equal(r.audit.afterSnapshot.name,'Guarda');
  const old={id:'f1',dossierId:'d1',objective:'army',subjectKey:'u1',valueSnapshot:{name:'x'},discoveredOperationId:'op9',verifiedOperationId:'op9'};
  const rv=act({action:'revalidate',existing:old});
  assert.equal(rv.finding.id,'f1');assert.equal(rv.finding.discoveredOperationId,'op9');assert.equal(rv.finding.verifiedOperationId,null);
  const rk=act({action:'revoke',existing:old,items:null});
  assert.equal(rk.remove.id,'f1');assert.equal(rk.audit.beforeSnapshot.name,'x');assert.equal(rk.audit.afterSnapshot,null);
  assert.equal(i.knownCount([old],'army',rk),0);assert.equal(i.knownCount([],'army',r),1);
  assert.equal(code(()=>act({actor:owner})),'denied');
  assert.equal(code(()=>act({reason:'curto'})),'invalid');
  assert.equal(code(()=>act({action:'x'})),'invalid');
  assert.equal(code(()=>act({dossier:null})),'invalid');
  assert.equal(code(()=>act({action:'revoke'})),'invalid');
  assert.equal(code(()=>act({action:'revalidate'})),'invalid');
  assert.equal(code(()=>act({items:null})),'invalid');
  assert.equal(code(()=>act({subjectKey:'zzz'})),'invalid');
});

test('options, pending and operation status', () => {
  const extra=[{dossierId:'d1',objective:'army',subjectKey:'gone',valueSnapshot:{name:'Antiga'}}];
  const opts=i.adminOptions({actor:narrator,dossier,sheet:{state},findings:extra});
  assert.equal(opts.filter(o=>o.objective==='house_resources').length,7);
  assert.ok(opts.some(o=>o.objective==='army'&&o.key==='u1'&&o.name==='Guarda'));
  assert.equal(opts.at(-1).name,'Antiga');
  assert.equal(i.adminOptions({actor:narrator,dossier,sheet:null,findings:[]}).length,7);
  assert.equal(code(()=>i.adminOptions({actor:owner,dossier,sheet:null,findings:[]})),'denied');
  const p=i.adminPending({actor:narrator,awards:[pending,{...pending,operationId:'o2',processingState:'complete'}],dossiers:[dossier]});
  assert.deepEqual(p,[{operationId:'op1',objective:'army',ownerHouseId:'hA',targetHouseId:'hT',dateKey:'1522-02-01',capacity:4}]);
  const st=o=>i.operationStatus({actor:narrator,operation:operation(),decision:decision(),award:pending,...o});
  assert.equal(st().status,'waiting_catalog');
  assert.equal(st({award:null}).status,'missing_award');
  assert.equal(st({decision:decision({resolution:'failure'})}).status,'no_success_award');
  assert.equal(st({decision:null}).status,'pending_resolution');
  assert.equal(st({operation:operation({status:'operating'})}).status,'pending_resolution');
  assert.equal(code(()=>st({actor:owner})),'denied');
});

test('read: players see only their dossiers and no revoked history or snapshots', () => {
  const ds=[{id:'d1',ownerHouseId:'hA',targetHouseId:'hT',updatedAt:'2026-02-01'},{id:'d2',ownerHouseId:'hB',targetHouseId:'hT',updatedAt:'2026-03-01'}];
  const fs=[{id:'f1',dossierId:'d1',objective:'army',subjectKey:'u1',valueSnapshot:{name:'A'},discoveredDateKey:'1522-01-01',
    verifiedDateKey:'1522-01-02',verifiedAt:'2026-01-02'}];
  const es=[{id:'e1',dossierId:'d1',objective:'army',subjectKey:'u1',eventType:'revealed',campaignDateKey:'1522-01-01',
    newSnapshot:{name:'A'},previousSnapshot:null,createdAt:'2026-01-01'},
    {id:'e2',dossierId:'d1',objective:'army',subjectKey:'revoked',eventType:'revealed',campaignDateKey:'1522-01-01',
    newSnapshot:{name:'B'},previousSnapshot:null,createdAt:'2026-01-02'}];
  const au=[{id:'a1',dossierId:'d1',objective:'army',subjectKey:'revoked',action:'revoke',campaignDateKey:'1522-01-03',reason:'motivo longo',createdAt:'2026-01-03'}];
  const catalog=[{id:'hA',name:'Alfa'},{id:'hT',name:'Alvo',region:'Swordmarch'}];
  const mine=i.readDossiers({actor:owner,houseId:'hA',dossiers:ds,findings:fs,events:es,audit:au,catalog});
  assert.equal(mine.length,1);assert.equal(mine[0].history.length,1);assert.equal(mine[0].history[0].newSnapshot.name,undefined);
  assert.equal(mine[0].history[0].oldSnapshot,null);assert.deepEqual(mine[0].adminHistory,[]);
  assert.equal(mine[0].targetRegion,'Swordmarch');assert.equal(mine[0].findings[0].snapshot.name,'A');
  const all=i.readDossiers({actor:narrator,houseId:null,dossiers:ds,findings:fs,events:es,audit:au,catalog});
  assert.deepEqual(all.map(d=>d.id),['d2','d1']);
  assert.equal(all[1].history.length,2);assert.equal(all[1].history[0].newSnapshot.name,'B');assert.equal(all[1].adminHistory.length,1);
  assert.equal(i.readDossiers({actor:narrator,houseId:'hB',dossiers:ds,findings:fs,events:es,audit:au,catalog}).length,1);
  assert.equal(code(()=>i.readDossiers({actor:stranger,houseId:'hA',dossiers:ds,findings:fs,events:es,audit:au,catalog})),'denied');
  assert.equal(code(()=>i.readDossiers({actor:owner,houseId:null,dossiers:ds,findings:fs,events:es,audit:au,catalog})),'denied');
});
