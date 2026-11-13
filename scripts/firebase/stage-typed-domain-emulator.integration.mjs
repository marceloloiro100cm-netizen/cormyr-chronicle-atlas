/**
 * Integration test against a REAL LOCAL Firestore Emulator, synthetic data
 * only; never a Firebase cloud project. Guards both Admin and client SDKs.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  initializeTestEnvironment,assertFails,assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc,getDoc,getDocs,collection,setDoc,query,where } from 'firebase/firestore';
import {
  assertEmulatorOnly,
} from './stage-firestore-emulator.mjs';
import {
  buildTypedDomainPlan,writeTypedDomainToEmulator,
} from './stage-typed-domain-emulator.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snapshot=sha('typed-domain-synthetic-v1');
  const source=[
    tab('auth.users', [
      {id:'narrator'}, {id:'alice'}, {id:'bob'}, {id:'editor'},
      {id:'unprofiled'},
    ]),
    tab('public.user_roles',[{user_id:'narrator',role:'admin'}]),
    tab('public.campaign_access_profiles',[
      {user_id:'narrator',profile:'narrador',active:'t'},
      {user_id:'alice',profile:'jogador',active:'t'},
      {user_id:'bob',profile:'jogador',active:'t'},
      {user_id:'editor',profile:'editor',active:'t'},
    ]),
    tab('public.campaign_houses',[
      {id:'houseA',name:'House A',castle:'A',crest:null,season:'2',active:'t'},
      {id:'houseB',name:'House B',castle:'B',crest:null,season:'2',active:'t'},
      {id:'houseZ',name:'House Z',castle:'Z',crest:null,season:'2',active:'f'},
    ]),
    tab('public.campaign_players',[
      {id:'playerAlice',user_id:'alice',name:'Alice',active:'t',require_password_change:'f',roster_house_id:'houseA'},
      {id:'playerBob',user_id:'bob',name:'Bob',active:'t',require_password_change:'f',roster_house_id:'houseB'},
      {id:'playerEditor',user_id:'editor',name:'Editor',active:'t',require_password_change:'f',roster_house_id:null},
    ]),
    tab('public.house_memberships',[
      {player_id:'playerAlice',house_id:'houseA',can_edit:'t',can_edit_attributes:'f'},
      {player_id:'playerBob',house_id:'houseB',can_edit:'t',can_edit_attributes:'t'},
    ]),
    tab('public.campaign_letters',[
      {id:'letterA',sender_user_id:'narrator',sender_player_id:null,recipient_player_id:null,recipient_house_id:'houseA',subject:'Secret A',content:'Content A',created_at:'2026-11-12 18:00:00+00'},
      {id:'letterB',sender_user_id:'narrator',sender_player_id:null,recipient_player_id:null,recipient_house_id:'houseB',subject:'Secret B',content:'Content B',created_at:'2026-11-12 19:00:00+00'},
      {id:'letterSent',sender_user_id:'alice',sender_player_id:'playerAlice',recipient_player_id:'playerBob',recipient_house_id:null,subject:'Sent A to B',content:'Content C',created_at:'2026-11-12 20:00:00+00'},
      {id:'letterEditor',sender_user_id:'editor',sender_player_id:'playerEditor',recipient_player_id:null,recipient_house_id:'houseB',subject:'Old editor mail',content:'Editor must not read',created_at:'2026-11-12 21:00:00+00'},
      {id:'legacyNoRecipient',sender_user_id:'alice',sender_player_id:'playerAlice',recipient_player_id:null,recipient_house_id:null,subject:'Quarantined 1',content:'Opaque text one',created_at:'2026-11-12 22:00:00+00'},
      {id:'legacyBothRecipients',sender_user_id:'narrator',sender_player_id:null,recipient_player_id:'playerAlice',recipient_house_id:'houseB',subject:'Quarantined 2',content:'Opaque text two',created_at:'2026-11-12 23:00:00+00'},
    ]),
  ];
  const plan=buildTypedDomainPlan(source,snapshot);
  assert.equal(plan.summary.planValid,true);
  assert.equal(plan.summary.accountsWithoutProfile,1);
  assert.equal(plan.summary.typedCollections.lettersQuarantine,2);
  assert.equal(plan.summary.typedCollections.letters,4);
  assert.equal(plan.summary.letterCoverage.source,6);
  assert.equal(plan.summary.letterCoverage.complete,true);
  const adminApp=initializeApp({projectId},'cormyr-domain-test-admin');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({
    projectId,firestore:{host:'127.0.0.1',port:8080,rules},
  });
  const ref=(db,type,key)=>doc(db,'migrationDomainStage',snapshot,type,
    type==='access'?key:plan.docs[type].find(entry=>entry.payload.sourceId===key)?.id||
      plan.docs[type].find(entry=>entry.payload.id===key)?.id);
  try{
    const result=await writeTypedDomainToEmulator(plan,adminDb);
    assert.equal(result.emulatorWrites,19); // root markers + 3 houses + 3 players + 5 access + 4 letters + 2 quarantine
    const alice=env.authenticatedContext('alice').firestore();
    const bob=env.authenticatedContext('bob').firestore();
    const narrator=env.authenticatedContext('narrator').firestore();
    const editor=env.authenticatedContext('editor',{admin:true,role:'narrador'}).firestore();
    const unknown=env.authenticatedContext('unprofiled',{admin:true}).firestore();
    const anon=env.unauthenticatedContext().firestore();

    // Public house visibility and forbidden private roster fields.
    await assertSucceeds(getDoc(ref(anon,'houses','houseA')));
    await assertFails(getDoc(ref(anon,'houses','houseZ')));
    await assertSucceeds(getDoc(ref(narrator,'houses','houseZ')));
    await assertFails(getDoc(ref(anon,'players','playerAlice')));
    await assertSucceeds(getDoc(ref(alice,'players','playerAlice')));
    await assertFails(getDoc(ref(bob,'players','playerAlice')));
    await assertFails(getDoc(ref(editor,'players','playerEditor')));
    await assertSucceeds(getDoc(ref(narrator,'players','playerEditor')));

    // Letters are limited to sender/actual recipient House or Player.
    await assertSucceeds(getDoc(ref(alice,'letters','letterA')));
    await assertSucceeds(getDoc(ref(alice,'letters','letterSent')));
    await assertFails(getDoc(ref(alice,'letters','letterB')));
    await assertSucceeds(getDoc(ref(bob,'letters','letterB')));
    await assertSucceeds(getDoc(ref(bob,'letters','letterSent')));
    await assertFails(getDoc(ref(bob,'letters','letterA')));
    await assertSucceeds(getDoc(ref(narrator,'letters','letterA')));
    await assertFails(getDoc(ref(editor,'letters','letterEditor')));
    await assertFails(getDoc(ref(editor,'letters','letterB')));
    await assertFails(getDoc(ref(unknown,'letters','letterA')));
    await assertFails(getDoc(ref(anon,'letters','letterA')));

    // A quarantine letter is never authorized, including narrator/admin:
    // neither a missing recipient nor a double recipient may leak through
    // the old sender/house rule as if it were an addressed letter.
    const quarantined=plan.docs.lettersQuarantine.map(entry=>entry.id);
    assert.equal(quarantined.length,2);
    const quarantineRef=(db,id)=>doc(db,'migrationDomainStage',snapshot,'lettersQuarantine',id);
    for(const id of quarantined){
      for(const ctx of [alice,bob,narrator,editor,unknown,anon]){
        await assertFails(getDoc(quarantineRef(ctx,id)));
      }
      await assertFails(setDoc(quarantineRef(narrator,id),{recipientPlayerId:'playerAlice'}));
      await assertFails(setDoc(quarantineRef(alice,id),{content:'rewrite'}));
    }
    await assertFails(getDocs(collection(narrator,'migrationDomainStage',snapshot,'lettersQuarantine')));
    await assertFails(getDocs(collection(alice,'migrationDomainStage',snapshot,'lettersQuarantine')));
    await assertFails(getDocs(collection(editor,'migrationDomainStage',snapshot,'lettersQuarantine')));

    // Domain stage is *read only* to every Firebase client, including narrator.
    await assertFails(setDoc(ref(narrator,'letters','letterA'),{content:'forged'}));
    await assertFails(setDoc(ref(editor,'access','editor'),{profile:'narrador',admin:true}));
    await assertFails(setDoc(ref(alice,'access','alice'),{profile:'narrador',admin:true}));
    await assertFails(getDocs(collection(alice,'migrationDomainStage',snapshot,'letters')));
    await assertFails(getDocs(collection(narrator,'migrationDomainStage',snapshot,'letters')));
    await assertFails(getDoc(doc(alice,'migrationPrivateSnapshots','old-snapshot')));
    await assertSucceeds(getDoc(ref(alice,'access','alice')));
    await assertFails(getDoc(ref(bob,'access','alice')));
    await assertSucceeds(getDoc(ref(unknown,'access','unprofiled')));

    // A revoked membership must remove access *immediately* on next read.
    await adminDb.collection('migrationDomainStage').doc(snapshot)
      .collection('access').doc('alice').update({memberHouseIds:[],editHouseIds:[]});
    await assertFails(getDoc(ref(alice,'letters','letterA')));
    await assertSucceeds(getDoc(ref(alice,'letters','letterSent')));

    console.log('Typed Firestore emulator: four domain views staged; ambiguous letters quarantined; reader/writer denial, cross-house isolation, role forgery and revocation verified.');
  }finally{
    await env.cleanup();
    await deleteApp(adminApp);
  }
}
run().catch(()=>{
  console.error('Typed domain emulator rules test failed; no private source data printed.');
  process.exitCode=1;
});
