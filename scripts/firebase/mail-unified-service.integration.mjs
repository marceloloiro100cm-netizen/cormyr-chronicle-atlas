import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc} from 'firebase/firestore';
import {
  createEmulatorUnifiedMailbox,UnifiedMailboxDenied,
} from './mail-unified-service.mjs';
import {createEmulatorMailCommands} from './mail-command-service.mjs';
import {createEmulatorMailHttpHandler} from './mail-http-handler.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const SNAPSHOT='7'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const iso=n=>new Date(Date.UTC(2026,10,13,10,n)).toISOString();
const tok=uid=>'synthetic:'+uid;
const key=n=>'unified-test-key-'+n;
const harptos='1522-11-13';

async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  let phase='setup';
  const app=initializeApp({projectId:PROJECT},'mail-unified-emulator-ci');
  const env=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{
      host:'127.0.0.1',port:8080,
      rules:await readFile('firebase/firestore.domain.rules','utf8'),
    },
  });
  try{
    const db=getFirestore(app);
    const domain=db.collection('migrationDomainStage').doc(SNAPSHOT);
    const temporal=db.collection('migrationTemporalStage').doc(SNAPSHOT);
    const history=db.collection('migrationMailHistoryStage').doc(SNAPSHOT);
    await Promise.all([
      domain.set({status:'complete',formatVersion:1}),
      temporal.set({status:'complete',formatVersion:1}),
      history.set({status:'complete',formatVersion:1}),
    ]);
    await temporal.collection('calendar').doc('current').set({
      calendarType:'harptos',lastRound:null,version:1,
      year:1522,month:10,day:13,tenday:2,
    });
    const users=[
      ['narrator','narrador',null,[],[]],
      ['alice','jogador','pa',['ha'],['ha']],
      ['bob','jogador','pb',['hb'],['hb']],
      ['charlie','jogador','pc',['hb'],[]],
      ['editor','editor',null,[],[]],
      ['outsider','jogador','po',[],[]],
    ];
    for(const [uid,profile,playerId,memberHouseIds,editHouseIds] of users){
      await domain.collection('access').doc(uid).set({
        userId:uid,profile,playerId,memberHouseIds,editHouseIds,
        active:true,admin:profile==='narrador',requirePasswordChange:false,
      });
    }
    for(const id of ['ha','hb']){
      await domain.collection('houses').doc(hash('house:'+id)).set({
        sourceId:id,name:'Synthetic '+id,active:true,season:2,
      });
    }
    const legacyId={
      ha:hash('letter:original-house-a'),
      hb:hash('letter:original-house-b'),
      direct:hash('letter:original-player-charlie'),
      draft:hash('letter:archived-draft'),
      deleted:hash('letter:archived-deleted'),
      ambiguous:hash('letter:ambiguous-do-not-leak'),
    };
    const legacy=(senderUid,house,player,subject,n,state='delivered',deletedAt=null)=>({
      sourceId:'synthetic-source-'+n,
      senderUid,senderPlayerId:senderUid==='alice'?'pa':null,
      senderName:senderUid,recipientHouseId:house,
      recipientPlayerId:player,subject,content:'Synthetic historical '+subject,
      createdAt:iso(n),publicationState:state,deletedAt,
    });
    await domain.collection('letters').doc(legacyId.ha).set(
      legacy('narrator','ha',null,'Old House A',1));
    await domain.collection('letters').doc(legacyId.hb).set({
      ...legacy('alice','hb',null,'Old House B',2),
      campaignDate:'1520-F-shieldmeet',creationRound:3,deliveryRound:4,
      letterNumber:4,letterKind:'reservada',originHouseId:'ha',
      version:2,deliveredAt:iso(2),
    });
    await domain.collection('letters').doc(legacyId.direct).set(
      legacy('narrator',null,'pc','Private Charlie',3));
    await domain.collection('letters').doc(legacyId.draft).set(
      legacy('alice','hb',null,'Secret draft',4,'draft'));
    await domain.collection('letters').doc(legacyId.deleted).set(
      legacy('alice','hb',null,'Old deleted',5,'delivered',iso(6)));
    await domain.collection('letters').doc(legacyId.ambiguous).set(
      legacy('alice','hb','pc','Ambiguous',7));
    // Two delivered archived replies to distinct individuals within House B.
    const historicReplies=history.collection('replies');
    await historicReplies.doc(hash('reply:hb-to-bob')).set({
      sourceId:'hb-to-bob',letterId:legacyId.hb,
      authorUid:'alice',recipientUid:'bob',authorName:'Alice',
      content:'Only Bob can read this reply',createdAt:iso(8),
      publicationState:'delivered',deletedAt:null,version:1,
    });
    await historicReplies.doc(hash('reply:hb-to-charlie')).set({
      sourceId:'hb-to-charlie',letterId:legacyId.hb,
      authorUid:'alice',recipientUid:'charlie',authorName:'Alice',
      content:'Only Charlie can read this reply',createdAt:iso(9),
      publicationState:'delivered',deletedAt:null,version:1,
    });

    const disabled=new Set();
    const auth={
      async verifyIdToken(value,revoked){
        assert.equal(revoked,true);
        if(!value?.startsWith('synthetic:'))throw Error('Invalid synthetic token');
        return {uid:value.slice(10),admin:true,profile:'narrador'};
      },
      async getUser(uid){return {uid,disabled:disabled.has(uid)};},
    };
    const command=createEmulatorMailCommands({
      db,auth,snapshotId:SNAPSHOT,env:process.env,
    });
    const mailbox=createEmulatorUnifiedMailbox({
      db,auth,snapshotId:SNAPSHOT,env:process.env,
    });
    phase='initialization';
    await assert.rejects(mailbox.list({idToken:tok('alice')}),UnifiedMailboxDenied);
    assert.deepEqual(await command.initialize({idToken:tok('narrator')}),
      {initialized:true,alreadyInitialized:false});
    await command.openRound({idToken:tok('narrator'),number:1});

    phase='new-messages';
    const runtime=await command.send({
      idToken:tok('alice'),requestKey:key(1),originHouseId:'ha',
      recipients:['h:hb'],subject:'New House B',
      content:'Synthetic new mail',campaignDate:harptos,
    });
    const pending=await command.send({
      idToken:tok('alice'),requestKey:key(2),originHouseId:'ha',
      recipients:['h:hb'],subject:'My draft',
      content:'Not delivered',campaignDate:harptos,asDraft:true,
    });
    const future=await command.reply({
      idToken:tok('bob'),requestKey:key(3),letterId:runtime.ids[0],
      content:'Scheduled reply for sender',campaignDate:harptos,
    });
    assert.equal(future.state,'scheduled');

    phase='unified-list';
    const bob=await mailbox.list({idToken:tok('bob')});
    assert.deepEqual(new Set(bob.items.map(x=>x.subject)),
      new Set(['Old House B','New House B']));
    assert.equal(bob.items.every(x=>x.source==='imported'||x.source==='runtime'),true);
    assert.equal(bob.items.some(x=>x.subject==='Secret draft'),false);
    const charlie=await mailbox.list({idToken:tok('charlie')});
    assert.ok(charlie.items.some(x=>x.subject==='Old House B'));
    assert.ok(charlie.items.some(x=>x.subject==='Private Charlie'));
    assert.equal(charlie.items.some(x=>x.subject==='Old House A'),false);
    const outsider=await mailbox.list({idToken:tok('outsider')});
    assert.deepEqual(outsider.items,[]);
    await assert.rejects(mailbox.list({idToken:tok('editor')}),UnifiedMailboxDenied);
    const narrator=await mailbox.list({idToken:tok('narrator')});
    assert.ok(narrator.items.some(x=>x.subject==='New House B'));
    assert.equal(narrator.items.some(x=>x.subject==='My draft'),false);
    assert.equal(narrator.items.some(x=>x.subject==='Old deleted'),false);
    assert.equal(narrator.items.some(x=>x.subject==='Ambiguous'),false);

    const sent=await mailbox.list({idToken:tok('alice'),folder:'sent'});
    assert.deepEqual(new Set(sent.items.map(x=>x.subject)),
      new Set(['Old House B','New House B']));
    const drafts=await mailbox.list({idToken:tok('alice'),folder:'drafts'});
    assert.equal(drafts.items.length,1);
    assert.equal(drafts.items[0].id,pending.ids[0]);
    assert.equal(drafts.items[0].readOnly,false);
    const importedOnly=await mailbox.list({
      idToken:tok('alice'),source:'imported',
    });
    assert.ok(importedOnly.items.length>=2);
    assert.equal(importedOnly.items.every(x=>x.source==='imported'),true);
    assert.deepEqual((await mailbox.list({idToken:tok('bob'),
      source:'runtime'})).items.map(x=>x.source),['runtime']);
    const filtered=await mailbox.list({
      idToken:tok('bob'),query:'HOUSE B',folder:'received',
    });
    assert.equal(filtered.items.length,2);
    const first=await mailbox.list({idToken:tok('bob'),pageSize:1});
    assert.ok(first.nextCursor);
    const second=await mailbox.list({
      idToken:tok('bob'),pageSize:1,cursor:first.nextCursor,
    });
    assert.equal(second.items.length,1);
    assert.notEqual(first.items[0].id,second.items[0].id);
    assert.equal(second.nextCursor,null);
    for(const invalid of [
      {folder:'trash'},{source:'cloud'},{pageSize:51},{cursor:'not-valid'},
    ])await assert.rejects(mailbox.list({
      idToken:tok('alice'),...invalid,
    }));

    phase='thread-privacy';
    const bobThread=await mailbox.getThread({
      idToken:tok('bob'),letterId:legacyId.hb,
    });
    assert.equal(bobThread.letter.source,'imported');
    assert.equal(bobThread.letter.readOnly,true);
    assert.equal(bobThread.letter.campaignDate,'1520-F-shieldmeet');
    assert.equal(bobThread.letter.creationRound,3);
    assert.equal(bobThread.letter.deliveryRound,4);
    assert.equal(bobThread.letter.letterNumber,4);
    assert.equal(bobThread.letter.letterKind,'reservada');
    assert.equal(bobThread.letter.originHouseId,'ha');
    assert.equal(bobThread.letter.version,2);
    assert.deepEqual(bobThread.replies.map(x=>x.content),
      ['Only Bob can read this reply']);
    const charlieThread=await mailbox.getThread({
      idToken:tok('charlie'),letterId:legacyId.hb,
    });
    assert.deepEqual(charlieThread.replies.map(x=>x.content),
      ['Only Charlie can read this reply']);
    const masterThread=await mailbox.getThread({
      idToken:tok('narrator'),letterId:legacyId.hb,
    });
    assert.equal(masterThread.replies.length,2);
    const aliceThread=await mailbox.getThread({
      idToken:tok('alice'),letterId:legacyId.hb,
    });
    assert.equal(aliceThread.replies.length,2);
    const runtimeThread=await mailbox.getThread({
      idToken:tok('bob'),letterId:runtime.ids[0],
    });
    assert.equal(runtimeThread.letter.source,'runtime');
    assert.equal(runtimeThread.replies.length,1);
    assert.equal(runtimeThread.replies[0].publicationState,'scheduled');
    assert.equal(await mailbox.getThread({
      idToken:tok('outsider'),letterId:legacyId.hb,
    }),null);
    assert.equal(await mailbox.getThread({
      idToken:tok('bob'),letterId:legacyId.ha,
    }),null);

    phase='receipts';
    assert.equal((await mailbox.markRead({
      idToken:tok('bob'),letterId:legacyId.hb,
    })).recorded,true);
    assert.equal((await mailbox.markRead({
      idToken:tok('bob'),letterId:legacyId.hb,
    })).alreadyRecorded,true);
    assert.equal((await mailbox.markRead({
      idToken:tok('bob'),letterId:runtime.ids[0],
    })).recorded,true);
    const afterRead=await mailbox.list({idToken:tok('bob')});
    assert.equal(afterRead.items.length,2);
    assert.equal(afterRead.items.every(x=>typeof x.readAt==='string'),true);
    await assert.rejects(mailbox.markRead({
      idToken:tok('bob'),letterId:legacyId.ha,
    }));
    await assert.rejects(mailbox.markRead({
      idToken:tok('alice'),letterId:legacyId.hb,
    }));

    phase='http-boundary';
    const http=createEmulatorMailHttpHandler({db,auth,snapshotId:SNAPSHOT,
      origin:'http://127.0.0.1:8787',env:{...process.env,
        FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}});
    const httpCall=async(action,uid,body={})=>{
      const response=await http(new Request('http://127.0.0.1:8787/api/firebase-mail/'+action,{
        method:'POST',headers:{'content-type':'application/json',
          authorization:'Bearer '+tok(uid)},body:JSON.stringify(body)}));
      assert.equal(response.headers.get('cache-control'),'no-store');
      return {status:response.status,...await response.json()};
    };
    const httpList=await httpCall('list','bob');
    assert.equal(httpList.status,200);
    assert.equal(httpList.data.items.length,2);
    assert.equal((await httpCall('list','editor')).status,403);
    assert.equal((await httpCall('thread','bob',{letterId:legacyId.ha})).status,404);
    assert.equal((await httpCall('open-round','alice',{number:2})).status,403);
    assert.equal((await httpCall('list','bob',{snapshotId:SNAPSHOT})).status,400);
    const httpDraft={requestKey:'http-draft-idempotency',originHouseId:'ha',
      recipients:['h:hb'],subject:'HTTP draft',content:'Synthetic HTTP content',
      campaignDate:harptos,asDraft:true};
    const created=await httpCall('send','alice',httpDraft);
    assert.equal(created.status,200);
    const httpId=created.data.ids[0];
    assert.equal((await httpCall('send','alice',httpDraft)).data.duplicate,true);
    assert.equal((await httpCall('send','alice',{...httpDraft,content:'Different'})).status,409);
    assert.equal((await httpCall('thread','bob',{letterId:httpId})).status,404);
    assert.equal((await httpCall('edit-draft','alice',{
      id:httpId,version:1,subject:'Edited HTTP',content:'Edited synthetic body',
    })).status,200);
    assert.equal((await httpCall('edit-draft','alice',{
      id:httpId,version:1,subject:'Stale HTTP',content:'Stale body',
    })).status,409);
    assert.equal((await httpCall('schedule-draft','alice',{id:httpId,version:2})).status,200);
    assert.equal((await httpCall('thread','bob',{letterId:httpId})).status,200);
    assert.equal((await httpCall('read','bob',{letterId:httpId})).data.recorded,true);
    assert.equal((await httpCall('reply','bob',{letterId:httpId,
      requestKey:'http-reply-idempotency',content:'HTTP reply',campaignDate:harptos,
    })).status,200);
    assert.equal((await httpCall('note','alice',{letterId:httpId,
      requestKey:'http-note-denied',text:'No authority',
    })).status,403);

    phase='revocation';
    const bobAccess=domain.collection('access').doc('bob');
    await bobAccess.update({memberHouseIds:[],editHouseIds:[]});
    const afterRevoke=await mailbox.list({idToken:tok('bob')});
    assert.deepEqual(afterRevoke.items,[]);
    assert.deepEqual((await httpCall('list','bob')).data.items,[]);
    assert.equal((await httpCall('read','bob',{letterId:httpId})).status,403);
    assert.equal(await mailbox.getThread({
      idToken:tok('bob'),letterId:legacyId.hb,
    }),null);
    assert.equal(await mailbox.getThread({
      idToken:tok('bob'),letterId:runtime.ids[0],
    }),null);
    await assert.rejects(mailbox.markRead({
      idToken:tok('bob'),letterId:runtime.ids[0],
    }));
    disabled.add('charlie');
    await assert.rejects(mailbox.list({idToken:tok('charlie')}),UnifiedMailboxDenied);

    phase='sdk-lockdown';
    for(const client of [
      env.authenticatedContext('bob').firestore(),
      env.authenticatedContext('narrator').firestore(),
      env.authenticatedContext('editor',{admin:true}).firestore(),
      env.unauthenticatedContext().firestore(),
    ]){
      const privateRef=doc(client,'migrationMailRuntimeStage',SNAPSHOT,
        'letters',runtime.ids[0]);
      await assertFails(getDoc(privateRef));
      await assertFails(getDocs(collection(client,
        'migrationMailRuntimeStage',SNAPSHOT,'letters')));
      await assertFails(setDoc(privateRef,{content:'unauthorized'}));
      await assertFails(getDoc(doc(client,'migrationMailHistoryStage',
        SNAPSHOT,'replies',hash('reply:hb-to-bob'))));
    }
    console.log('Unified mailbox emulator E2E passed: historical + runtime, separate recipients, private threads, pagination, read acknowledgements, revocation and SDK lockdown.');
  }catch(e){
    console.error('Unified mailbox E2E failure at synthetic phase:',phase,
      e?.name??'Unknown',String(e?.stack||'').split('\n').slice(1,4).join(' | '));
    process.exitCode=1;
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}
run().catch(()=>{
  console.error('Unified mailbox initialization failed. No campaign data printed.');
  process.exitCode=1;
});
