/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT as NOBLE,sheetDocId} from './stage-noble-house-emulator.mjs';
import {createEmulatorStorageAccessService} from './storage-access-service.mjs';
import {BUCKETS as B} from './storage-access-core.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const U='11111111-1111-4111-8111-111111111111';

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('storage-synthetic-v1');
  const app=initializeApp({projectId},'cormyr-storage-test');
  const db=getFirestore(app);
  try{
    const domain=db.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('leo',{profile:'jogador',admin:false,playerId:'pLeo',memberHouseIds:['espiao'],editHouseIds:['espiao']});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hB'],editHouseIds:[]});
    await acc('off',{profile:'jogador',admin:false,playerId:'pO',memberHouseIds:['hA'],editHouseIds:[],active:false});
    const player=(id,userId,name,roster)=>domain.collection('players').doc(sha('player:'+id))
      .set({id,userId,name,active:true,requirePasswordChange:false,rosterHouseId:roster});
    await player('pLeo','leo','Leonardo','espiao');await player('pA','alice','Alice','hA');await player('pB','bob','Bob','hB');
    const crest=`house-crests/hA/${U}.png`;
    await db.collection(NOBLE).doc(snap).collection('sheets').doc(sheetDocId('hA'))
      .set({houseId:'hA',version:1,state:{houseId:'hA',identity:{crestPath:crest}}});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const resolvers={
      publicGalleryImage:async a=>a.name==='gallery/pub.png',
      referencedByReadableContent:async a=>a.name==='shared/ref.png'&&a.actor.uid==='bob',
      newspaperAssetReadable:async()=>true,newspaperAssetUploadAllowed:async()=>true,
    };
    const svc=createEmulatorStorageAccessService({db,auth,snapshotId:snap,resolvers,env:process.env});
    const bare=createEmulatorStorageAccessService({db,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;return null;}catch(e){return e.code||'error';}};
    const t=u=>'synthetic:'+u;
    const q=(idToken,op,bucket,name)=>({idToken,op,bucket,name});

    // Narrator, own folder, crest of an own house, content link, public gallery.
    assert.equal(await svc.authorize(q(t('narrator'),'read',B.images,'x/any.png')),true);
    assert.equal(await svc.authorize(q(t('alice'),'read',B.images,`alice/${U}.png`)),true);
    assert.equal(await code(svc.authorize(q(t('alice'),'read',B.images,'bob/p.png'))),'denied');
    assert.equal(await svc.authorize(q(t('alice'),'read',B.images,crest)),true);
    assert.equal(await code(svc.authorize(q(t('bob'),'read',B.images,crest))),'denied');
    assert.equal(await svc.authorize(q(t('bob'),'read',B.images,'shared/ref.png')),true);
    assert.equal(await code(svc.authorize(q(t('alice'),'read',B.images,'shared/ref.png'))),'denied');
    assert.equal(await svc.authorize(q(null,'read',B.images,'gallery/pub.png')),true);
    assert.equal(await code(svc.authorize(q(null,'read',B.images,'gallery/other.png'))),'denied');
    assert.equal(await code(bare.authorize(q(null,'read',B.images,'gallery/pub.png'))),'denied');
    assert.equal(await code(bare.authorize(q(t('bob'),'read',B.images,'shared/ref.png'))),'denied');
    // A crest path must match the sheet exactly; another house cannot borrow it.
    assert.equal(await code(svc.authorize(q(t('alice'),'read',B.images,`house-crests/hA/${U.replace('1','2')}.png`))),'denied');

    // Upload to the own folder only; an inactive account and a bad token are denied.
    assert.equal(await svc.authorize(q(t('alice'),'upload',B.images,`alice/${U}.png`)),true);
    assert.equal(await code(svc.authorize(q(t('alice'),'upload',B.images,`bob/${U}.png`))),'denied');
    assert.equal(await code(svc.authorize(q(t('off'),'read',B.images,'off/p.png'))),'denied');
    assert.equal(await code(svc.authorize(q('garbage','read',B.images,'gallery/pub.png'))),'denied');
    assert.equal(await code(svc.authorize(q(t('ghost'),'read',B.images,'x.png'))),'denied');

    // Newspaper buckets: editor identity (Narrator or Leonardo of "espiao").
    assert.equal(await svc.authorize(q(t('leo'),'upload',B.newspapers,'n/a.png')),true);
    assert.equal(await code(bare.authorize(q(t('leo'),'upload',B.newspapers,'n/a.png'))),'denied');
    assert.equal(await code(svc.authorize(q(t('alice'),'upload',B.newspapers,'n/a.png'))),'denied');
    assert.equal(await svc.authorize(q(t('alice'),'read',B.newspapers,'n/a.png')),true);
    assert.equal(await svc.authorize(q(t('narrator'),'delete',B.staff,`${U}.png`)),true);
    assert.equal(await code(svc.authorize(q(t('alice'),'read',B.staff,`${U}.png`))),'denied');
    assert.equal(await svc.authorize(q(t('alice'),'read',B.commissions,`hA/${U}.png`)),true);
    assert.equal(await code(svc.authorize(q(t('bob'),'read',B.commissions,`hA/${U}.png`))),'denied');
    assert.equal(await svc.authorize(q(t('leo'),'read',B.commissions,`hA/${U}.png`)),true);
    // Default deny: unknown bucket and traversal.
    assert.equal(await code(svc.authorize(q(t('narrator'),'read','other-bucket','a.png'))),'denied');
    assert.equal(await code(svc.authorize(q(t('narrator'),'read',B.images,'../a.png'))),'denied');
    console.log('storage access service integration passed');
  }finally{await deleteApp(app);}
}
run().catch(e=>{console.error(e);process.exit(1);});
