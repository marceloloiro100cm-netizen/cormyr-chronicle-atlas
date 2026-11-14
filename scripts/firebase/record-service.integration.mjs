/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildRecordPlan,writeRecordsToEmulator,versionDocId,ROOT} from './stage-records-emulator.mjs';
import {createEmulatorRecordService} from './record-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const RH='11111111-1111-4111-8111-111111111111',RG='22222222-2222-4222-8222-222222222222',
  RB='33333333-3333-4333-8333-333333333333',RS='44444444-4444-4444-8444-444444444444';
const rec=(id,o)=>({id,house_id:'houseA',player_id:null,visibility:'house',kind:'document',title:'T'+id[0],content:'C',
  version:'1',created_by:'n',updated_by:'n',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00',
  sync_state:'synced',last_synced_at:null,source_file_id:null,source_modified_at:null,...o});

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('records-synthetic-v1');
  const plan=buildRecordPlan([
    tab('public.campaign_houses',[{id:'houseA'},{id:'houseB'}]),
    tab('public.campaign_players',[{id:'pA'},{id:'pB'}]),
    tab('public.campaign_records',[
      rec(RH,{}),rec(RG,{visibility:'gm',house_id:null}),
      rec(RB,{house_id:'houseB'}),
      rec(RS,{source_file_id:'drive1',visibility:'player',player_id:'pA'})]),
    tab('public.record_versions',[]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-record-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeRecordsToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const h=(t,id)=>createHash('sha256').update(t+':'+id).digest('hex');
    for(const x of ['houseA','houseB'])await domain.collection('houses').doc(h('house',x)).set({sourceId:x,active:true});
    for(const x of ['pA','pB'])await domain.collection('players').doc(h('player',x)).set({sourceId:x});
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,active:true,requirePasswordChange:false,...o});
    await acc('narrator',{profile:'narrador',admin:true});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['houseA'],editHouseIds:['houseA']});
    await acc('viewer',{profile:'jogador',admin:false,playerId:'pV',memberHouseIds:['houseA'],editHouseIds:[]});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['houseB'],editHouseIds:['houseB']});
    await acc('editor',{profile:'editor',admin:false});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorRecordService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const T=u=>'synthetic:'+u;

    assert.equal((await svc.saveRecord(T('alice'),{id:RH,version:1,title:'Novo',content:'Texto'})).version,2);
    assert.equal(await code(svc.saveRecord(T('alice'),{id:RH,version:1,title:'x',content:'y'})),'conflict');
    assert.equal(await code(svc.saveRecord(T('viewer'),{id:RH,version:2,title:'x',content:'y'})),'denied');
    assert.equal(await code(svc.saveRecord(T('bob'),{id:RH,version:2,title:'x',content:'y'})),'denied');
    assert.equal(await code(svc.saveRecord(T('editor'),{id:RH,version:2,title:'x',content:'y'})),'denied');
    assert.equal(await code(svc.saveRecord(T('alice'),{id:RG,version:1,title:'x',content:'y'})),'denied');
    const v2=await adminDb.collection(ROOT).doc(snap).collection('versions').doc(versionDocId(RH,2)).get();
    assert.equal(v2.data().snapshot.title,'Novo');

    const made=await svc.createRecord(T('alice'),{visibility:'house',kind:'document',houseId:'houseA',title:'Criado',content:''});
    assert.equal(made.version,1);
    assert.equal(await code(svc.createRecord(T('alice'),{visibility:'house',kind:'document',houseId:'houseB',title:'x'})),'denied');
    assert.equal(await code(svc.createRecord(T('viewer'),{visibility:'house',kind:'document',houseId:'houseA',title:'x'})),'denied');
    assert.equal(await code(svc.createRecord(T('narrator'),{visibility:'house',kind:'document',houseId:'inexistente',title:'x'})),'invalid');

    const seen=async u=>(await svc.listRecords(T(u))).map(r=>r.id).sort();
    assert.deepEqual(await seen('alice'),[RH,RS,made.id].sort());
    assert.deepEqual(await seen('bob'),[RB]);
    assert.equal((await seen('narrator')).length,5);
    assert.equal(await code(svc.listRecords(T('editor'))),'denied');
    assert.equal(await code(svc.getRecord(T('bob'),RH)),'denied');

    // Drive import: only untouched imports (version 1) may be overwritten.
    assert.equal((await svc.serverSaveImportedSource({recordId:RS,content:'Do Drive',modifiedAt:'2026-02-01'})).version,2);
    assert.equal(await code(svc.serverSaveImportedSource({recordId:RS,content:'de novo',modifiedAt:'x'})),'conflict');

    const c=u=>env.authenticatedContext(u).firestore();
    const ref=(db,t,id)=>doc(db,ROOT,snap,t,id);
    await assertSucceeds(getDoc(ref(c('alice'),'records',RH)));
    await assertSucceeds(getDoc(ref(c('viewer'),'records',RH)));
    await assertFails(getDoc(ref(c('bob'),'records',RH)));
    await assertFails(getDoc(ref(c('alice'),'records',RG)));
    await assertSucceeds(getDoc(ref(c('narrator'),'records',RG)));
    await assertFails(getDoc(ref(c('editor'),'records',RH)));
    await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(),'records',RH)));
    await assertSucceeds(getDoc(ref(c('alice'),'versions',versionDocId(RH,2))));
    await assertFails(getDoc(ref(c('bob'),'versions',versionDocId(RH,2))));
    await assertFails(getDocs(collection(c('narrator'),ROOT,snap,'records')));
    await assertFails(setDoc(ref(c('narrator'),'records',RH),{title:'forjado'}));
    await assertFails(setDoc(ref(c('alice'),'records',RH),{title:'forjado'}));
    console.log('Record emulator: access by house/player, editor exclusion, version guard, history and Drive import guard verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Record integration failed:',e?.message||'error');process.exitCode=1;});
