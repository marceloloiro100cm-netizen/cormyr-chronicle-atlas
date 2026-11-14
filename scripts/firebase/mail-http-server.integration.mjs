/** Real HTTP + Auth Emulator + Firestore, synthetic users only. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {assertLocalMailEnvironment} from './mail-http-handler.mjs';

assertLocalMailEnvironment(process.env);
const snapshotId='9'.repeat(64);
const app=initializeApp({projectId:'demo-cormyr-migration'},'http-e2e');
const auth=getAuth(app),db=getFirestore(app);
let child;
let phase='seed';
try{
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  await domain.set({status:'complete'});
  await db.collection('migrationMailHistoryStage').doc(snapshotId).set({status:'complete'});
  const temporal=db.collection('migrationTemporalStage').doc(snapshotId);
  await temporal.set({status:'complete'});
  await temporal.collection('calendar').doc('current').set({
    calendarType:'harptos',lastRound:null,version:1,year:1522,month:10,day:13,tenday:2,
  });
  const tokens={};
  for(const [uid,profile,house] of [
    ['http-gm','narrador',null],['http-alice','jogador','ha'],
    ['http-bob','jogador','hb'],['http-editor','editor',null],
  ]){
    const email=uid+'@example.invalid',password='Synthetic-only-Password-42!';
    await auth.createUser({uid,email,password});
    await domain.collection('access').doc(uid).set({
      userId:uid,active:true,profile,admin:profile==='narrador',
      playerId:house?uid:null,memberHouseIds:house?[house]:[],
      editHouseIds:house?[house]:[],requirePasswordChange:false,
    });
    if(house)await domain.collection('houses').doc(createHash('sha256')
      .update('house:'+house).digest('hex')).set({sourceId:house,name:house,active:true,season:2});
    const login=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true}),
    });
    assert.equal(login.status,200);tokens[uid]=(await login.json()).idToken;
  }
  phase='server-start';
  child=spawn(process.execPath,['scripts/firebase/serve-mail-emulator.mjs'],{
    env:{...process.env,CORMYR_MAIL_SNAPSHOT:snapshotId,CORMYR_MAIL_PORT:'8789'},
    stdio:['ignore','pipe','pipe'],
  });
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Startup timeout')),15000);
    child.once('error',e=>{clearTimeout(timeout);reject(e);});
    child.once('exit',()=>{clearTimeout(timeout);reject(Error('Server exited'));});
    child.stdout.on('data',chunk=>{
      if(String(chunk).includes('Local mail API ready')){clearTimeout(timeout);resolve();}
    });
  });
  const call=async(action,uid,body={})=>{
    const r=await fetch('http://127.0.0.1:8789/api/firebase-mail/'+action,{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+(tokens[uid]||'invalid')},
      body:JSON.stringify(body),
    });
    assert.equal(r.headers.get('cache-control'),'no-store');
    return {status:r.status,...await r.json()};
  };
  phase='authenticated-http';
  assert.equal((await call('initialize','http-alice')).status,403);
  assert.equal((await call('initialize','http-gm')).status,200);
  assert.equal((await call('open-round','http-gm',{number:1})).status,200);
  const message=await call('send','http-gm',{
    requestKey:'real-http-synthetic-message',recipients:['h:ha'],
    subject:'Synthetic HTTP',content:'Private synthetic test only',campaignDate:'1522-11-13',
  });
  assert.equal(message.status,200);
  const letterId=message.data.ids[0];
  assert.equal((await call('thread','http-alice',{letterId})).status,200);
  assert.equal((await call('thread','http-bob',{letterId})).status,404);
  assert.equal((await call('read','http-alice',{letterId})).status,200);
  assert.equal((await call('list','http-editor')).status,403);
  assert.equal((await call('list','missing')).status,403);
  await domain.collection('access').doc('http-alice').update({memberHouseIds:[],editHouseIds:[]});
  assert.equal((await call('thread','http-alice',{letterId})).status,404);
  await auth.updateUser('http-gm',{disabled:true});
  assert.equal((await call('list','http-gm')).status,403);
  console.log('Mail HTTP E2E passed: real emulator login, transport, delivery, privacy, receipt and revoked access.');
}catch(error){
  console.error('Mail HTTP E2E failed at synthetic phase:',phase,error?.name);
  process.exitCode=1;
}finally{
  if(child&&child.exitCode===null){
    const exited=new Promise(resolve=>child.once('exit',resolve));
    child.kill('SIGTERM');await exited;
  }
  await deleteApp(app);
}
