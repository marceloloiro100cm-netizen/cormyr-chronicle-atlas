import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {planMailHistory,stageMailHistory} from './stage-mail-history-emulator.mjs';
import {syntheticMailHistory} from './mail-history-fixtures.mjs';
import {createEmulatorInbox,InboxDenied} from './letter-inbox-service.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=createHash('sha256').update('synthetic-mail-history-e2e').digest('hex');
const idOf=(type,id)=>createHash('sha256').update(type+':'+id).digest('hex');

async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  const plan=planMailHistory(syntheticMailHistory(),HASH);
  assert.equal(plan.summary.planValid,true);

  const app=initializeApp({projectId:PROJECT},'cormyr-mail-history-ci');
  const env=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{
      host:'127.0.0.1',port:8080,
      rules:await readFile('firebase/firestore.domain.rules','utf8'),
    },
  });
  try{
    const db=getFirestore(app);
    const result=await stageMailHistory(plan,db,process.env);
    assert.equal(result.staged,true);
    assert.equal(result.deliveredReplies,1);
    assert.equal(result.privatelyArchivedReplies,7);
    assert.equal(result.archiveRows,16);
    assert.equal(result.cloudWrites,0);
    await assert.rejects(stageMailHistory(plan,db,process.env),/already exists/);

    const domain=db.collection('migrationDomainStage').doc(HASH);
    await domain.set({status:'complete'});
    const access=domain.collection('access');
    for(const [uid,role,houseIds,playerId] of [
      ['narrator','narrador',[],null],
      ['alice','jogador',['a'],'pa'],
      ['bob','jogador',['a'],'pb'],
      ['charlie','jogador',['a'],'pc'],
      ['editor','editor',[],'pe'],
    ]){
      await access.doc(uid).set({
        userId:uid,profile:role,active:true,
        admin:role==='narrador',requirePasswordChange:false,
        playerId,memberHouseIds:houseIds,
      });
    }
    const letterId=idOf('letter','l1');
    await domain.collection('letters').doc(letterId).set({
      sourceId:'l1',senderUid:'narrator',
      senderName:'Test narrator',subject:'Synthetic house letter',
      content:'Only synthetic content',createdAt:'2026-11-12T10:00:00.000Z',
      recipientPlayerId:null,recipientHouseId:'a',
      publicationState:'delivered',deletedAt:null,
    });
    const fakeAuth={
      async verifyIdToken(token,checkRevoked){
        assert.equal(checkRevoked,true);
        if(typeof token!=='string'||!token.startsWith('synthetic:'))throw Error('Bad token');
        return {uid:token.slice(10),profile:'narrador',admin:true};
      },
      async getUser(uid){return {uid,disabled:false};},
    };
    const inbox=createEmulatorInbox({db,auth:fakeAuth,snapshotId:HASH,env:process.env});
    const req=uid=>({idToken:'synthetic:'+uid,letterId});
    assert.equal((await inbox.listReplies(req('alice'))).length,1);
    assert.equal((await inbox.listReplies(req('bob'))).length,1);
    assert.equal((await inbox.listReplies(req('narrator'))).length,1);
    assert.deepEqual(await inbox.listReplies(req('charlie')),[]);
    await assert.rejects(inbox.listReplies(req('editor')),InboxDenied);
    assert.equal(await inbox.listReplies({idToken:'synthetic:alice',letterId:idOf('letter','missing')}),null);
    // Revocation impacts backend immediately, without needing a new token.
    await access.doc('alice').update({memberHouseIds:[]});
    assert.equal(await inbox.listReplies(req('alice')),null);
    // The narrator cannot enumerate archives via client SDK.
    const clients={
      narrator:env.authenticatedContext('narrator').firestore(),
      alice:env.authenticatedContext('alice').firestore(),
      editor:env.authenticatedContext('editor',{admin:true}).firestore(),
      anon:env.unauthenticatedContext().firestore(),
    };
    const root=(f,part,id)=>doc(f,'migrationMailHistoryStage',HASH,part,id);
    for(const f of Object.values(clients)){
      await assertFails(getDoc(doc(f,'migrationMailHistoryStage',HASH)));
      await assertFails(getDoc(root(f,'replies',plan.replies[0].id)));
      await assertFails(getDocs(collection(f,'migrationMailHistoryStage',HASH,'replies')));
      await assertFails(setDoc(root(f,'replies',plan.replies[0].id),{content:'forged'}));
      await assertFails(getDoc(root(f,'archive',plan.archive.tableDocs[0].tableDigest)));
    }
    console.log('Mail history emulator: 8 companion tables and reply coverage staged; no client reads; restricted server reply delivery and revocation verified.');
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}
run().catch(()=>{
  console.error('Mail-history security integration failed; source values suppressed.');
  process.exitCode=1;
});
