/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildTimeEnginePlan,writeTimeEngineToEmulator,ROOT} from './stage-time-engine-emulator.mjs';
import {ROOT as NOBLE,sheetDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as SCHED} from './stage-schedule-emulator.mjs';
import {createEmulatorTimeService} from './time-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const K1='11111111-1111-4111-8111-111111111111',K2='22222222-2222-4222-8222-222222222222',
  K3='33333333-3333-4333-8333-333333333333',E1='44444444-4444-4444-8444-444444444444';
const BASE=12*1520;

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('time-engine-synthetic-v1');
  const plan=buildTimeEnginePlan([tab('public.campaign_calendar',[{year:'1520',month:'0',day:'15',festival:'',
    auto_advance:'t',version:'4',last_round:null,published_at:null,updated_at:'2026-01-01 00:00:00+00',updated_by:null}])],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-time-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeTimeEngineToEmulator(plan,adminDb);
    const sheet=(h,state)=>adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId(h))
      .set({houseId:h,version:1,updatedBy:'x',updatedAt:'2026-01-01T00:00:00.000Z',syncState:'pending',
        state:{houseId:h,schemaVersion:1,phase:'active',month:BASE,holdings:[{id:'x',status:'building'}],
          projects:[{status:'building',start:BASE,duration:1,holdingId:'x'}],...state}});
    await sheet('casa-a',{});
    await sheet('casa-b',{phase:'draft'});
    await adminDb.collection(SCHED).doc(snap).collection('events').doc(E1).set({id:E1,draftDate:'1520-03-10',
      draftTitle:'Torneio',draftDescription:'',draftDeleted:false,publishedDate:null,publishedTitle:null,
      publishedDescription:null,version:1});
    const acc=(uid,o)=>adminDb.collection('migrationDomainStage').doc(snap).collection('access').doc(uid)
      .set({userId:uid,requirePasswordChange:false,...o});
    await acc('narrator',{active:true,profile:'narrador',admin:true});
    await acc('alice',{active:true,profile:'jogador',admin:false,playerId:'pA',memberHouseIds:[],editHouseIds:[]});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorTimeService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice';
    const stage=adminDb.collection(ROOT).doc(snap);

    assert.equal((await svc.getCalendar(A)).version,4);
    assert.equal(await code(svc.preview(A,{mode:'set',date:'1520-03-10'})),'denied');
    const pv=await svc.preview(N,{mode:'set',date:'1520-03-10'});
    assert.equal(pv.house_impacts.eligible,1);assert.equal(pv.house_impacts.drafts,1);

    // Denied and invalid attempts leave NOTHING behind.
    assert.equal(await code(svc.publish(A,{version:4,key:K1,mode:'set',date:'1520-03-10'})),'denied');
    assert.equal(await code(svc.publish(N,{version:3,key:K1,mode:'set',date:'1520-03-10'})),'conflict');
    assert.equal((await stage.collection('operations').get()).size,0);

    const r=await svc.publish(N,{version:4,key:K1,mode:'set',date:'1520-03-10'});
    assert.equal(r.version,5);assert.equal(r.housesReconciled,1);assert.equal(r.eventsPublished,1);assert.equal(r.duplicate,false);
    const a=(await adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('casa-a')).get()).data();
    assert.equal(a.version,2);assert.equal(a.state.month,BASE+2);assert.equal(a.state.projects[0].status,'completed');
    const b=(await adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('casa-b')).get()).data();
    assert.equal(b.version,1);
    assert.equal((await adminDb.collection(NOBLE).doc(snap).collection('ledger')
      .where('action','==','calendar_advance').get()).size,1);
    assert.equal((await adminDb.collection(SCHED).doc(snap).collection('events').doc(E1).get()).data().publishedTitle,'Torneio');
    assert.equal((await svc.getCalendar(A)).month,2);

    // Idempotent replay: same key and parameters change nothing; different parameters conflict.
    const again=await svc.publish(N,{version:4,key:K1,mode:'set',date:'1520-03-10'});
    assert.equal(again.duplicate,true);assert.equal(again.version,5);
    assert.equal(await code(svc.publish(N,{version:4,key:K1,mode:'set',date:'1520-04-10'})),'conflict');
    assert.equal((await adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('casa-a')).get()).data().version,2);

    // A malformed house sheet aborts the entire change, including the calendar.
    await sheet('casa-bad',{month:'x'});
    assert.equal(await code(svc.publish(N,{version:5,key:K2,mode:'advance',count:1})),'invalid_sheet');
    assert.equal((await svc.getCalendar(A)).version,5);
    assert.equal((await stage.collection('operations').get()).size,1);
    await adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('casa-bad')).delete();

    // Backdate needs authorization and reason, then never touches houses.
    assert.equal(await code(svc.publish(N,{version:5,key:K2,mode:'set',date:'1520-01-01'})),'invalid');
    const back=await svc.publish(N,{version:5,key:K3,mode:'set',date:'1520-01-01',allowBackdate:true,reason:'Correção histórica autorizada'});
    assert.equal(back.housesReconciled,0);assert.equal(back.version,6);
    assert.equal((await adminDb.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('casa-a')).get()).data().version,2);

    const hist=await svc.history(N);
    assert.equal(hist.length,2);assert.equal(await code(svc.history(A)),'denied');
    assert.equal((await stage.collection('audit').get()).size,2);

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      await assertFails(getDoc(doc(db,ROOT,snap,'calendar','current')));
      await assertFails(getDocs(collection(db,ROOT,snap,'operations')));
      await assertFails(setDoc(doc(db,ROOT,snap,'calendar','current'),{year:1}));
    }
    console.log('Time engine emulator: atomic change, idempotency, backdate guard, malformed-sheet abort and server-only access verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Time engine integration failed:',e?.message||'error');process.exitCode=1;});
