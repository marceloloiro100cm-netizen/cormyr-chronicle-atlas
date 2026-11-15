/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildStoragePlan,writeStorageToEmulator} from './stage-storage-references-emulator.mjs';
import {ROOT as NEWS} from './stage-newspaper-runtime-emulator.mjs';
import {ROOT as REC} from './stage-records-emulator.mjs';
import {letterDocId,replyDocId} from './storage-references-core.mjs';
import {createStageStorageResolvers} from './storage-resolvers.mjs';
import {createEmulatorStorageAccessService} from './storage-access-service.mjs';
import {BUCKETS as B} from './storage-access-core.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const E1='11111111-1111-4111-8111-111111111111',E2='22222222-2222-4222-8222-222222222222';
const IMG=n=>`${n}/33333333-3333-4333-8333-333333333333.png`;

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('storage-resolvers-synthetic-v1');
  const app=initializeApp({projectId},'cormyr-storage-resolvers-test');
  const db=getFirestore(app);
  try{
    const domain=db.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('leo',{profile:'jogador',admin:false,playerId:'pLeo',memberHouseIds:['espiao'],editHouseIds:['espiao']});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hB'],editHouseIds:[]});
    await acc('cara',{profile:'jogador',admin:false,playerId:'pC',memberHouseIds:['hC'],editHouseIds:[]});
    const player=(id,userId,name,roster)=>domain.collection('players').doc(sha('player:'+id))
      .set({id,userId,name,active:true,requirePasswordChange:false,rosterHouseId:roster});
    await player('pLeo','leo','Leonardo','espiao');await player('pA','alice','Alice','hA');
    await player('pB','bob','Bob','hB');await player('pC','cara','Cara','hC');

    const P={letter:IMG('x1'),draft:IMG('x2'),reply:IMG('x3'),recA:IMG('x4'),recB:IMG('x5'),gal:IMG('g1'),galHidden:IMG('g2')};
    const ref=p=>`[cormyr-image:${p}|a]`;
    const plan=buildStoragePlan([
      tab('public.campaign_letters',[{id:'L1',content:ref(P.letter)},{id:'L2',content:ref(P.draft)}]),
      tab('public.letter_replies',[{id:'R1',content:ref(P.reply)}]),
      tab('public.campaign_records',[{id:'rA',content:ref(P.recA)},{id:'rB',content:ref(P.recB)}]),
      tab('public.house_catalog',[{public_reviewed:'t',gallery:JSON.stringify([{path:P.gal}])},
        {public_reviewed:'f',gallery:JSON.stringify([{path:P.galHidden}])}]),
    ],snap);
    assert.equal(plan.summary.planValid,true);
    await writeStorageToEmulator(plan,db);
    const letter=(o)=>({senderUid:'narrator',subject:'s',content:'c',createdAt:'2026-01-01T00:00:00.000Z',
      deletedAt:null,recipientPlayerId:null,recipientHouseId:null,...o});
    await domain.collection('letters').doc(letterDocId('L1')).set(letter({publicationState:'delivered',recipientHouseId:'hA'}));
    await domain.collection('letters').doc(letterDocId('L2')).set(letter({publicationState:'scheduled',recipientHouseId:'hA'}));
    await db.collection('migrationMailHistoryStage').doc(snap).collection('replies').doc(replyDocId('R1'))
      .set({authorUid:'bob',recipientUid:'narrator',publicationState:'delivered',deletedAt:null});
    const rec=db.collection(REC).doc(snap).collection('records');
    await rec.doc('rA').set({id:'rA',visibility:'house',houseId:'hA',playerId:null});
    await rec.doc('rB').set({id:'rB',visibility:'player',houseId:'hB',playerId:'pB'});
    const eds=db.collection(NEWS).doc(snap).collection('editions');
    const NP=n=>`${E1}/${n}.png`;
    await eds.doc(E1).set({id:E1,state:'published',pdfPath:`${E1}/edicao.pdf`,blocks:[{kind:'image',imagePath:NP('pub')}]});
    await eds.doc(E2).set({id:E2,state:'draft',pdfPath:null,blocks:[{kind:'image',imagePath:`${E2}/rascunho.png`}]});

    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorStorageAccessService({db,auth,snapshotId:snap,resolvers:createStageStorageResolvers({db,snapshotId:snap,env:process.env}),env:process.env});
    const code=async p=>{try{await p;return null;}catch(e){return e.code||'error';}};
    const t=u=>'synthetic:'+u,q=(idToken,op,bucket,name)=>({idToken,op,bucket,name});
    const ok=async(u,op,b,n)=>assert.equal(await svc.authorize(q(u&&t(u),op,b,n)),true,`${u} ${op} ${n}`);
    const no=async(u,op,b,n)=>assert.equal(await code(svc.authorize(q(u&&t(u),op,b,n))),'denied',`${u} ${op} ${n}`);

    // Public gallery: anonymous allowed only for reviewed gallery paths.
    await ok(null,'read',B.images,P.gal);await no(null,'read',B.images,P.galHidden);await no(null,'read',B.images,P.letter);
    // Delivered letter to house hA: members and Narrator, not other houses; scheduled letter stays hidden.
    await ok('alice','read',B.images,P.letter);await ok('narrator','read',B.images,P.letter);
    await no('bob','read',B.images,P.letter);await no('alice','read',B.images,P.draft);
    // Reply: author and recipient only (Narrator reads everything anyway).
    await ok('bob','read',B.images,P.reply);await no('cara','read',B.images,P.reply);await no('alice','read',B.images,P.reply);
    // Records: house record to members, player record to its player.
    await ok('alice','read',B.images,P.recA);await no('bob','read',B.images,P.recA);
    await ok('bob','read',B.images,P.recB);await no('alice','read',B.images,P.recB);
    // Newspaper assets: players read published images and PDF, only the editor reads drafts.
    await ok('alice','read',B.newspapers,NP('pub'));await ok('alice','read',B.newspapers,`${E1}/edicao.pdf`);
    await no('alice','read',B.newspapers,`${E2}/rascunho.png`);await no('alice','read',B.newspapers,NP('outro'));
    await ok('leo','read',B.newspapers,`${E2}/rascunho.png`);await ok('narrator','read',B.newspapers,`${E2}/rascunho.png`);
    await no('leo','read',B.newspapers,'99999999-9999-4999-8999-999999999999/x.png');
    // Upload requires the editor identity and an existing edition folder.
    await ok('leo','upload',B.newspapers,`${E2}/novo.png`);await no('alice','upload',B.newspapers,`${E2}/novo.png`);
    await no('leo','upload',B.newspapers,'99999999-9999-4999-8999-999999999999/x.png');
    await no('leo','upload',B.newspapers,'sem-pasta.png');
    console.log('storage resolvers integration passed');
  }finally{await deleteApp(app);}
}
run().catch(e=>{console.error(e);process.exit(1);});
