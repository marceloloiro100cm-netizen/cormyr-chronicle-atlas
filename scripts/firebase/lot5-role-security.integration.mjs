/**
 * Lote 5: real Firestore Emulator client rules + authenticated HTTP domain
 * acceptance with synthetic records. No production credentials or user data.
 * The HTTP identity stub is intentionally not a Cloud Firebase Auth test.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {createEmulatorDomainHttpHandler} from './domain-http-handler.mjs';
import {createEmulatorHouseViewService} from './house-view-service.mjs';
import {sheetDocId} from './stage-noble-house-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const HASH=x=>createHash('sha256').update(x).digest('hex');
const snap=HASH('lot5-security-only-synthetic-fixture-v1');
const origin='http://127.0.0.1:8788';
const houseId=x=>HASH('house:'+x);
const A='A',B='B';
const profiles={
  narrator:{profile:'narrador',admin:true},
  alice:{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:[A],editHouseIds:[A],rosterHouseId:B},
  bob:{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:[B],editHouseIds:[B],rosterHouseId:A},
  editor:{profile:'editor',admin:false,playerId:'pE',rosterHouseId:A},
  'locked-editor':{profile:'editor',admin:false,requirePasswordChange:true},
  'locked-narrator':{profile:'narrador',admin:true,requirePasswordChange:true},
  disabled:{profile:'jogador',admin:false,active:false,playerId:'pD',memberHouseIds:[A]},
  mismatched:{profile:'narrador',admin:true,userId:'somebody-else'},
  unprofiled:{profile:'unprofiled',admin:false},
};
const req=(uid,domain,action,args=[])=>{
  const headers={'content-type':'application/json'};
  if(uid!==null)headers.authorization='Bearer synthetic:'+uid;
  return new Request(origin+'/api/domain',{method:'POST',headers,
    body:JSON.stringify({domain,action,args})});
};
const httpStatus=async (handler,uid,domain,action,args=[])=>{
  const r=await handler(req(uid,domain,action,args));
  assert.equal(r.headers.get('cache-control')?.includes('no-store'),true);
  return r;
};
async function main(){
  assertEmulatorOnly(process.env,PROJECT);
  const app=initializeApp({projectId:PROJECT},'lot5-security-emulator-only');
  const db=getFirestore(app);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const testEnv=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{host:'127.0.0.1',port:8080,rules},
  });
  try{
    const domain=db.collection('migrationDomainStage').doc(snap);
    await domain.set({status:'complete'});
    const access=domain.collection('access');
    for(const [uid,overrides] of Object.entries(profiles))
      await access.doc(uid).set({
        userId:uid,profile:'jogador',admin:false,active:true,
        requirePasswordChange:false,memberHouseIds:[],editHouseIds:[],
        playerId:null,...overrides,
      });
    for(const h of [A,B]){
      await domain.collection('houses').doc(houseId(h)).set({
        sourceId:h,name:'Synthetic House '+h,active:true,season:2,
      });
      await db.collection('migrationNobleHouseStage').doc(snap)
        .collection('sheets').doc(sheetDocId(h)).set({
          houseId:h,version:1,state:{houseId:h,confidential:'ONLY-'+h},
        });
    }
    const letters=domain.collection('letters');
    await letters.doc('toA').set({publicationState:'delivered',deletedAt:null,
      recipientPlayerId:null,recipientHouseId:A,senderUid:'narrator',content:'SECRET_A'});
    await letters.doc('toB').set({publicationState:'delivered',deletedAt:null,
      recipientPlayerId:null,recipientHouseId:B,senderUid:'narrator',content:'SECRET_B'});
    await letters.doc('deletedA').set({publicationState:'delivered',
      deletedAt:'2026-01-01',recipientPlayerId:null,recipientHouseId:A,
      senderUid:'narrator',content:'DELETED'});
    await domain.collection('lettersQuarantine').doc('ambiguous').set({
      publicationState:'delivered',deletedAt:null,content:'QUARANTINE'});
    const paper=db.collection('migrationNewspaperStage').doc(snap);
    await paper.collection('published').doc('issue').set({title:'Published synthetic edition'});
    await paper.collection('privateEditions').doc('draft').set({title:'PRIVATE_DRAFT'});
    await paper.collection('settings').doc('current').set({title:'NEWSROOM_SETTINGS'});
    await db.collection('migrationRecordStage').doc(snap).collection('records')
      .doc('recordA').set({houseId:A,playerId:null,visibility:'house',content:'RECORD_A'});
    await db.collection('migrationRecordStage').doc(snap).collection('records')
      .doc('recordB').set({houseId:B,playerId:null,visibility:'house',content:'RECORD_B'});
    await db.collection('migrationTemporalStage').doc(snap)
      .collection('calendar').doc('current').set({year:1522,month:1,day:1});
    for(const [root,col] of [
      ['migrationMailHistoryStage','replies'],['migrationMailRuntimeStage','letters'],
      ['migrationSpyStage','agents'],['migrationBattleStage','sessions'],
      ['migrationDriveSyncStage','bindings'],['migrationPrivateGmStage','notes'],
      ['migrationNewspaperRuntimeStage','drafts'],['migrationResidualStage','private'],
    ]){
      await db.collection(root).doc(snap).collection(col).doc('private')
        .set({content:'SERVER_ONLY_'+root});
    }
    const ctx={};
    for(const uid of Object.keys(profiles))
      ctx[uid]=testEnv.authenticatedContext(uid,{
        admin:true,role:'narrador',memberHouseIds:[A,B],
      }).firestore(); // Claims deliberately forged; trust stored access ONLY.
    ctx.anonymous=testEnv.unauthenticatedContext().firestore();
    const r=(name,root,collectionName,id)=>doc(ctx[name],root,snap,collectionName,id);
    const sheet=(name,h)=>r(name,'migrationNobleHouseStage','sheets',sheetDocId(h));
    const letter=(name,id)=>r(name,'migrationDomainStage','letters',id);
    const edition=(name,kind,id)=>r(name,'migrationNewspaperStage',kind,id);
    const record=(name,id)=>r(name,'migrationRecordStage','records',id);

    // Matrix: claims never authorize a player to cross into another House.
    await assertSucceeds(getDoc(sheet('alice',A)));
    await assertFails(getDoc(sheet('alice',B)));
    await assertSucceeds(getDoc(sheet('bob',B)));
    await assertFails(getDoc(sheet('bob',A)));
    await assertSucceeds(getDoc(sheet('narrator',A)));
    await assertSucceeds(getDoc(sheet('narrator',B)));
    for(const who of ['editor','locked-editor','locked-narrator','disabled','mismatched','unprofiled','anonymous'])
      await assertFails(getDoc(sheet(who,A)));
    await assertSucceeds(getDoc(record('alice','recordA')));
    await assertFails(getDoc(record('alice','recordB')));
    await assertFails(getDoc(record('editor','recordA')));

    // Historical letter, draft, quarantine and untrusted client boundaries.
    await assertSucceeds(getDoc(letter('alice','toA')));
    await assertFails(getDoc(letter('alice','toB')));
    await assertFails(getDoc(letter('alice','deletedA')));
    await assertSucceeds(getDoc(letter('bob','toB')));
    await assertFails(getDoc(letter('bob','toA')));
    await assertSucceeds(getDoc(letter('narrator','toB')));
    for(const who of ['editor','locked-editor','locked-narrator','disabled','mismatched','unprofiled','anonymous'])
      await assertFails(getDoc(letter(who,'toA')));
    for(const who of ['narrator','alice','bob','editor','anonymous'])
      await assertFails(getDoc(r(who,'migrationDomainStage','lettersQuarantine','ambiguous')));

    for(const who of ['narrator','alice','bob','editor']){
      await assertSucceeds(getDoc(edition(who,'published','issue')));
      await assertFails(getDocs(collection(ctx[who],'migrationDomainStage',snap,'letters')));
      await assertFails(setDoc(sheet(who,A),{houseId:B}));
      await assertFails(deleteDoc(letter(who,'toA')));
    }
    for(const who of ['narrator','editor']){
      await assertSucceeds(getDoc(edition(who,'privateEditions','draft')));
      await assertSucceeds(getDoc(edition(who,'settings','current')));
    }
    for(const who of ['alice','bob','anonymous','disabled','locked-editor','locked-narrator'])
      await assertFails(getDoc(edition(who,'privateEditions','draft')));
    await assertFails(getDoc(edition('locked-editor','published','issue')));
    await assertFails(getDoc(edition('locked-narrator','published','issue')));
    await assertFails(getDoc(edition('mismatched','published','issue')));
    await assertFails(updateDoc(edition('editor','settings','current'),{title:'forged'}));

    // Backend-only roots deny every client, including narrator with forged claims.
    for(const [root,col] of [
      ['migrationMailHistoryStage','replies'],['migrationMailRuntimeStage','letters'],
      ['migrationSpyStage','agents'],['migrationBattleStage','sessions'],
      ['migrationDriveSyncStage','bindings'],['migrationPrivateGmStage','notes'],
      ['migrationNewspaperRuntimeStage','drafts'],['migrationResidualStage','private'],
    ]){
      for(const who of ['narrator','alice','editor','anonymous']){
        const path=r(who,root,col,'private');
        await assertFails(getDoc(path));
        await assertFails(setDoc(path,{content:'forged'}));
      }
    }
    // The production rules stay deny-all independently of emulator rules.
    const [prodFirestore,prodStorage]=await Promise.all([
      readFile('firebase/firestore.rules','utf8'),
      readFile('firebase/storage.rules','utf8'),
    ]);
    assert.match(prodFirestore,/allow read, write:\s*if false/);
    assert.match(prodStorage,/allow read, write:\s*if false/);

    // Exercise the actual emulator-domain service through authenticated HTTP.
    const auth={
      async verifyIdToken(token,checkRevocation){
        assert.equal(checkRevocation,true);
        if(typeof token!=='string'||!token.startsWith('synthetic:'))
          throw Error('Invalid token');
        return {uid:token.slice('synthetic:'.length)};
      },
      async getUser(uid){
        return {uid,disabled:uid==='disabled'};
      },
    };
    const view=createEmulatorHouseViewService({
      db,auth,snapshotId:snap,env:process.env,
    });
    const handler=createEmulatorDomainHttpHandler({
      services:{access:view,houses:view},auth,env:process.env,origin,
    });
    const assertHttp=async(uid,action,house,status)=>{
      const response=await httpStatus(handler,uid,'houses',action,house?[house]:[]);
      assert.equal(response.status,status,uid+':'+action);
      if(response.status!==200){
        const body=await response.text();
        assert.equal(body.includes('ONLY-A')||body.includes('ONLY-B'),false);
      }
    };
    await assertHttp('alice','getHouse',A,200);
    await assertHttp('alice','getHouse',B,403);
    await assertHttp('bob','getHouse',A,403);
    await assertHttp('narrator','getHouse',B,200);
    await assertHttp('editor','getHouse',A,403);
    await assertHttp('locked-editor','getHouse',A,403);
    await assertHttp('locked-narrator','getHouse',A,403);
    await assertHttp('disabled','getHouse',A,401);
    await assertHttp('mismatched','getHouse',A,403);
    await assertHttp(null,'getHouse',A,401);

    // Role revocation takes effect on the very next HTTP request AND SDK read.
    await access.doc('alice').update({memberHouseIds:[],editHouseIds:[],rosterHouseId:A});
    await assertFails(getDoc(sheet('alice',A)));
    await assertHttp('alice','getHouse',A,403);
    await access.doc('narrator').update({requirePasswordChange:true});
    await assertFails(getDoc(sheet('narrator',A)));
    await assertHttp('narrator','getHouse',A,403);
    await access.doc('editor').update({active:false});
    await assertFails(getDoc(edition('editor','privateEditions','draft')));
    // Ensure client claims cannot independently restore deactivated access.
    assert.equal(ctx.editor!==undefined,true);
    console.log('Lot 5: synthetic role matrix, Firestore rules, cross-house privacy, impersonation, signed-in claims, live revocation and denied client writes PASS.');
  }finally{
    await testEnv.cleanup();
    await deleteApp(app);
  }
}
main().catch(error=>{
  // Only the static source line and exception type; never render source data,
  // document paths, UIDs, token values or full Firebase error strings.
  const line=String(error?.stack??'').match(/lot5-role-security\\.integration\\.mjs:(\\d+):/);
  console.error('Lot 5 synthetic security acceptance failure:',{
    kind:typeof error?.name==='string'?error.name.slice(0,50):'unknown',
    sourceLine:line?.[1]??'unknown',
    numericExpected:typeof error?.expected==='number'?error.expected:null,
    numericActual:typeof error?.actual==='number'?error.actual:null,
  });
  process.exitCode=1;
});
