/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildSchedulePlan,writeScheduleToEmulator,ROOT} from './stage-schedule-emulator.mjs';
import {createEmulatorScheduleService} from './schedule-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const E1='11111111-1111-4111-8111-111111111111';

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('schedule-synthetic-v1');
  const plan=buildSchedulePlan([
    tab('public.campaign_schedule_events',[{id:E1,draft_date:'1520-03-10',draft_title:'Torneio',draft_description:'',
      draft_deleted:'f',published_date:null,published_title:null,published_description:null,version:'1',
      updated_at:'2026-01-01 00:00:00+00',updated_by:'n'}]),
    tab('public.campaign_schedule_event_audit',[]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-schedule-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeScheduleToEmulator(plan,adminDb);
    const acc=(uid,o)=>adminDb.collection('migrationDomainStage').doc(snap).collection('access').doc(uid)
      .set({userId:uid,requirePasswordChange:false,...o});
    await acc('narrator',{active:true,profile:'narrador',admin:true});
    await acc('alice',{active:true,profile:'jogador',admin:false,playerId:'pA',memberHouseIds:[],editHouseIds:[]});
    await acc('gone',{active:false,profile:'jogador',admin:false,playerId:'pG',memberHouseIds:[],editHouseIds:[]});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorScheduleService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice';

    const made=await svc.saveEvent(N,{date:'1520-03-12',title:'Banquete',description:'Salão'});
    assert.equal(made.version,1);
    assert.equal((await svc.saveEvent(N,{id:E1,date:'1520-03-11',title:'Torneio II',version:1})).version,2);
    assert.equal(await code(svc.saveEvent(N,{id:E1,date:'1520-03-11',title:'x',version:1})),'conflict');
    assert.equal(await code(svc.saveEvent(A,{date:'1520-03-12',title:'Forjado'})),'denied');
    assert.equal(await code(svc.saveEvent(N,{date:'1520-99-12',title:'x'})),'invalid');

    // Drafts: narrator only; published: any active access, and only after publication.
    assert.equal((await svc.getDrafts(N)).length,2);
    assert.equal(await code(svc.getDrafts(A)),'denied');
    assert.deepEqual(await svc.getPublished(A,{year:1520,month:2}),[]);
    assert.equal(await code(svc.getPublished('synthetic:gone',{year:1520,month:2})),'denied');
    assert.equal(await code(svc.getPublished('bad',{year:1520,month:2})),'denied');

    assert.equal((await svc.serverPublishEventSnapshots({actorUid:'narrator',reason:'Publicação temporal'})).published,2);
    assert.equal((await svc.serverPublishEventSnapshots({actorUid:'narrator',reason:'Publicação temporal'})).published,0);
    const pub=await svc.getPublished(A,{year:1520,month:2});
    assert.deepEqual(pub.map(e=>e.title),['Torneio II','Banquete']);
    assert.equal(pub[0].kind,'kingdom');
    assert.equal('draftTitle' in pub[0],false);

    // A draft edit after publication stays invisible until the next publication.
    const v=(await svc.getDrafts(N)).find(d=>d.title==='Banquete').version;
    await svc.saveEvent(N,{id:made.id,date:'1520-03-12',title:'Banquete Real',version:v});
    assert.ok((await svc.getPublished(A,{year:1520,month:2})).some(e=>e.title==='Banquete'));
    const audit=await adminDb.collection(ROOT).doc(snap).collection('audit').get();
    assert.equal(audit.size,5); // 3 draft saves + 2 publication entries

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      await assertFails(getDoc(doc(db,ROOT,snap,'events',E1)));
      await assertFails(getDocs(collection(db,ROOT,snap,'events')));
      await assertFails(setDoc(doc(db,ROOT,snap,'events',E1),{draftTitle:'forjado'}));
    }
    console.log('Schedule emulator: narrator-only drafts, version guard, audited publication and published-only reads verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Schedule integration failed:',e?.message||'error');process.exitCode=1;});
