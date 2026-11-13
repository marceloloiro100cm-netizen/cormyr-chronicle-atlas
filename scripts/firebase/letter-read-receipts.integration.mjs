import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,deleteDoc} from 'firebase/firestore';
import {createEmulatorInbox,InboxDenied} from './letter-inbox-service.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const SNAPSHOT='9'.repeat(64);
const ID={house:'a'.repeat(64),direct:'b'.repeat(64),
  draft:'c'.repeat(64),deleted:'d'.repeat(64),ambiguous:'e'.repeat(64)};
const when=i=>new Date(Date.UTC(2026,10,13,12,i)).toISOString();
const letter=(senderUid,player,house,state='delivered',deletedAt=null)=>({
  senderUid,senderName:'Synthetic actor',senderPlayerId:null,
  recipientPlayerId:player,recipientHouseId:house,
  subject:'Synthetic-only',content:'No real campaign content',
  createdAt:when(1),publicationState:state,deletedAt,
});
async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  const app=initializeApp({projectId:PROJECT},'cormyr-receipts-ci');
  const env=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{
      host:'127.0.0.1',port:8080,
      rules:await readFile('firebase/firestore.domain.rules','utf8'),
    },
  });
  try{
    const db=getFirestore(app);
    const root=db.collection('migrationDomainStage').doc(SNAPSHOT);
    await root.set({status:'complete'});
    const access=root.collection('access');
    for(const [uid,profile,playerId,houses] of [
      ['narrator','narrador',null,[]],
      ['alice','jogador','pa',['ha']],
      ['bob','jogador','pb',['ha']],
      ['charlie','jogador','pc',[]],
      ['editor','editor',null,[]],
    ]){
      await access.doc(uid).set({
        userId:uid,profile,active:true,admin:profile==='narrador',
        playerId,memberHouseIds:houses,requirePasswordChange:false,
      });
    }
    const letters=root.collection('letters');
    await letters.doc(ID.house).set(letter('narrator',null,'ha'));
    await letters.doc(ID.direct).set(letter('alice','pb',null));
    await letters.doc(ID.draft).set(letter('narrator',null,'ha','draft'));
    await letters.doc(ID.deleted).set(letter('narrator',null,'ha','delivered',when(2)));
    await letters.doc(ID.ambiguous).set(letter('narrator',null,null));

    const auth={
      async verifyIdToken(token,checkRevoked){
        assert.equal(checkRevoked,true);
        if(typeof token!=='string'||!token.startsWith('synthetic:'))
          throw Error('Invalid test token');
        return {uid:token.slice(10),admin:true};
      },
      async getUser(uid){return {uid,disabled:false};},
    };
    const inbox=createEmulatorInbox({db,auth,snapshotId:SNAPSHOT,env:process.env});
    const mark=(uid,id)=>inbox.markLetterRead({idToken:'synthetic:'+uid,letterId:id});
    assert.deepEqual(await mark('alice',ID.house),{recorded:true,alreadyRecorded:false});
    assert.deepEqual(await mark('alice',ID.house),{recorded:true,alreadyRecorded:true});
    assert.deepEqual(await mark('bob',ID.house),{recorded:true,alreadyRecorded:false});
    assert.deepEqual(await mark('bob',ID.direct),{recorded:true,alreadyRecorded:false});
    for(const [uid,id] of [
      ['narrator',ID.house],['editor',ID.house],['charlie',ID.house],
      ['alice',ID.direct],['alice',ID.draft],['alice',ID.deleted],
      ['bob',ID.ambiguous],
    ]){
      await assert.rejects(mark(uid,id),InboxDenied);
    }
    await access.doc('alice').update({memberHouseIds:[]});
    await assert.rejects(mark('alice',ID.house),InboxDenied);
    const receipts=db.collection('migrationMailRuntimeStage').doc(SNAPSHOT)
      .collection('readReceipts');
    const saved=await receipts.get();
    assert.equal(saved.size,3);
    for(const entry of saved.docs){
      const record=entry.data();
      assert.equal(record.schemaVersion,1);
      assert.match(record.readAt,/^\d{4}-/);
      assert.equal(record.letterId===ID.house||record.letterId===ID.direct,true);
      assert.equal(record.viewerUid==='alice'||record.viewerUid==='bob',true);
    }
    for(const client of [
      env.authenticatedContext('alice').firestore(),
      env.authenticatedContext('bob').firestore(),
      env.authenticatedContext('narrator').firestore(),
      env.authenticatedContext('editor',{admin:true}).firestore(),
      env.unauthenticatedContext().firestore(),
    ]){
      const receipt=doc(client,'migrationMailRuntimeStage',SNAPSHOT,
        'readReceipts',saved.docs[0].id);
      await assertFails(getDoc(receipt));
      await assertFails(getDocs(collection(client,'migrationMailRuntimeStage',
        SNAPSHOT,'readReceipts')));
      await assertFails(setDoc(receipt,{viewerUid:'forged'}));
      await assertFails(deleteDoc(receipt));
    }
    console.log('Emulator receipt integration: recipient-only, idempotent, revocation-aware and deny-all client rules verified.');
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}
run().catch(()=>{
  console.error('Private receipt integration failed; no campaign data printed.');
  process.exitCode=1;
});
