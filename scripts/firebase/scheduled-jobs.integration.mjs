/** Real LOCAL Firestore Emulator, synthetic data only: scheduled jobs run through the real services. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {ROOT as TIME} from './stage-time-engine-emulator.mjs';
import {createEmulatorJobs,createJobsHandler} from './scheduled-jobs-handler.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('scheduled-jobs-synthetic-v1');
  const app=initializeApp({projectId},'cormyr-jobs-test');
  const db=getFirestore(app);
  try{
    const domain=db.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await db.collection(TIME).doc(snap).collection('calendar').doc('current').set({year:1522,month:0,day:5,festival:null,version:3});
    const call=async(handler,path)=>handler(new Request('http://x'+path,{method:'POST',headers:{authorization:'Bearer s3cret'}}));

    const okJobs=createEmulatorJobs({db,snapshotId:snap,actorUid:'narrator',env:process.env});
    const ok=createJobsHandler({jobs:okJobs,secret:'s3cret'});
    const res=await call(ok,'/api/firebase-jobs/all');
    assert.equal(res.status,200,await res.clone().text());
    const body=await res.json();
    assert.equal(body.results['publish-due'].count,0);
    assert.equal(body.results['advance-missions'].count,0);
    // Idempotent: a second run changes nothing and still succeeds.
    assert.equal((await call(ok,'/api/firebase-jobs/all')).status,200);

    // A configured actor that is not an active Narrator fails closed.
    const badJobs=createEmulatorJobs({db,snapshotId:snap,actorUid:'alice',env:process.env});
    const bad=createJobsHandler({jobs:badJobs,secret:'s3cret'});
    const r2=await call(bad,'/api/firebase-jobs/advance-missions');
    assert.equal(r2.status,500);
    assert.deepEqual((await r2.json()).results,{'advance-missions':{status:'error'}});
    const unknown=createEmulatorJobs({db,snapshotId:snap,actorUid:'ghost',env:process.env});
    assert.equal((await call(createJobsHandler({jobs:unknown,secret:'s3cret'}),'/api/firebase-jobs/advance-missions')).status,500);
    console.log('Scheduled jobs emulator: authenticated runs, idempotency and fail-closed actor verified.');
  }finally{await deleteApp(app);}
}
run().catch(e=>{console.error('Scheduled jobs integration failed:',e?.message||'error');process.exitCode=1;});
