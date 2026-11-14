/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildPrivateGmPlan,writePrivateGmToEmulator,ROOT} from './stage-private-gm-emulator.mjs';
import {ROOT as RECORDS,versionDocId} from './stage-records-emulator.mjs';
import {createEmulatorPrivateGmService} from './private-gm-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('private-gm-synthetic-v1');
  const plan=buildPrivateGmPlan([
    tab('public.campaign_private_gm_content',[{id:'segredo',payload:'{"nota":"sintético"}',updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.campaign_private_vassal_workbooks',[{parent_house_id:'hA',vassal_house_id:'hB',payload:'{"v":1}',updated_at:null}]),
    tab('public.campaign_admin_audit',[]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-private-gm-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writePrivateGmToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,...o});
    await acc('narrator',{active:true,profile:'narrador',admin:true});
    await acc('alice',{active:true,profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('bob',{active:true,profile:'jogador',admin:false,playerId:'pB',memberHouseIds:[],editHouseIds:[]});
    await acc('boss',{active:true,profile:'narrador',admin:true});
    const player=(id,userId,o={})=>domain.collection('players').doc(sha('player:'+id))
      .set({id,userId,name:id,active:true,requirePasswordChange:false,rosterHouseId:null,...o});
    await player('pA','alice');await player('pB','bob',{active:false});await player('pBoss','boss');
    await domain.collection('houses').doc(sha('house:hA')).set({sourceId:'hA',name:'Casa A'});
    await domain.collection('houses').doc(sha('house:hB')).set({sourceId:'hB',name:'Casa B'});
    const rec=(id,o)=>adminDb.collection(RECORDS).doc(snap).collection('records').doc(id)
      .set({id,title:'T'+id,content:'c',version:1,visibility:'player',playerId:'pA',houseId:'hA',kind:'x',
        updatedBy:'n',updatedAt:'2026-01-01T00:00:00.000Z',syncState:'synced',...o});
    await rec('r1',{});await rec('r2',{playerId:'pB',houseId:'hB'});await rec('r3',{visibility:'narrator',playerId:null});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const sent=[];
    const svc=createEmulatorPrivateGmService({db:adminDb,auth,snapshotId:snap,env:process.env,
      handlers:{send:async c=>{sent.push(c);return {id:'carta-1'};}}});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice';

    // Private content: Narrador only.
    assert.equal((await svc.getGmContent(N,'segredo')).payload.nota,'sintético');
    assert.equal(await code(svc.getGmContent(A,'segredo')),'denied');
    assert.equal(await code(svc.getGmContent('bad','segredo')),'denied');
    assert.deepEqual((await svc.listGmContent(N)).map(x=>x.id),['segredo']);
    assert.equal((await svc.serverGetVassalWorkbook({parentHouseId:'hA',vassalHouseId:'hB'})).payload.v,1);
    assert.equal(await svc.serverGetVassalWorkbook({parentHouseId:'hB',vassalHouseId:'hA'}),null);

    // Representation lifecycle and refusals.
    assert.equal(await code(svc.startRepresentation(A,'pA')),'denied');
    assert.equal(await code(svc.startRepresentation(N,'pB')),'invalid');   // inactive player
    assert.equal(await code(svc.startRepresentation(N,'pBoss')),'denied');  // another admin account
    assert.equal(await code(svc.representationAction(N,'read')),'denied');  // no session yet
    assert.equal(await code(svc.representationAction(N,'rm -rf')),'invalid');
    await svc.startRepresentation(N,'pA');

    const view=await svc.representationAction(N,'read');
    assert.deepEqual(view.houses.map(x=>x.sourceId),['hA']);
    assert.deepEqual(view.records.map(x=>x.id),['r1']); // no r2 (other player), no r3 (narrator-only)

    const saved=await svc.representationAction(N,'save_record',{id:'r1',version:1,title:'Novo',content:'texto'});
    assert.equal(saved.version,2);
    assert.equal((await adminDb.collection(RECORDS).doc(snap).collection('versions').doc(versionDocId('r1',2)).get()).data().author,'alice');
    assert.equal(await code(svc.representationAction(N,'save_record',{id:'r1',version:1,title:'x',content:'y'})),'conflict');
    assert.equal(await code(svc.representationAction(N,'save_record',{id:'r2',version:1,title:'x',content:'y'})),'denied');
    assert.equal(await code(svc.representationAction(N,'save_record',{id:'r3',version:1,title:'x',content:'y'})),'denied');

    // Mail actions: refused without a handler, executed as the player with one.
    assert.equal(await code(svc.representationAction(N,'reply',{letter:'l'})),'invalid');
    assert.equal((await svc.representationAction(N,'send',{subject:'s'})).id,'carta-1');
    assert.equal(sent[0].userId,'alice');assert.equal(sent[0].actorUid,'narrator');

    // A player's own access removal is honoured immediately.
    await acc('alice',{active:false,profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    assert.equal(await code(svc.representationAction(N,'read')),'denied');
    await acc('alice',{active:true,profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});

    assert.equal((await svc.stopRepresentation(N)).stopped,true);
    assert.equal(await code(svc.representationAction(N,'read')),'denied');
    assert.equal((await svc.stopRepresentation(N)).stopped,false);

    const audit=(await adminDb.collection(ROOT).doc(snap).collection('audit').get()).docs.map(d=>d.data().action).sort();
    assert.deepEqual(audit,['representation_save_record','representation_send','representation_start','representation_stop']);

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      await assertFails(getDocs(collection(db,ROOT,snap,'content')));
      await assertFails(getDoc(doc(db,ROOT,snap,'vassal','x')));
      await assertFails(setDoc(doc(db,ROOT,snap,'sessions','narrator'),{actor:'narrator'}));
    }
    console.log('Private GM emulator: narrator-only content, audited 30-minute representation, scope-limited actions and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Private GM integration failed:',e?.message||'error');process.exitCode=1;});
