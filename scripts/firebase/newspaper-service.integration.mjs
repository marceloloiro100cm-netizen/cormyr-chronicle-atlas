/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildNewspaperRuntimePlan,writeNewspaperRuntimeToEmulator,ROOT} from './stage-newspaper-runtime-emulator.mjs';
import {ROOT as NOBLE,sheetDocId,ledgerDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME} from './stage-time-engine-emulator.mjs';
import {ROOT as SCHEDULE} from './stage-schedule-emulator.mjs';
import {createEmulatorNewspaperService} from './newspaper-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const E1='11111111-1111-4111-8111-111111111111';
const K=n=>`00000000-0000-4000-8000-00000000000${n}`;

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('newspaper-synthetic-v1');
  const plan=buildNewspaperRuntimePlan([
    tab('public.campaign_newspapers',[{id:E1,edition_no:'1',campaign_date:'1522-01-05',title:'Edição um',subtitle:'',
      template:'classico',font_style:'classico',state:'published',blocks:'[{"kind":"text","text":"x"}]',pdf_path:'',
      version:'1',publication_revision:'1',created_by:'narrator',updated_by:'narrator',created_at:'2026-01-01 00:00:00+00',
      updated_at:'2026-01-01 00:00:00+00',published_at:'2026-01-01 00:00:00+00',archived_at:'',cancelled_at:'',publish_on:''}]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-newspaper-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeNewspaperRuntimeToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('leo',{profile:'jogador',admin:false,playerId:'pLeo',memberHouseIds:['espiao'],editHouseIds:['espiao']});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hB'],editHouseIds:[]});
    await acc('ghost',{profile:'jogador',admin:false,playerId:null,memberHouseIds:[],editHouseIds:[]});
    const player=(id,userId,name,roster)=>domain.collection('players').doc(sha('player:'+id))
      .set({id,userId,name,active:true,requirePasswordChange:false,rosterHouseId:roster});
    await player('pLeo','leo',' Leonardo ','espiao');await player('pA','alice','Alice','hA');await player('pB','bob','Bob','hB');
    const noble=adminDb.collection(NOBLE).doc(snap);
    const sheetState=(wealth,perm)=>({houseId:'hA',schemaVersion:1,phase:'active',month:4,base:{wealth},permanent:{wealth:perm}});
    await noble.collection('sheets').doc(sheetDocId('hA')).set({houseId:'hA',state:sheetState(2,0),version:5});
    await adminDb.collection(TIME).doc(snap).collection('calendar').doc('current')
      .set({year:1522,month:0,day:5,festival:null,version:1});
    await adminDb.collection(SCHEDULE).doc(snap).collection('events').doc('ev1')
      .set({id:'ev1',publishedDate:'1522-01-10',publishedTitle:'Festa',publishedDescription:'d'});
    await adminDb.collection(SCHEDULE).doc(snap).collection('events').doc('ev2')
      .set({id:'ev2',publishedDate:null,publishedTitle:null});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorNewspaperService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',L='synthetic:leo',A='synthetic:alice',B='synthetic:bob',G='synthetic:ghost';

    // Visibility: players read only published editions; unknown accounts nothing.
    assert.equal(await code(svc.listEditions('bad')),'denied');
    assert.equal(await code(svc.listEditions(G)),'denied');
    assert.deepEqual((await svc.listEditions(A)).map(e=>e.edition_no),[1]);

    // Create (editor only, draft only), lowest free number, optimistic edit.
    assert.equal(await code(svc.createEdition(A,{campaignDate:'1522-01-06'})),'denied');
    const d=await svc.createEdition(L,{campaignDate:'1522-01-06',title:'Rascunho'});
    assert.equal(d.edition_no,2);assert.equal(d.state,'draft');assert.equal(d.version,1);
    assert.deepEqual((await svc.listEditions(A)).map(e=>e.edition_no),[1]);
    assert.deepEqual((await svc.listEditions(N)).map(e=>e.edition_no),[2,1]);
    assert.equal(await code(svc.saveEdition(A,d.id,{title:'x'})),'denied');
    assert.equal(await code(svc.saveEdition(L,d.id,{version:9})),'conflict');
    assert.equal(await code(svc.saveEdition(L,d.id,{state:'archived'})),'invalid');
    const s1=await svc.saveEdition(L,d.id,{blocks:[{kind:'text',text:'novo'}]});
    assert.equal(s1.version,2);
    assert.equal((await svc.listRevisions(N,d.id)).length,1);
    assert.equal(await code(svc.listRevisions(A,d.id)),'denied');

    // Scheduled publication follows the Kingdom calendar (today = 1522-01-05).
    await svc.saveEdition(L,d.id,{publishOn:'1522-01-07'});
    assert.equal(await svc.publishDue(A),0);
    await adminDb.collection(TIME).doc(snap).collection('calendar').doc('current').update({day:7});
    assert.equal(await svc.publishDue(A),1);
    assert.equal(await svc.publishDue(A),0); // idempotent
    const pub=(await svc.listEditions(A)).find(e=>e.id===d.id);
    assert.equal(pub.state,'published');assert.equal(pub.publication_revision,1);assert.equal(pub.publish_on,null);

    // Read receipts follow the publication revision.
    assert.equal(await svc.markRead(A,d.id),1);
    assert.equal(await code(svc.markRead(G,d.id)),'denied');
    const s2=await svc.saveEdition(N,d.id,{title:'Corrigida'});
    assert.equal(s2.publication_revision,2);
    assert.deepEqual((await svc.listReads(A)).map(r=>r.read_version),[1]);
    assert.equal(await svc.markRead(A,d.id),2);
    assert.equal((await svc.listReads(B)).length,0);
    assert.equal((await svc.listReads(N)).length,1);

    // Commissions: debit, ledger, idempotency, limits, refund and visibility.
    const req=(o={})=>({houseId:'hA',title:'Boato no mercado',body:'Texto da noticia contratada',imagePath:null,key:K(1),...o});
    assert.equal(await code(svc.commissionStory(B,req())),'denied');       // not an editor of the house
    const c1=await svc.commissionStory(A,req());
    assert.equal(c1.alreadyApplied,false);assert.equal(c1.houseVersion,6);
    assert.equal((await noble.collection('sheets').doc(sheetDocId('hA')).get()).data().state.permanent.wealth,-1);
    assert.equal((await noble.collection('ledger').doc(ledgerDocId('hA',K(1))).get()).data().action,'newspaper_commission');
    assert.equal((await svc.commissionStory(A,req())).alreadyApplied,true);   // same key: no second debit
    assert.equal((await noble.collection('sheets').doc(sheetDocId('hA')).get()).data().version,6);
    assert.equal(await code(svc.commissionStory(N,req({houseId:'hA',key:K(1),title:'Outro assunto'}))),null); // admin, same key, same house
    const c2=await svc.commissionStory(A,req({key:K(2)}));
    assert.equal(c2.remainingWealthEstimate,0);
    assert.equal(await code(svc.commissionStory(A,req({key:K(3)}))),'invalid'); // no Wealth left
    assert.deepEqual((await svc.listCommissions(A)).map(c=>c.state),['pending','pending']);
    assert.equal((await svc.listCommissions(B)).length,0);
    assert.equal((await svc.listCommissions(L)).length,2);

    const rej=await svc.rejectCommission(L,c2.commissionId,'Sem espaço nesta edição');
    assert.equal(rej.refunded,1);
    assert.equal((await noble.collection('sheets').doc(sheetDocId('hA')).get()).data().state.permanent.wealth,-1+0);
    assert.equal(await code(svc.rejectCommission(L,c2.commissionId,'Sem espaço')),'invalid');
    assert.equal(await code(svc.rejectCommission(A,c1.commissionId,'Sem espaço')),'denied');
    assert.equal(await svc.markCommissionsSeen(A,'hA'),1);
    assert.equal(await svc.markCommissionsSeen(A,'hA'),0);
    assert.equal(await code(svc.markCommissionsSeen(A,'hB')),'denied');

    // Publishing an edition that contains the commission settles it.
    const e3=await svc.createEdition(N,{campaignDate:'1522-01-08',blocks:[{kind:'text',commissionId:c1.commissionId}]});
    await svc.saveEdition(N,e3.id,{state:'published'});
    const settled=(await svc.listCommissions(A)).find(c=>c.id===c1.commissionId);
    assert.equal(settled.state,'published');assert.equal(settled.newspaper_id,e3.id);

    // Deleting an edition clears its audit, reads and commission link; the number is reused.
    assert.equal(await code(svc.deleteEdition(A,e3.id)),'denied');
    await svc.deleteEdition(N,e3.id);
    assert.equal((await svc.listCommissions(N)).find(c=>c.id===c1.commissionId).newspaper_id,null);
    assert.equal(await code(svc.deleteDraft(N,d.id)),'invalid'); // published is not a draft
    const e4=await svc.createEdition(N,{campaignDate:'1522-01-09'});
    assert.equal(e4.edition_no,3);
    await svc.deleteDraft(N,e4.id);

    // Staff, models, engravings, settings: editors only.
    const st=await svc.saveStaff(L,{name:'Ana',specialty:'Cronista'});
    assert.equal((await svc.listStaff(N)).length,1);
    await svc.saveStaff(L,{id:st.id,name:'Ana Maria'});
    assert.equal((await svc.listStaff(N))[0].name,'Ana Maria');
    assert.equal(await code(svc.listStaff(A)),'denied');
    await svc.deleteStaff(N,st.id);
    assert.equal(await code(svc.saveModel(N,{name:'m',blocks:[]})),'invalid');
    assert.equal((await svc.saveModel(N,{name:'m',blocks:[{kind:'text'}]})).name,'m');
    await svc.saveEngraving(N,{name:'g',publicSrc:'/newspaper/gravuras/a.jpg'});
    assert.equal(await code(svc.saveEngraving(N,{name:'g2',publicSrc:'/newspaper/gravuras/a.jpg'})),'conflict');
    assert.equal((await svc.getSettings(N)).title,'A Folha Sem Selo');
    await svc.saveSettings(N,{title:'Gazeta',subtitle:'s',template:'gazeta',fontStyle:'romana'});
    assert.equal((await svc.getSettings(L)).font_style,'romana');
    assert.equal(await code(svc.saveSettings(A,{title:'x',template:'gazeta',fontStyle:'romana'})),'denied');

    // Editor calendar: published events only.
    assert.deepEqual((await svc.calendarEvents(N,1522,0)).map(e=>e.id),['schedule:ev1']);
    assert.equal(await code(svc.calendarEvents(A,1522,0)),'denied');

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      await assertFails(getDocs(collection(db,ROOT,snap,'editions')));
      await assertFails(getDoc(doc(db,ROOT,snap,'commissions','x')));
      await assertFails(setDoc(doc(db,ROOT,snap,'settings','current'),{title:'x'}));
    }
    console.log('Newspaper emulator: editions, audit, scheduling, reads, commissions with Wealth debit, staff/models/engravings/settings, calendar and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Newspaper integration failed:',e?.message||'error');process.exitCode=1;});
