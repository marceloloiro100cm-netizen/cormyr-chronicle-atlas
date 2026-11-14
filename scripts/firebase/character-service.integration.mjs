/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildCharacterPlan,writeCharactersToEmulator,ROOT} from './stage-characters-emulator.mjs';
import {createEmulatorCharacterService} from './character-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const C1='11111111-1111-4111-8111-111111111111',Q1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R='justificativa suficiente';
const ch=(id,o={})=>({id,display_name:'Pessoa '+id[0],aliases:'{}',house_id:'houseA',noble_roles:'{}',race:null,
  is_noble:'t',birth_year:'1500',birth_date:null,baseline_age:null,baseline_year:null,age_policy:'year_turn',
  age_exception_note:null,apparent_age:null,alive_status:'alive',death_year:null,death_date:null,
  visibility:'gm',owner_user_id:null,confidence:'confirmed',review_status:'reviewed',review_note:'',
  version:'1',created_by:'n',updated_by:'n',created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00',...o});

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('characters-synthetic-v1');
  const plan=buildCharacterPlan([
    tab('public.campaign_houses',[{id:'houseA'},{id:'houseB'}]),
    tab('public.campaign_characters',[ch(C1)]),
    tab('public.character_source_links',[]),
    tab('public.character_review_queue',[{id:Q1,source_kind:'campaign_house',source_key:'houseA',proposed_name:'Pessoa 1',
      house_id:'houseA',evidence:'{}',source_visibility:'gm',status:'pending',character_id:null,review_note:'',
      created_at:'2026-01-01 00:00:00+00',updated_at:'2026-01-01 00:00:00+00'}]),
    tab('public.character_relations',[]),tab('public.character_registry_audit',[]),
    tab('public.character_year_transitions',[]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-character-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeCharactersToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    for(const h of ['houseA','houseB'])
      await domain.collection('houses').doc(createHash('sha256').update('house:'+h).digest('hex')).set({sourceId:h,active:true});
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,active:true,requirePasswordChange:false,...o});
    await acc('narrator',{profile:'narrador',admin:true});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['houseA'],editHouseIds:['houseA']});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorCharacterService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice';

    const made=await svc.saveCharacter(N,{payload:{displayName:'Nova Pessoa',houseId:'houseB',birthYear:1510},reason:R});
    assert.equal(made.version,1);
    const upd=await svc.saveCharacter(N,{id:made.id,version:1,payload:{displayName:'Nova Pessoa II',houseId:'houseB',birthYear:1510},reason:R});
    assert.equal(upd.version,2);
    assert.equal(await code(svc.saveCharacter(N,{id:made.id,version:1,payload:{displayName:'x',birthYear:1510},reason:R})),'conflict');
    assert.equal(await code(svc.saveCharacter(A,{payload:{displayName:'Forjada'},reason:R})),'denied');
    assert.equal(await code(svc.saveCharacter('bad',{payload:{displayName:'x'},reason:R})),'denied');
    assert.equal(await code(svc.saveCharacter(N,{payload:{displayName:'x',houseId:'semCasa'},reason:R})),'invalid');

    await svc.saveRelation(N,{from:C1,to:made.id,relation:'parent',reason:R});
    assert.equal(await code(svc.saveRelation(N,{from:made.id,to:C1,relation:'parent',reason:R})),'conflict');
    assert.equal(await code(svc.saveRelation(N,{from:C1,to:made.id,relation:'parent',reason:R})),'conflict');
    assert.equal(await code(svc.saveRelation(A,{from:C1,to:made.id,relation:'sibling',reason:R})),'denied');

    assert.equal(await code(svc.reviewSource(A,{queueId:Q1,action:'link',characterId:C1,reason:R})),'denied');
    assert.equal((await svc.reviewSource(N,{queueId:Q1,action:'link',characterId:C1,reason:R})).status,'linked');
    assert.equal(await code(svc.reviewSource(N,{queueId:Q1,action:'ignore',reason:R})),'conflict');

    const dash=await svc.ageDashboard(N,{year:1520,targetYear:1521});
    const row=dash.characters.find(r=>r.id===C1);
    assert.equal(row.before.status,'ok');assert.equal(row.before.age,20);assert.equal(row.after.age,21);
    assert.equal(await code(svc.ageDashboard(A,{year:1520,targetYear:1521})),'denied');

    const audit=await adminDb.collection(ROOT).doc(snap).collection('audit').get();
    assert.equal(audit.size,4); // create, update, relation, link
    const clients=['narrator','alice'].map(u=>env.authenticatedContext(u).firestore());
    for(const db of [...clients,env.unauthenticatedContext().firestore()]){
      await assertFails(getDoc(doc(db,ROOT,snap,'characters',C1)));
      await assertFails(getDocs(collection(db,ROOT,snap,'characters')));
      await assertFails(setDoc(doc(db,ROOT,snap,'characters',C1),{version:99}));
    }
    console.log('Character registry emulator: narrator-only save/relations/review, version control, cycle guard, audit and client denial verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Character integration failed:',e?.message||'error');process.exitCode=1;});
