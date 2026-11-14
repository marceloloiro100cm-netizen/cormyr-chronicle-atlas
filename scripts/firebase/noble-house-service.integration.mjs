/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildNobleHousePlan,writeNobleHouseToEmulator,sheetDocId,ledgerDocId,ROOT,idOf} from './stage-noble-house-emulator.mjs';
import {ROOT as RECORDS} from './stage-records-emulator.mjs';
import {createEmulatorNobleHouseService} from './noble-house-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const K=n=>`00000000-0000-4000-8000-00000000000${n}`;
const st=(h,x=0)=>({houseId:h,schemaVersion:1,x});

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('noble-house-synthetic-v1');
  const plan=buildNobleHousePlan([
    tab('public.campaign_houses',[{id:'houseA'},{id:'houseB'}]),
    tab('public.noble_house_sheets',[
      {house_id:'houseA',state:JSON.stringify(st('houseA')),version:'1',updated_by:'n',updated_at:'2026-01-01 00:00:00+00',sync_state:'ok'},
      {house_id:'houseB',state:JSON.stringify(st('houseB')),version:'1',updated_by:'n',updated_at:'2026-01-01 00:00:00+00',sync_state:'ok'}]),
    tab('public.noble_house_ledger',[]),
    tab('public.noble_house_rule_overrides',[{id:'r1',definition:'{"a":1}',version:'1',updated_by:'n',updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.noble_house_gm_notes',[{house_id:'houseA',notes:'GM secret',secret_state:'{}',updated_at:'2026-01-01 00:00:00+00'}]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-noble-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeNobleHouseToEmulator(plan,adminDb);
    const access=adminDb.collection('migrationDomainStage').doc(snap).collection('access');
    const acc=(uid,o)=>access.doc(uid).set({userId:uid,active:true,requirePasswordChange:false,...o});
    await acc('narrator',{profile:'narrador',admin:true});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['houseA'],editHouseIds:['houseA']});
    await acc('viewer',{profile:'jogador',admin:false,playerId:'pV',memberHouseIds:['houseA'],editHouseIds:[]});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['houseB'],editHouseIds:['houseB']});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorNobleHouseService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const req=(house,n,version,extra={})=>({houseId:house,operationKey:K(n),action:'sheet',
      explanation:'t',rule:'',month:1,version,state:st(house,n),...extra});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};

    assert.equal((await svc.commit('synthetic:alice',req('houseA',1,1))).version,2);
    assert.deepEqual(await svc.commit('synthetic:alice',req('houseA',1,1)),{duplicate:true,version:2});
    assert.equal(await code(svc.commit('synthetic:alice',req('houseA',2,1))),'conflict');
    assert.equal((await svc.commit('synthetic:narrator',req('houseA',3,2))).version,3);
    assert.equal(await code(svc.commit('synthetic:viewer',req('houseA',4,3))),'denied');
    assert.equal(await code(svc.commit('synthetic:bob',req('houseA',5,3))),'denied');
    assert.equal(await code(svc.commit('bad-token',req('houseA',6,3))),'denied');
    assert.equal(await code(svc.commit('synthetic:bob',req('houseB',1,1,{operationKey:K(1)}))),null);
    // Same key reused by a different actor on the same house is rejected.
    assert.equal(await code(svc.commit('synthetic:narrator',req('houseA',1,3))),'conflict');
    // Concurrent writers at the same version: exactly one wins.
    const race=await Promise.allSettled([
      svc.commit('synthetic:alice',req('houseA',8,3)),
      svc.commit('synthetic:narrator',req('houseA',9,3))]);
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
    const sheet=await adminDb.collection(ROOT).doc(snap).collection('sheets').doc(sheetDocId('houseA')).get();
    assert.equal(sheet.data().version,4);
    const led=await adminDb.collection(ROOT).doc(snap).collection('ledger').doc(ledgerDocId('houseA',K(1))).get();
    assert.equal(led.data().beforeState.x,0);

    // Unit commanders: a house NPC is reused, a new one is created atomically with the sheet.
    const recs=adminDb.collection(RECORDS).doc(snap).collection('records');
    await recs.doc('npc1').set({id:'npc1',houseId:'houseA',playerId:null,visibility:'house',kind:'character',
      title:'Ser Álvaro',content:'',version:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
    const unitReq=(n,version,units,action='unit')=>req('houseA',n,version,{action,state:{...st('houseA',n),units}});
    assert.equal(await code(svc.commit('synthetic:viewer',unitReq(20,4,[{id:'u1',name:'Lanceiros',commanderName:'ser alvaro'}]))),'denied');
    assert.equal((await recs.get()).size,1);
    const u1=await svc.commit('synthetic:alice',unitReq(21,4,[{id:'u1',name:'Lanceiros',commanderName:'ser alvaro'}]));
    assert.equal(u1.version,5);
    assert.equal(u1.state.court.length,1);assert.equal(u1.state.court[0].npcId,'npc1');
    assert.equal((await recs.get()).size,1); // reused, nothing created
    const u2=await svc.commit('synthetic:alice',unitReq(22,5,[{id:'u1',name:'Lanceiros',commanderName:'ser alvaro',commanderId:u1.state.court[0].id},
      {id:'u2',name:'Arqueiros',commanderName:'Lady Brenna'}],'unit_state'));
    assert.equal(u2.version,6);
    assert.equal((await recs.get()).size,2);
    const made=(await recs.where('title','==','Lady Brenna').get()).docs[0].data();
    assert.equal(made.visibility,'house');assert.equal(made.kind,'character');assert.equal(made.createdBy,'alice');
    assert.equal(u2.state.units[1].commanderId,u2.state.court.find(m=>m.npcId===made.id).id);
    assert.equal((await adminDb.collection(RECORDS).doc(snap).collection('versions').get()).size,1);
    // A stale version creates no record (the version check runs first).
    assert.equal(await code(svc.commit('synthetic:alice',unitReq(23,5,[{id:'u3',name:'C',commanderName:'Outro Nome'}]))),'conflict');
    assert.equal((await recs.get()).size,2);

    const c=uid=>env.authenticatedContext(uid).firestore();
    const ref=(db,type,id)=>doc(db,ROOT,snap,type,id);
    await assertSucceeds(getDoc(ref(c('alice'),'sheets',sheetDocId('houseA'))));
    await assertSucceeds(getDoc(ref(c('viewer'),'sheets',sheetDocId('houseA'))));
    await assertFails(getDoc(ref(c('bob'),'sheets',sheetDocId('houseA'))));
    await assertSucceeds(getDoc(ref(c('narrator'),'sheets',sheetDocId('houseA'))));
    await assertSucceeds(getDoc(ref(c('alice'),'ledger',ledgerDocId('houseA',K(1)))));
    await assertFails(getDoc(ref(c('bob'),'ledger',ledgerDocId('houseA',K(1)))));
    await assertSucceeds(getDoc(ref(c('bob'),'ruleOverrides',idOf('noble-rule','r1'))));
    await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(),'ruleOverrides',idOf('noble-rule','r1'))));
    for(const u of ['narrator','alice','bob'])
      await assertFails(getDoc(ref(c(u),'gmNotes',idOf('noble-gm-note','houseA'))));
    await assertFails(setDoc(ref(c('alice'),'sheets',sheetDocId('houseA')),{version:99}));
    await assertFails(setDoc(ref(c('narrator'),'sheets',sheetDocId('houseA')),{version:99}));
    await assertFails(getDocs(collection(c('narrator'),ROOT,snap,'sheets')));
    console.log('Noble house emulator: transactional commit, idempotency, versioning, concurrency, role isolation and GM-note privacy verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Noble house integration failed:',e?.message||'error');process.exitCode=1;});
