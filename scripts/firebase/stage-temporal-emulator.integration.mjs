import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {
  initializeTestEnvironment,assertFails,assertSucceeds,
} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {planTemporalEmulator,stageTemporalEmulator} from './stage-temporal-emulator.mjs';

const HASH=createHash('sha256').update('synthetic-temporal-emulator-e2e').digest('hex');
const t=(table,cols,rows)=>({table,columns:cols,rows});
const history=[
 'public.campaign_calendar_audit','public.campaign_time_operations',
 'public.campaign_temporal_consumers','public.campaign_temporal_deliveries',
 'public.campaign_temporal_delivery_resolutions',
 'public.campaign_temporal_effect_checkpoints',
];

async function run(){
  assertEmulatorOnly(process.env,'demo-cormyr-migration');
  const tables=[t('public.campaign_calendar',['id','year','month','day','festival','auto_advance','last_round','version'],[
    {id:'t',year:'1524',month:'6',day:'30',festival:'shieldmeet',
     auto_advance:'t',last_round:'8',version:'19'},
  ])];
  for(const name of history){
    tables.push(t(name,['id','secret'],name==='public.campaign_time_operations'
      ? [{id:'op-1',secret:'private narrator history'}] : []));
  }
  const plan=planTemporalEmulator(tables,HASH);
  assert.equal(plan.summary.planValid,true);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({
    projectId:'demo-cormyr-migration',
    firestore:{host:'127.0.0.1',port:8080,rules},
  });
  const app=initializeApp({projectId:'demo-cormyr-migration'},'temporal-stage-e2e');
  try{
    const db=getFirestore(app);
    const access=db.collection('migrationDomainStage').doc(HASH).collection('access');
    await access.doc('alice').set({
      userId:'alice',profile:'jogador',active:true,admin:false,
      requirePasswordChange:false,playerId:'player-alice',memberHouseIds:['house-a'],
    });
    await access.doc('narrator').set({
      userId:'narrator',profile:'narrador',active:true,admin:true,
      requirePasswordChange:false,
    });
    await access.doc('editor').set({
      userId:'editor',profile:'editor',active:true,admin:false,
      requirePasswordChange:false,
    });
    const result=await stageTemporalEmulator(plan,db,process.env);
    assert.equal(result.staged,true);
    assert.equal(result.temporalHistoryRows,2);
    assert.equal(result.cloudWrites,0);
    const clients={
      alice:env.authenticatedContext('alice').firestore(),
      narrator:env.authenticatedContext('narrator').firestore(),
      editor:env.authenticatedContext('editor',{admin:true}).firestore(),
      unknown:env.authenticatedContext('unprofiled',{admin:true}).firestore(),
      anon:env.unauthenticatedContext().firestore(),
    };
    const current=f=>doc(f,'migrationTemporalStage',HASH,'calendar','current');
    for(const name of ['alice','narrator']){
      const value=await assertSucceeds(getDoc(current(clients[name])));
      assert.equal(value.data().dateKey,'1524-F-shieldmeet');
    }
    for(const name of ['editor','unknown','anon']){
      await assertFails(getDoc(current(clients[name])));
    }
    for(const f of Object.values(clients)){
      await assertFails(getDocs(collection(f,'migrationTemporalStage',HASH,'calendar')));
      await assertFails(setDoc(current(f),{year:2000}));
      const table=plan.archive.tableDocs[0].tableDigest;
      await assertFails(getDoc(doc(f,'migrationTemporalStage',HASH,'tables',table)));
      await assertFails(getDocs(collection(f,'migrationTemporalStage',HASH,'tables')));
    }
    await access.doc('alice').update({active:false});
    await assertFails(getDoc(current(clients.alice)));
    console.log('Temporal emulator: Harptos, read-only scope, narrator/player, editor denial and immediate revocation verified.');
  }finally{
    await env.cleanup();
    await deleteApp(app);
  }
}
run().catch(()=>{
  console.error('Temporal emulator security test failed; no private data printed.');
  process.exitCode=1;
});
