/** Real LOCAL Firestore Emulator, synthetic data and an in-memory Drive only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT,fileDocId} from './stage-drive-emulator.mjs';
import {ROOT as RECORDS} from './stage-records-emulator.mjs';
import {createEmulatorDriveService} from './drive-service.mjs';
import {filename,recordEnvelope} from './drive-core.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const R1='11111111-1111-4111-8111-111111111111',RGM='22222222-2222-4222-8222-222222222222',
  RX='33333333-3333-4333-8333-333333333333',B1='44444444-4444-4444-8444-444444444444',
  B2='55555555-5555-4555-8555-555555555555',F1='66666666-6666-4666-8666-666666666666';

/** In-memory Drive with real ETag semantics (If-Match on writes). */
function memoryDrive(){
  const files=new Map();let n=0;
  const api={files,
    put(folder,name,envelope){const id='file'+(++n);files.set(id,{id,name,parents:[folder],envelope,etag:'e'+n});return id;},
    edit(id,envelope){const f=files.get(id);f.envelope=envelope;f.etag='e'+(++n);},
    async list(folder){return [...files.values()].filter(f=>f.parents.includes(folder)).map(({id,name,parents})=>({id,name,parents,size:'100'}));},
    async read(id){const f=files.get(id);if(!f)throw Error('missing');return {envelope:structuredClone(f.envelope),etag:f.etag};},
    async write(folder,e,file,etag){
      if(file){const f=files.get(file);if(f.etag!==etag)throw Error('etag mismatch');f.envelope=structuredClone(e);f.etag='e'+(++n);
        return {id:file,envelope:structuredClone(e),etag:f.etag};}
      const id=api.put(folder,filename(e),structuredClone(e));return {id,envelope:structuredClone(e),etag:files.get(id).etag};},
  };
  return api;
}

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('drive-synthetic-v1');
  const adminApp=initializeApp({projectId},'cormyr-drive-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    const stage=adminDb.collection(ROOT).doc(snap);
    const access=adminDb.collection('migrationDomainStage').doc(snap).collection('access');
    const acc=(uid,o)=>access.doc(uid).set({userId:uid,requirePasswordChange:false,...o});
    await acc('adm',{active:true,profile:'narrador',admin:true});
    await acc('alice',{active:true,profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['h1'],editHouseIds:['h1']});
    const binding=(id,o)=>stage.collection('bindings').doc(id).set({id,folderId:'FOLDER-'+id,technicalFolderId:'TECH-'+id,
      scope:'house',houseId:'h1',playerId:null,ownerUserId:'adm',confirmedBy:'adm',privacyReviewed:true,runtimeAuthorized:true,
      enabled:true,lastCheckedAt:null,lastError:null,leaseToken:null,leaseUntil:null,...o});
    await binding(B1,{});
    await binding(B2,{houseId:'h2',runtimeAuthorized:false}); // never selected
    const T0='2026-01-01T00:00:00.000Z';
    const rec=(id,o)=>adminDb.collection(RECORDS).doc(snap).collection('records').doc(id).set({id,houseId:'h1',playerId:null,
      visibility:'house',kind:'document',title:'Título',content:'base',version:1,createdBy:'x',updatedBy:'x',createdAt:T0,
      updatedAt:T0,syncState:'synced',lastSyncedAt:T0,sourceFileId:null,sourceModifiedAt:null,...o});
    await rec(R1,{});
    await rec(RGM,{visibility:'gm',houseId:null,syncState:'pending'});
    const getRec=async id=>(await adminDb.collection(RECORDS).doc(snap).collection('records').doc(id).get()).data();
    const b1=(await stage.collection('bindings').doc(B1).get()).data();
    const env1=recordEnvelope(await getRec(R1),b1);
    const drive=memoryDrive();
    const f1=drive.put('TECH-'+B1,filename(env1),structuredClone(env1)); // legacy canonical-named file, in sync
    await stage.collection('files').doc(fileDocId(B1,'record',R1)).set({id:F1,bindingId:B1,entityType:'record',entityId:R1,
      fileId:f1,etag:drive.files.get(f1).etag,baseSnapshot:env1,remoteHash:'h',lastSyncedAt:T0});
    // Foreign-house envelope in this folder must be ignored.
    drive.put('TECH-'+B1,filename({...env1,id:RX}),{...env1,id:RX,mutationId:RX,houseId:'h2'});

    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    let tick=0;
    const svc=createEmulatorDriveService({db:adminDb,auth,snapshotId:snap,adapter:drive,env:process.env,
      now:()=>new Date(Date.parse('2026-06-01T00:00:00.000Z')+(++tick)*1000)});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:adm',A='synthetic:alice';

    // Nothing to do while everything is in sync; unauthorized binding and gm record stay out.
    let r=await svc.runSync();
    assert.equal(r.failed,0);
    assert.equal(drive.files.size,2);
    assert.equal((await getRec(RGM)).syncState,'pending');

    // Drive edit of the mapped file => automatic import of the next version.
    drive.edit(f1,{...env1,version:2,baseVersion:1,content:'DRIVE',updatedAt:'2026-02-01T00:00:00+00:00',origin:'drive'});
    r=await svc.runSync();
    assert.equal(r.failed,0);
    let cur=await getRec(R1);
    assert.equal(cur.version,2);assert.equal(cur.content,'DRIVE');assert.equal(cur.updatedBy,'adm');
    assert.equal(cur.syncState,'pending');
    // Version history is kept like the SQL audit trigger.
    assert.equal((await adminDb.collection(RECORDS).doc(snap).collection('versions').get()).size,1);
    // Next run confirms the copy and settles the record.
    r=await svc.runSync();
    cur=await getRec(R1);
    assert.equal(cur.syncState,'synced');
    assert.equal((await stage.collection('outbox').where('state','==','synced').get()).size>=1,true);

    // Site and Drive both change: conflict, never silently overwritten.
    await adminDb.collection(RECORDS).doc(snap).collection('records').doc(R1)
      .update({version:3,content:'SITE',updatedAt:'2026-03-01T00:00:00.000Z',syncState:'pending'});
    const e2=(await drive.read(f1)).envelope;
    drive.edit(f1,{...e2,version:3,baseVersion:2,content:'OTHER',updatedAt:'2026-03-02T00:00:00+00:00'});
    r=await svc.runSync();
    assert.equal(r.review>=1,true);
    assert.equal((await getRec(R1)).syncState,'conflict');
    const pending=await svc.listInbox(N);
    assert.equal(pending.length,1);
    assert.equal(pending[0].state,'conflict');
    assert.equal((await getRec(R1)).content,'SITE'); // untouched

    // Only the administrator resolves; merged content is applied and requeued.
    assert.equal(await code(svc.resolveImport(A,pending[0].id,'folder')),'denied');
    assert.equal(await code(svc.listInbox(A)),'denied');
    assert.equal(await code(svc.resolveImport(N,pending[0].id,'merge')),'invalid'); // merge needs content
    await svc.resolveImport(N,pending[0].id,'merge','MERGED');
    cur=await getRec(R1);
    assert.equal(cur.version,4);assert.equal(cur.content,'MERGED');assert.equal(cur.syncState,'pending');
    assert.equal(await code(svc.resolveImport(N,pending[0].id,'folder')),'conflict'); // already closed
    assert.equal((await svc.listInbox(N)).length,0);

    // The merged version is exported with the real If-Match ETag and the record settles.
    r=await svc.runSync();
    assert.equal(r.failed,0);
    assert.equal((await drive.read(f1)).envelope.content,'MERGED');
    assert.equal((await getRec(R1)).syncState,'synced');

    // Leases are exclusive and expire.
    assert.equal(await svc.claimBinding({id:B1,token:'t1'}),true);
    assert.equal(await svc.claimBinding({id:B1,token:'t2'}),false);
    await svc.releaseBinding({id:B1,token:'t1'});
    assert.equal(await svc.claimBinding({id:B1,token:'t3'}),true);
    await svc.releaseBinding({id:B1,token:'t3'});
    assert.equal(await svc.claimBinding({id:B2,token:'t4'}),false); // runtime not authorized

    // apply_drive_record refuses a file id that is not the mapped one, and stale versions.
    const cur4=await getRec(R1);
    const next={...(await drive.read(f1)).envelope,version:5,baseVersion:4,content:'X'};
    assert.equal(await svc.applyDriveRecord({bindingId:B1,fileId:'other',doc:next,siteVersion:4}),false);
    assert.equal(await svc.applyDriveRecord({bindingId:B1,fileId:f1,doc:next,siteVersion:3}),false);
    assert.equal((await getRec(R1)).version,cur4.version);

    // A demoted confirming administrator stops the binding without importing anything.
    await acc('adm',{active:true,profile:'jogador',admin:false,playerId:'pAdm',memberHouseIds:[],editHouseIds:[]});
    drive.edit(f1,{...(await drive.read(f1)).envelope,version:5,baseVersion:4,content:'LATE'});
    r=await svc.runSync();
    assert.equal(r.failed,1);
    assert.equal((await getRec(R1)).content,'MERGED');
    assert.match((await stage.collection('bindings').doc(B1).get()).data().lastError,/não está mais autorizado/);
    assert.equal((await stage.collection('bindings').doc(B1).get()).data().leaseToken,null);

    for(const db of [env.authenticatedContext('adm').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      await assertFails(getDocs(collection(db,ROOT,snap,'bindings')));
      await assertFails(getDoc(doc(db,ROOT,snap,'inbox','x')));
      await assertFails(setDoc(doc(db,ROOT,snap,'files','x'),{fileId:'forjado'}));
    }
    console.log('Drive emulator: leases, ETag-safe export, auto-import, conflict review, admin-only resolution and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Drive integration failed:',e?.message||'error');process.exitCode=1;});
