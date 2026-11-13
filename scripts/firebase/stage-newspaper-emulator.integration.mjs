import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {getDoc,getDocs,setDoc,doc,collection} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {planNewspaperEmulator,stageNewspaperEmulator} from './stage-newspaper-emulator.mjs';
import {syntheticNewspaperSource} from './newspaper-fixtures.mjs';

const HASH=createHash('sha256').update('synthetic-newspaper-rules').digest('hex');
const PROJECT='demo-cormyr-migration';

async function run(){
  assertEmulatorOnly(process.env,PROJECT);
  const source=syntheticNewspaperSource();
  const plan=planNewspaperEmulator(source,HASH);
  assert.equal(plan.summary.planValid,true);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{host:'127.0.0.1',port:8080,rules},
  });
  const app=initializeApp({projectId:PROJECT},'newspaper-emulator-e2e');
  try {
    const db=getFirestore(app);
    const access=db.collection('migrationDomainStage').doc(HASH).collection('access');
    const entries=[
      ['narrator',{profile:'narrador',active:true,admin:true}],
      ['editor',{profile:'editor',active:true,admin:false}],
      ['alice',{profile:'jogador',active:true,admin:false,requirePasswordChange:false}],
      ['bob',{profile:'jogador',active:true,admin:false,requirePasswordChange:false}],
      ['inactive',{profile:'jogador',active:false,admin:false,requirePasswordChange:false}],
    ];
    for(const [id,props] of entries)await access.doc(id).set({userId:id,...props});
    const out=await stageNewspaperEmulator(plan,db,process.env);
    assert.equal(out.staged,true);
    assert.equal(out.publishedEditions,2);
    assert.equal(out.privateEditions,2);
    assert.equal(out.archivedSourceRows,5);
    assert.equal(out.firebaseCloudWrites,0);
    const actors={
      narrator:env.authenticatedContext('narrator').firestore(),
      editor:env.authenticatedContext('editor',{admin:true}).firestore(),
      alice:env.authenticatedContext('alice').firestore(),
      bob:env.authenticatedContext('bob').firestore(),
      inactive:env.authenticatedContext('inactive').firestore(),
      unknown:env.authenticatedContext('unknown',{admin:true}).firestore(),
      anon:env.unauthenticatedContext().firestore(),
    };
    const url=(db,kind,id)=>doc(db,'migrationNewspaperStage',HASH,kind,id);
    const coll=(db,kind)=>collection(db,'migrationNewspaperStage',HASH,kind);
    const pub=plan.published[0].id;
    const draft=plan.privateEditions.find(x=>x.payload.state==='draft').id;
    const archive=plan.archive.tableDocs[0].tableDigest;
    for(const who of ['narrator','editor','alice','bob']){
      await assertSucceeds(getDoc(url(actors[who],'published',pub)));
      await assertSucceeds(getDocs(coll(actors[who],'published')));
    }
    for(const who of ['inactive','unknown','anon']){
      await assertFails(getDoc(url(actors[who],'published',pub)));
      await assertFails(getDocs(coll(actors[who],'published')));
    }
    for(const who of ['narrator','editor']){
      await assertSucceeds(getDoc(url(actors[who],'privateEditions',draft)));
      await assertSucceeds(getDocs(coll(actors[who],'privateEditions')));
      await assertSucceeds(getDoc(url(actors[who],'settings','current')));
    }
    for(const who of ['alice','bob','inactive','unknown','anon']){
      await assertFails(getDoc(url(actors[who],'privateEditions',draft)));
      await assertFails(getDocs(coll(actors[who],'privateEditions')));
      await assertFails(getDoc(url(actors[who],'settings','current')));
    }
    for(const db of Object.values(actors)){
      await assertFails(getDoc(url(db,'archive',archive)));
      await assertFails(getDocs(coll(db,'archive')));
      await assertFails(getDocs(coll(db,'settings')));
      await assertFails(setDoc(url(db,'published',pub),{state:'draft'}));
      await assertFails(setDoc(url(db,'privateEditions',draft),{state:'published'}));
      await assertFails(setDoc(url(db,'settings','current'),{title:'bad'}));
    }
    await access.doc('editor').update({active:false});
    await assertFails(getDoc(url(actors.editor,'privateEditions',draft)));
    await assertFails(getDoc(url(actors.editor,'published',pub)));
    console.log('Newspaper emulator: role isolation, published/draft separation, private archive denial, writes and revocation verified.');
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}

run().catch(()=>{
  console.error('Private newspaper rules test failed; no content or identity printed.');
  process.exitCode=1;
});
