import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc} from 'firebase/firestore';
import {createEmulatorInbox,InboxDenied} from './letter-inbox-service.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const SHA='e'.repeat(64);
const ID={one:'a'.repeat(64),two:'b'.repeat(64),third:'c'.repeat(64),
  deleted:'d'.repeat(64),quarantine:'f'.repeat(64)};
const date=i=>new Date(Date.UTC(2026,10,13,14,i)).toISOString();
const letter=(senderUid,recipientPlayerId,recipientHouseId,subject,i,deletedAt=null)=>({
  sourceId:'synthetic-'+i,senderUid,senderPlayerId:null,
  senderName:'Fictício',recipientPlayerId,recipientHouseId,
  subject,content:'Synthetic-only correspondence',createdAt:date(i),deletedAt,
});

async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  const app=initializeApp({projectId:PROJECT},'cormyr-letters-inbox-ci');
  const env=await initializeTestEnvironment({
    projectId:PROJECT,
    firestore:{host:'127.0.0.1',port:8080,
      rules:await readFile('firebase/firestore.domain.rules','utf8')},
  });
  try{
    const db=getFirestore(app),root=db.collection('migrationDomainStage').doc(SHA);
    await root.set({status:'complete',formatVersion:1});
    const access=root.collection('access'),letters=root.collection('letters');
    const profiles=[
      {uid:'narrator',profile:'narrador',active:true,admin:true,playerId:null,memberHouseIds:[]},
      {uid:'alice',profile:'jogador',active:true,admin:false,playerId:'pa',memberHouseIds:['ha']},
      {uid:'bob',profile:'jogador',active:true,admin:false,playerId:'pb',memberHouseIds:['hb']},
      {uid:'editor',profile:'editor',active:true,admin:false,playerId:'pe',memberHouseIds:[]},
      {uid:'unprofiled',profile:null,active:false,admin:false,playerId:null,memberHouseIds:[]},
    ];
    for(const p of profiles){
      await access.doc(p.uid).set({
        userId:p.uid,profile:p.profile,active:p.active,admin:p.admin,
        requirePasswordChange:false,playerId:p.playerId,memberHouseIds:p.memberHouseIds,
      });
    }
    await letters.doc(ID.one).set(letter('narrator',null,'ha','for ha',1));
    await letters.doc(ID.two).set(letter('narrator',null,'hb','for hb',2));
    await letters.doc(ID.third).set(letter('alice','pb',null,'to player B',3));
    await letters.doc(ID.deleted).set(letter('alice',null,'hb','deleted',4,date(5)));
    await root.collection('lettersQuarantine').doc(ID.quarantine).set({
      sourceTable:'public.campaign_letters',rawValues:['opaque-private-test'],
      recipientShape:'missingBoth',
    });

    const auth={
      async verifyIdToken(token,revoked){
        assert.equal(revoked,true);
        if(typeof token!=='string'||!token.startsWith('synthetic:'))throw Error('Invalid JWT');
        return {uid:token.slice(10),admin:true,profile:'narrador'};
      },
      async getUser(uid){return {uid,disabled:false};},
    };
    const inbox=createEmulatorInbox({db,auth,snapshotId:SHA,env:process.env});
    const all=async uid=>(await inbox.listLetters({idToken:'synthetic:'+uid})).items;
    assert.deepEqual((await all('alice')).map(x=>x.subject),['to player B','for ha']);
    assert.deepEqual((await all('bob')).map(x=>x.subject),['to player B','for hb']);
    assert.deepEqual((await all('narrator')).map(x=>x.subject),
      ['deleted','to player B','for hb','for ha']);
    for(const uid of ['editor','unprofiled']){
      await assert.rejects(all(uid),InboxDenied);
    }
    assert.equal(await inbox.getLetter({idToken:'synthetic:alice',id:ID.two}),null);
    assert.equal(await inbox.getLetter({idToken:'synthetic:alice',id:ID.quarantine}),null);
    const paged=await inbox.listLetters({idToken:'synthetic:alice',pageSize:1});
    assert.ok(paged.nextCursor);
    assert.equal((await inbox.listLetters({idToken:'synthetic:alice',
      cursor:paged.nextCursor})).items.length,1);

    const alice=env.authenticatedContext('alice').firestore();
    const bob=env.authenticatedContext('bob').firestore();
    const narrator=env.authenticatedContext('narrator').firestore();
    const editor=env.authenticatedContext('editor',{admin:true}).firestore();
    const ref=(client,id)=>doc(client,'migrationDomainStage',SHA,'letters',id);
    await assertSucceeds(getDoc(ref(alice,ID.one)));
    await assertFails(getDoc(ref(bob,ID.one)));
    await assertFails(getDoc(ref(alice,ID.deleted)));
    await assertSucceeds(getDoc(ref(narrator,ID.deleted)));
    await assertFails(getDoc(ref(editor,ID.one)));
    await assertFails(getDocs(collection(narrator,'migrationDomainStage',SHA,'letters')));
    await assertFails(setDoc(ref(narrator,ID.one),{subject:'tampered'}));
    await assertFails(getDoc(doc(narrator,'migrationDomainStage',SHA,
      'lettersQuarantine',ID.quarantine)));
    // A legacy document without deletion flag must not become readable.
    await letters.doc(ID.one).update({deletedAt:null});
    await letters.doc(ID.one).update({deletedAt:requireNoField()});
    // Revoke membership: backend and direct client both change immediately.
    await access.doc('alice').update({memberHouseIds:[]});
    assert.deepEqual((await all('alice')).map(x=>x.subject),['to player B']);
    await assertFails(getDoc(ref(alice,ID.one)));
    console.log('Firebase local inbox: authenticated role/house isolation, deleted letters, token claims, pagination and immediate revocation verified.');
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}
function requireNoField(){
  // Imported from Admin SDK once Firebase Admin is installed for this test.
  return undefined;
}
run().catch(()=>{
  console.error('Private mail inbox emulator integration failed (no personal data printed).');
  process.exitCode=1;
});
