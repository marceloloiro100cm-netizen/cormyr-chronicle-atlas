/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildSpyAgentsPlan,writeSpyAgentsToEmulator,ROOT} from './stage-spy-emulator.mjs';
import {ROOT as TIME} from './stage-time-engine-emulator.mjs';
import {createEmulatorSpyMissionsService} from './spy-missions-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const REGIONS=['veilstone','ferlin','helmlands','swordmark','crownlands','horselands','dragoncoast','shieldmark','elfhold',
  'volkumburgh','stonelands'];

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('spy-missions-synthetic-v1');
  const asset=(n,codename)=>({id:U(n),owner_house_id:'hA',kind:'network_cell',codename,source_holding_id:'h1',source_ref:'x',
    current_location_id:'L-ferlin',status:'available',rules_version:'',mission_successes:'0',portrait_id:'',version:'1',
    created_at:'2026-01-01 00:00:00+00'});
  const plan=buildSpyAgentsPlan([
    tab('public.spy_portrait_catalog',[{id:'p1',label:'p1',image_url:'https://x/p1.png',sort_order:'1',active:'t',created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.spy_locations',REGIONS.map(r=>({id:'L-'+r,kind:'region',ref_id:r,region_id:r,name:r,approved:'t',source:'s',version:'1',visibility:'public'}))),
    tab('public.spy_assets',[asset(1,'Sombra'),asset(2,'Corvo')]),
    tab('public.house_catalog',[
      {id:'hA',name:'Casa Alfa',classification:'noble',region:'Ferlin',public_reviewed:'t'},
      {id:'hT',name:'Casa Alvo',classification:'noble',region:'Swordmarch',public_reviewed:'t'}]),
    tab('public.spy_noble_house_stats',[{house_id:'hT',house_name:'Casa Alvo',law:'60',region_id:'swordmarch'}]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-spy-missions-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeSpyAgentsToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('reader',{profile:'jogador',admin:false,playerId:'pR',memberHouseIds:['hA'],editHouseIds:[]});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hT'],editHouseIds:['hT']});
    const cal=adminDb.collection(TIME).doc(snap).collection('calendar').doc('current');
    await cal.set({year:1522,month:0,day:5,festival:null,version:3});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorSpyMissionsService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice',R='synthetic:reader',B='synthetic:bob';
    const agentDoc=async n=>(await adminDb.collection(ROOT).doc(snap).collection('assets').doc(U(n)).get()).data();

    // Preview: members read; the target's law from the imported spreadsheet drives the difficulty.
    assert.equal(await code(svc.previewMission('bad',{houseId:'hA',agentId:U(1),targetHouseId:'hT'})),'denied');
    assert.equal(await code(svc.previewMission(B,{houseId:'hA',agentId:U(1),targetHouseId:'hT'})),'denied');
    const pv=await svc.previewMission(R,{houseId:'hA',agentId:U(1),targetHouseId:'hT'});
    assert.equal(pv.houseDefense,24);assert.equal(pv.source,'official_spreadsheet');assert.equal(pv.agentRank,'Verde');
    assert.deepEqual(await svc.houseTimeline(R,'hA'),[]);

    // Start: one Ferlin to Swordmarch hop = 10 days; idempotent; agent becomes busy.
    const go={houseId:'hA',agentId:U(1),targetHouseId:'hT',destination:'Swordmarch',expectedAgentVersion:1,
      expectedCalendarVersion:3,key:U(20)};
    assert.equal(await code(svc.startMission(R,go)),'denied');
    assert.equal(await code(svc.startMission(B,go)),'denied');
    assert.equal(await code(svc.startMission(A,{...go,expectedCalendarVersion:9})),'conflict');
    const started=await svc.startMission(A,go);
    assert.equal(started.status,'traveling');assert.equal(started.arrivalKey,'1522-01-15');
    assert.equal(started.investigationEndsKey,'1522-01-25');
    assert.equal((await svc.startMission(A,go)).alreadyApplied,true);
    assert.equal(await code(svc.startMission(A,{...go,key:U(21),expectedAgentVersion:2})),'conflict');
    assert.equal((await agentDoc(1)).status,'traveling');
    const tl=await svc.houseTimeline(R,'hA');
    assert.equal(tl.length,1);assert.equal(tl[0].targetHouseName,'Casa Alvo');assert.equal(tl[0].travelDays,10);

    // Cancellation frees the agent; replay does nothing more.
    const s2=await svc.startMission(A,{...go,agentId:U(2),key:U(22)});
    const cx={houseId:'hA',operationId:s2.operationId,expectedVersion:1,key:U(23)};
    assert.equal(await code(svc.cancelMission(R,cx)),'denied');
    assert.equal(await code(svc.cancelMission(A,{...cx,expectedVersion:7})),'conflict');
    assert.equal((await svc.cancelMission(A,cx)).status,'cancelled');
    assert.equal((await svc.cancelMission(A,cx)).alreadyApplied,true);
    assert.equal((await agentDoc(2)).status,'available');

    // Hub clock: only the narrator, idempotent, travelling then operating then review.
    assert.equal(await code(svc.advanceMissions(A)),'denied');
    await cal.set({year:1522,month:0,day:15,festival:null,version:4});
    assert.equal((await svc.advanceMissions(N)).advanced,1);
    assert.equal((await svc.advanceMissions(N)).advanced,0);
    assert.equal((await agentDoc(1)).status,'operating');
    await cal.set({year:1522,month:0,day:25,festival:null,version:5});
    assert.equal((await svc.advanceMissions(N)).advanced,1);
    assert.equal((await agentDoc(1)).status,'pending_review');
    const pending=(await svc.narratorOperations(N)).find(o=>o.operationId===started.operationId);
    assert.equal(pending.status,'pending_narrator_review');

    // Resolution: narrator only, NPC needs guard and prison confirmation, versions guard it.
    const res={operationId:started.operationId,roll:9,modifier:7,discovered:true,guardOverride:true,prisonOverride:false,
      expectedVersion:4,key:U(30),reason:'Descoberto na biblioteca'};
    assert.equal(await code(svc.resolveMission(A,res)),'denied');
    assert.equal(await code(svc.resolveMission(N,{...res,expectedVersion:1})),'conflict');
    assert.equal(await code(svc.resolveMission(N,{...res,roll:2})),'invalid');
    assert.equal(await code(svc.resolveMission(N,{...res,guardOverride:undefined})),'invalid');
    const out=await svc.resolveMission(N,res);
    assert.equal(out.outcome,'escaped');assert.equal(out.difficulty,24);assert.equal(out.status,'available');
    assert.equal(out.failureDegrees,2);
    assert.equal((await svc.resolveMission(N,res)).alreadyApplied,true);
    assert.equal(await code(svc.resolveMission(N,{...res,key:U(31)})),'invalid');           // no longer pending review
    assert.equal((await agentDoc(1)).status,'available');

    // Counterintelligence for the target; incidents and dashboard for the narrator.
    assert.equal(await code(svc.counterintelligence(A,'hT')),'denied');
    const ci=await svc.counterintelligence(B,'hT');
    assert.equal(ci.totalDetections,1);assert.deepEqual(ci.alerts,[{dateKey:'1522-01-25',result:'escaped'}]);
    assert.equal((await svc.counterintelligence(A,'hA')).totalDetections,0);
    assert.equal(await code(svc.incidentHistory(A)),'denied');
    const inc=await svc.incidentHistory(N);
    assert.equal(inc.length,1);assert.equal(inc[0].ownerHouseName,'Casa Alfa');assert.equal(inc[0].targetHouseName,'Casa Alvo');
    const dash=await svc.narratorOperations(N);
    assert.deepEqual(dash.map(o=>o.status).sort(),['cancelled','completed']);
    assert.equal(dash.find(o=>o.status==='completed').outcome,'escaped');
    assert.equal(await code(svc.narratorOperations(R)),'denied');

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      for(const c of ['operations','timeline','decisions','catalog','nobleStats','events']){
        await assertFails(getDocs(collection(db,ROOT,snap,c)));
        await assertFails(setDoc(doc(db,ROOT,snap,c,'x'),{ownerHouseId:'hA'}));
      }
      await assertFails(getDoc(doc(db,ROOT,snap,'timeline',started.operationId)));
    }
    console.log('Spy missions emulator: start, travel, cancel, hub clock, resolution, counterintelligence, panels and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Spy missions integration failed:',e?.message||'error');process.exitCode=1;});
