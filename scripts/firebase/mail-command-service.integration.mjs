import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,deleteDoc} from 'firebase/firestore';
import {createEmulatorMailCommands,MailCommandDenied} from './mail-command-service.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const SNAPSHOT='8'.repeat(64);
const hash=t=>createHash('sha256').update(t).digest('hex');
const key=i=>'test-idempotent-'+i;
const date='1522-11-13';
const iso='2026-11-13T14:00:00.000Z';
const refId=i=>i.repeat(64);
async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  const app=initializeApp({projectId:PROJECT},'full-mail-runtime-ci');
  const env=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{host:'127.0.0.1',port:8080,
      rules:await readFile('firebase/firestore.domain.rules','utf8')},
  });
  try{
    const db=getFirestore(app);
    const domain=db.collection('migrationDomainStage').doc(SNAPSHOT);
    const temporal=db.collection('migrationTemporalStage').doc(SNAPSHOT);
    const history=db.collection('migrationMailHistoryStage').doc(SNAPSHOT);
    await Promise.all([
      domain.set({status:'complete'}),
      temporal.set({status:'complete'}),
      history.set({status:'complete'}),
    ]);
    await temporal.collection('calendar').doc('current').set({
      calendarType:'harptos',lastRound:0,version:1,
      year:1522,month:10,day:13,tenday:2,
    });
    for(const [uid,role,playerId,houses,edit] of [
      ['narrator','narrador',null,[],[]],
      ['alice','jogador','pa',['ha'],['ha']],
      ['bob','jogador','pb',['hb'],['hb']],
      ['charlie','jogador','pc',['hb'],[]],
      ['dave','jogador','pd',['hc'],['hc']],
      ['editor','editor',null,[],[]],
    ]){
      await domain.collection('access').doc(uid).set({
        userId:uid,profile:role,admin:role==='narrador',active:true,
        playerId,memberHouseIds:houses,editHouseIds:edit,
        requirePasswordChange:false,
      });
    }
    for(const [id,name] of [['ha','House A'],['hb','House B'],['hc','House C']]){
      await domain.collection('houses').doc(hash('house:'+id)).set({
        sourceId:id,name,active:true,season:2,
      });
    }
    const disabled=new Set();
    const auth={
      async verifyIdToken(token,checkRevoked){
        assert.equal(checkRevoked,true);
        if(!token?.startsWith('synthetic:'))throw Error('No token');
        return {uid:token.slice(10),admin:true,profile:'narrador'};
      },
      async getUser(uid){return {uid,disabled:disabled.has(uid)};},
    };
    const commands=createEmulatorMailCommands({
      db,auth,snapshotId:SNAPSHOT,env:process.env,
    });
    const token=uid=>'synthetic:'+uid;
    const send=(uid,requestKey,recipients,originHouseId,more={})=>
      commands.send({idToken:token(uid),requestKey,
        recipients,originHouseId,subject:'Synthetic title',
        content:'Test-only confidential message',campaignDate:date,...more});
    const reply=(uid,requestKey,letterId,more={})=>
      commands.reply({idToken:token(uid),requestKey,letterId,
        content:'Synthetic reply text',campaignDate:date,...more});
    await assert.rejects(commands.initialize({idToken:token('alice')}),MailCommandDenied);
    assert.deepEqual(await commands.initialize({idToken:token('narrator')}),
      {initialized:true,alreadyInitialized:false});
    assert.equal((await commands.initialize({idToken:token('narrator')}))
      .alreadyInitialized,true);
    await assert.rejects(send('editor',key(1),['h:ha'],null),MailCommandDenied);
    await assert.rejects(send('charlie',key(1),['h:ha'],'hb'),MailCommandDenied);
    await assert.rejects(send('alice',key(1),['h:ha'],'hb'),MailCommandDenied);
    await assert.rejects(send('alice',key(1),['h:bad'],'ha'),MailCommandDenied);
    await assert.rejects(send('alice',key(1),['h:hb','narrator'],'ha'),MailCommandDenied);
    await assert.rejects(send('narrator',key(1),['narrator'],null),MailCommandDenied);
    await assert.rejects(send('alice',key(1),['h:hb'],'ha'),/No open mail round/);
    const draft=await send('alice',key(2),['h:hb'],'ha',{asDraft:true});
    assert.equal(draft.state,'draft');
    assert.equal((await send('alice',key(2),['h:hb'],'ha',{asDraft:true}))
      .duplicate,true);
    await assert.rejects(send('alice',key(2),['h:hc'],'ha',{asDraft:true}));
    await assert.rejects(commands.scheduleDraft({
      idToken:token('alice'),id:draft.ids[0],version:1,
    }),/No open mail round/);
    const future=await send('narrator',key(3),['h:ha','h:hb'],null,{
      deliveryRound:2,
    });
    assert.equal(future.state,'scheduled');
    assert.equal(future.ids.length,2);
    assert.equal((await commands.list({idToken:token('bob')})).length,0);
    const open=await commands.openRound({idToken:token('narrator'),number:1});
    assert.equal(open.status,'open');
    await assert.rejects(commands.openRound({
      idToken:token('narrator'),number:2,
    }),MailCommandDenied);
    const sent=await send('alice',key(4),['h:hb'],'ha');
    assert.equal(sent.state,'delivered');
    assert.equal((await send('alice',key(4),['h:hb'],'ha')).duplicate,true);
    assert.equal((await commands.list({idToken:token('bob')})).length,1);
    assert.equal((await commands.list({idToken:token('dave')})).length,0);
    assert.equal((await commands.get({
      idToken:token('dave'),letterId:sent.ids[0],
    })),null);
    assert.equal((await commands.get({
      idToken:token('narrator'),letterId:sent.ids[0],
    })).subject,'Synthetic title');

    const toMaster=await send('alice',key(5),['narrator'],'ha');
    assert.equal(toMaster.state,'delivered');
    assert.equal((await commands.list({idToken:token('bob')})).length,1);
    const edited=await commands.editDraft({
      idToken:token('alice'),id:draft.ids[0],kind:'letter',version:1,
      subject:'Updated draft',content:'Changed synthetic content',
    });
    assert.equal(edited.version,2);
    await assert.rejects(commands.editDraft({
      idToken:token('alice'),id:draft.ids[0],kind:'letter',version:1,
      subject:'Stale draft',content:'Stale value',
    }),/version conflict/);
    const scheduledDraft=await commands.scheduleDraft({
      idToken:token('alice'),id:draft.ids[0],kind:'letter',version:2,
    });
    assert.equal(scheduledDraft.state,'delivered');
    await assert.rejects(commands.editDraft({
      idToken:token('alice'),id:draft.ids[0],kind:'letter',version:3,
      subject:'Cannot edit',content:'Already sent',
    }),MailCommandDenied);
    const pending=await reply('bob',key(6),sent.ids[0]);
    assert.equal(pending.state,'scheduled');
    assert.equal(pending.week,2);
    assert.deepEqual(await commands.listReplies({
      idToken:token('alice'),letterId:sent.ids[0],
    }),[]);
    assert.deepEqual(await commands.listReplies({
      idToken:token('bob'),letterId:sent.ids[0],
    }),[assert.objectContaining({
      id:pending.id,publicationState:'scheduled',
    })]);
    await assert.rejects(reply('dave',key(7),sent.ids[0]),MailCommandDenied);
    await assert.rejects(reply('alice',key(7),sent.ids[0]),MailCommandDenied);
    await assert.rejects(reply('charlie',key(7),sent.ids[0],{
      replyToId:pending.id,
    }),MailCommandDenied);
    await assert.rejects(reply('bob',key(7),sent.ids[0],{
      replyToId:refId('f'),
    }),MailCommandDenied);

    const masterReply=await reply('narrator',key(8),toMaster.ids[0]);
    assert.equal(masterReply.state,'scheduled');
    assert.equal(masterReply.week,2);
    const houseMaster=await send('narrator',key(9),['h:ha'],null);
    const houseReply=await reply('alice',key(10),houseMaster.ids[0]);
    assert.equal(houseReply.state,'delivered');
    assert.equal((await commands.listReplies({
      idToken:token('narrator'),letterId:houseMaster.ids[0],
    })).length,1);

    const replyDraft=await reply('bob',key(11),sent.ids[0],{asDraft:true});
    assert.equal(replyDraft.state,'draft');
    assert.equal((await commands.listReplies({
      idToken:token('alice'),letterId:sent.ids[0],
    })).length,0);
    const replyDraftUpdate=await commands.editDraft({
      idToken:token('bob'),id:replyDraft.id,kind:'reply',version:1,
      content:'Edited private draft',
    });
    assert.equal(replyDraftUpdate.version,2);
    const replyReady=await commands.scheduleDraft({
      idToken:token('bob'),id:replyDraft.id,kind:'reply',version:2,
    });
    assert.equal(replyReady.state,'scheduled');

    const trashed=await commands.changeTrash({
      idToken:token('alice'),id:draft.ids[0],kind:'letter',
      version:3,
    }).catch(e=>e);
    assert.ok(trashed instanceof MailCommandDenied);
    const bobOwnDraft=await reply('bob',key(12),sent.ids[0],{asDraft:true});
    const bin=await commands.changeTrash({
      idToken:token('bob'),id:bobOwnDraft.id,
      kind:'reply',version:1,
    });
    assert.equal(bin.deleted,true);
    const restored=await commands.changeTrash({
      idToken:token('bob'),id:bobOwnDraft.id,
      kind:'reply',version:2,restore:true,
    });
    assert.equal(restored.deleted,false);

    await assert.rejects(commands.note({
      idToken:token('alice'),letterId:sent.ids[0],
      text:'private note',requestKey:key(20),
    }),MailCommandDenied);
    assert.equal((await commands.note({
      idToken:token('narrator'),letterId:sent.ids[0],
      text:'Administrative synthetic note',requestKey:key(21),
    })).saved,true);
    const drop=domain.collection('access').doc('bob');
    await drop.update({memberHouseIds:[],editHouseIds:[]});
    await assert.rejects(reply('bob',key(13),sent.ids[0]),MailCommandDenied);
    assert.equal(await commands.get({
      idToken:token('bob'),letterId:sent.ids[0],
    }),null);
    await drop.update({memberHouseIds:['hb'],editHouseIds:['hb']});

    const close=await commands.closeRound({
      idToken:token('narrator'),number:1,
    });
    assert.equal(close.status,'closed');
    const second=await commands.openRound({
      idToken:token('narrator'),number:2,
    });
    assert.equal(second.deliveredLetters,2);
    assert.equal(second.deliveredReplies,3);
    assert.equal((await commands.list({
      idToken:token('alice'),
    })).some(l=>l.id===future.ids[0]),true);
    assert.equal((await commands.listReplies({
      idToken:token('alice'),letterId:sent.ids[0],
    })).length,2);
    await assert.rejects(commands.openRound({
      idToken:token('narrator'),number:4,
    }),MailCommandDenied);

    const legacyId=hash('letter:legacy-1');
    await domain.collection('letters').doc(legacyId).set({
      sourceId:'legacy-1',senderUid:'narrator',senderName:'Narrator',
      subject:'Historical letter',content:'Old preserved value',
      publicationState:'delivered',createdAt:iso,deletedAt:null,
      recipientHouseId:'ha',recipientPlayerId:null,
    });
    assert.equal((await commands.get({
      idToken:token('alice'),letterId:legacyId,
    })).readOnly,true);
    assert.equal((await commands.get({
      idToken:token('bob'),letterId:legacyId,
    })),null);
    const historicalReply=await reply('alice',key(22),legacyId);
    assert.equal(historicalReply.state,'delivered');
    const historical=(await domain.collection('letters').doc(legacyId).get()).data();
    assert.equal(historical.content,'Old preserved value');

    for(const client of [
      env.authenticatedContext('alice').firestore(),
      env.authenticatedContext('bob').firestore(),
      env.authenticatedContext('narrator').firestore(),
      env.authenticatedContext('editor',{admin:true}).firestore(),
      env.unauthenticatedContext().firestore(),
    ]){
      const privateRef=doc(client,'migrationMailRuntimeStage',SNAPSHOT,
        'letters',sent.ids[0]);
      await assertFails(getDoc(privateRef));
      await assertFails(getDocs(collection(client,
        'migrationMailRuntimeStage',SNAPSHOT,'letters')));
      await assertFails(setDoc(privateRef,{content:'FORGED'}));
      await assertFails(deleteDoc(privateRef));
      await assertFails(getDocs(collection(client,
        'migrationMailRuntimeStage',SNAPSHOT,'audits')));
      await assertFails(getDocs(collection(client,
        'migrationMailRuntimeStage',SNAPSHOT,'narratorNotes')));
    }
    disabled.add('alice');
    await assert.rejects(commands.list({idToken:token('alice')}),MailCommandDenied);
    console.log('Firebase mail emulator: private end-to-end compose, drafts, delivery, replies, history, notes, revocation, optimistic versioning, trash and client lockdown passed.');
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}
run().catch(e=>{
  console.error('Firebase mail E2E failed (synthetic-only):',e?.name||'Unknown');
  process.exitCode=1;
});
