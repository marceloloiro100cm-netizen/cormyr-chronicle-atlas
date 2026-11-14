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
import {ROOT as NOBLE,sheetDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME} from './stage-time-engine-emulator.mjs';
import {createEmulatorSpyMissionsService} from './spy-missions-service.mjs';
import {createEmulatorSpyIntelService} from './spy-intel-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const REGIONS=['ferlin','swordmark'];

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('spy-intel-synthetic-v1');
  const asset=n=>({id:U(n),owner_house_id:'hA',kind:'network_cell',codename:'Agente'+n,source_holding_id:'h1',source_ref:'x',
    current_location_id:'L-swordmark',status:'available',rules_version:'',mission_successes:'0',portrait_id:'',version:'1',
    created_at:'2026-01-01 00:00:00+00'});
  const plan=buildSpyAgentsPlan([
    tab('public.spy_portrait_catalog',[{id:'p1',label:'p1',image_url:'https://x/p1.png',sort_order:'1',active:'t',created_at:'2026-01-01 00:00:00+00'}]),
    tab('public.spy_locations',REGIONS.map(r=>({id:'L-'+r,kind:'region',ref_id:r,region_id:r,name:r,approved:'t',source:'s',version:'1',visibility:'public'}))),
    tab('public.spy_assets',[asset(1),asset(2),asset(3)]),
    tab('public.house_catalog',[
      {id:'hA',name:'Casa Alfa',classification:'noble',region:'Swordmarch',public_reviewed:'t'},
      {id:'hT',name:'Casa Alvo',classification:'noble',region:'Swordmarch',public_reviewed:'t'},
      {id:'hS',name:'Casa Ficha',classification:'noble',region:'Swordmarch',public_reviewed:'t'}]),
    tab('public.spy_noble_house_stats',[{house_id:'hT',house_name:'Casa Alvo',law:'20',region_id:'swordmarch',defense:'7',influence:'3',
      lands:'4',power:'5',population:'6',wealth:'8'}]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-spy-intel-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeSpyAgentsToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hT'],editHouseIds:['hT']});
    const cal=adminDb.collection(TIME).doc(snap).collection('calendar').doc('current');
    await cal.set({year:1522,month:0,day:5,festival:null,version:3});
    // hS has an operational sheet with one army unit and one domain: its intelligence waits for the Narrator.
    await adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('hS')).set({houseId:'hS',version:1,
      state:{phase:'active',base:{law:10},permanent:{law:0},units:[{id:'u1',name:'Guarda'},{id:'u2',name:'Arqueiros'}],
        domains:[{id:'d1',name:'Vale'}],holdings:[]}});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const base={db:adminDb,auth,snapshotId:snap,env:process.env};
    const missions=createEmulatorSpyMissionsService(base),intel=createEmulatorSpyIntelService(base);
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice',B='synthetic:bob';
    const col=n=>adminDb.collection(ROOT).doc(snap).collection(n);

    // Same-region missions start operating; move the clock to the review window and resolve with a success.
    const go=(agent,target,objective,key,agentVersion=1)=>missions.startMission(A,{houseId:'hA',agentId:U(agent),targetHouseId:target,
      destination:'Swordmarch',objective,expectedAgentVersion:agentVersion,expectedCalendarVersion:3,key:U(key)});
    assert.equal(await code(go(1,'hT','gold',20)),'invalid');
    const m1=await go(1,'hT','house_resources',20);
    assert.equal(m1.status,'operating');assert.equal(m1.objective,'house_resources');
    const m2=await go(2,'hS','army',21);
    await cal.set({year:1522,month:0,day:15,festival:null,version:4});
    assert.equal((await missions.advanceMissions(N)).advanced,2);
    // Agent version after start (2) and the review step (3).
    const v=async n=>(await col('assets').doc(U(n)).get()).data().version;
    assert.equal(await v(1),3);
    const r1=await missions.resolveMission(N,{operationId:m1.operationId,roll:15,modifier:0,discovered:false,guardOverride:true,
      prisonOverride:true,expectedVersion:3,key:U(30),reason:'Sucesso'});
    assert.equal(r1.outcome,'mission_success');
    assert.equal(r1.intelligence.status,'complete');assert.ok(r1.intelligence.revealed>=3);
    assert.equal(r1.difficulty,6);                               // law 20: no extra degrees; margin 9 -> capacity 4
    const r2=await missions.resolveMission(N,{operationId:m2.operationId,roll:15,modifier:0,discovered:false,guardOverride:true,
      prisonOverride:true,expectedVersion:3,key:U(31),reason:'Sucesso'});
    assert.equal(r2.intelligence.status,'waiting_catalog');

    // Reading: owners see their own dossier; the target and strangers see nothing of it.
    assert.equal(await code(intel.read('bad','hA')),'denied');
    assert.equal(await code(intel.read(B,'hA')),'denied');
    assert.equal(await code(intel.read(A,null)),'denied');
    const mine=await intel.read(A,'hA');
    const dT=mine.find(d=>d.targetHouseId==='hT');
    assert.equal(dT.findings.length,r1.intelligence.revealed);
    assert.equal(dT.history.length,r1.intelligence.revealed);
    assert.equal(dT.history[0].newSnapshot.value,undefined);   // players never see snapshots in history
    assert.equal((await intel.read(B,'hT')).length,0);

    // Narrator pipeline: pending, status, bad inputs, then confirmation with balances.
    assert.equal(await code(intel.adminPending(A)),'denied');
    const pend=await intel.adminPending(N);
    assert.equal(pend.length,1);assert.equal(pend[0].objective,'army');
    assert.equal((await intel.operationStatus(N,m2.operationId)).status,'waiting_catalog');
    assert.equal((await intel.operationStatus(N,m1.operationId)).status,'complete');
    assert.equal(await code(intel.operationStatus(A,m2.operationId)),'denied');
    assert.equal(await code(intel.finalize(A,{operationId:m2.operationId})),'denied');
    assert.equal((await intel.finalize(N,{operationId:U(99)})).status,'no_success_award');
    const fin=await intel.finalize(N,{operationId:m2.operationId});
    assert.equal(fin.status,'complete');assert.equal(fin.revealed,2);   // two army units, capacity at least 3
    assert.equal((await intel.finalize(N,{operationId:m2.operationId})).alreadyApplied,true);
    assert.equal((await intel.adminPending(N)).length,0);
    assert.equal((await intel.operationStatus(N,m2.operationId)).status,'complete');
    const army=(await intel.read(A,'hA')).find(d=>d.targetHouseId==='hS');
    assert.deepEqual(army.findings.map(f=>f.key).sort(),['u1','u2']);
    assert.equal(army.findings[0].discoveredDate,'1522-01-15');

    // Administration: options, reveal/revoke with reason and audit, revalidation.
    const dossierId=army.id;
    const opts=await intel.adminOptions(N,dossierId);
    assert.ok(opts.some(o=>o.objective==='possessions'&&o.key==='domain:d1'));
    assert.equal(await code(intel.adminOptions(A,dossierId)),'denied');
    const act=(a,subjectKey='domain:d1',objective='possessions',reason='Revelado pelo Narrador na sessão')=>
      intel.adminAction(N,{dossierId,objective,subjectKey,action:a,reason});
    assert.equal(await code(intel.adminAction(A,{dossierId,objective:'possessions',subjectKey:'domain:d1',action:'reveal',reason:'Revelado pelo Narrador'})),'denied');
    assert.equal(await code(act('reveal','domain:d1','possessions','curto')),'invalid');
    assert.equal(await code(act('reveal','domain:zzz')),'invalid');
    assert.equal(await code(act('revalidate')),'invalid');
    assert.equal((await act('reveal')).knownCount,1);
    assert.equal((await act('revalidate')).knownCount,1);
    assert.equal((await act('revoke')).knownCount,0);
    assert.equal(await code(act('revoke')),'invalid');
    const asAdmin=(await intel.read(N,null)).find(d=>d.id===dossierId);
    assert.equal(asAdmin.adminHistory.length,3);
    assert.equal((await intel.read(A,'hA')).find(d=>d.id===dossierId).adminHistory.length,0);

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      for(const c of ['dossiers','findings','awards','intelEvents','adminAudit']){
        await assertFails(getDocs(collection(db,ROOT,snap,c)));
        await assertFails(setDoc(doc(db,ROOT,snap,c,'x'),{ownerHouseId:'hA'}));
      }
      await assertFails(getDoc(doc(db,ROOT,snap,'dossiers',dossierId)));
    }
    console.log('Spy intelligence emulator: award, catalog wait and confirmation, dossier privacy, admin audit and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Spy intelligence integration failed:',e?.message||'error');process.exitCode=1;});
