/** Real LOCAL Firestore Emulator, synthetic data only. The rules engine is a deterministic fake. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildBattlePlan,writeBattleToEmulator,ROOT} from './stage-battle-emulator.mjs';
import {createEmulatorBattleService} from './battle-service.mjs';
import {battleHash} from './battle-core.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;

// Deterministic fake of the TypeScript engine.
const base=()=>({rulesVersion:'PTE-2.0',phase:'ready',n:0,activeUnitId:'u1',stacks:[{id:'u1',side:'attacker',source:{kind:'fictional'}}],controls:{attacker:'human'}});
const applyCommand=s=>({...s,phase:'active',n:s.n+1});
const verifyReplay=file=>{
  let s=file.initial;
  if(battleHash(s)!==file.initialStateHash)throw Error('bad initial');
  for(const c of file.commands){s=applyCommand(s);if(battleHash(s)!==c.stateHash)throw Error('bad chain');}
  if(battleHash(s)!==file.finalStateHash)throw Error('bad final');
  return s;
};
const liveGame=()=>({battle:{phase:'active',activeUnitId:'u1',stacks:[{id:'u1',side:'attacker',source:{kind:'fictional'}}]},setup:{opponent:'human'},steps:[]});
const engine={verifyReplay,applyCommand,replayLive:f=>f.game,applyLiveStep:(g,step)=>({...g,steps:[...g.steps,step]}),
  captureLive:g=>({finalHash:battleHash(g),game:g})};

function chain(len){
  let s=base();const ih=battleHash(s),receipts=[];let prev=ih;
  for(let i=1;i<=len;i++){s=applyCommand(s);const h=battleHash(s);
    receipts.push({actionSeq:i,commandId:'cmd-'+i,prevHash:prev,stateHash:h,command:{type:'MOVE',i}});prev=h;}
  return {initial:base(),current:s,initialHash:ih,currentHash:prev,receipts};
}

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('battle-synthetic-v1');
  const plan=buildBattlePlan([
    tab('public.battle_dnd_cormyr_monsters',[{id:'orc',name:'Orc',group_name:'Humanoides',source:'S',challenge_rating:'0.500',hp:'15',ac:'13',
      size:'M',speed_ft:'30',melee:'',ranged:'',catalog_version:'1'}]),
    tab('public.battle_dnd_verified_sources',[{monster_id:'orc',combat_defaults:'{"x":1}',source_filename:'orc.pdf',verified_at:'2026-01-01 00:00:00+00'}]),
    tab('public.battle_house_roster_imports',[
      {source_key:'k2',house_id:'hA',unit_name:'B',catalog_id:'c',unit_type:'t',training:'trained',quantity:'3',standard_unit_strength:'12',
        unit_strength_basis:'',source_status:'ok',source_region:'r',source_domain:'',source_row:'2',source_file_id:'f',source_url:'',source_note:'',
        simulation_only:'t',imported_at:'2026-01-01 00:00:00+00'},
      {source_key:'k1',house_id:'hA',unit_name:'A',catalog_id:'c',unit_type:'t',training:'green',quantity:'2',standard_unit_strength:'10',
        unit_strength_basis:'',source_status:'ok',source_region:'r',source_domain:'',source_row:'1',source_file_id:'f',source_url:'',source_note:'',
        simulation_only:'t',imported_at:'2026-01-01 00:00:00+00'}]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-battle-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeBattleToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('viewer',{profile:'jogador',admin:false,playerId:'pV',memberHouseIds:['hA'],editHouseIds:[]});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hT'],editHouseIds:['hT']});
    const house=(id,active,season)=>domain.collection('houses').doc(sha('house:'+id)).set({sourceId:id,name:id,season,active});
    await house('hA',true,2);await house('hB',true,2);await house('hT',true,2);await house('hOld',true,1);await house('hOff',false,2);
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorBattleService({db:adminDb,auth,snapshotId:snap,engine,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice',V='synthetic:viewer',B='synthetic:bob';
    assert.equal(await code(svc.listSaved('bad')),'denied');

    // --- saved sessions ---
    const ch=chain(2);
    assert.equal(await code(svc.commitReplay(A,{name:'x',...ch})),'denied');
    const {id,stateVersion}=await svc.commitReplay(N,{name:'Sessão',...ch});
    assert.equal(stateVersion,2);
    assert.equal((await svc.listSaved(N)).length,1);
    assert.equal(await code(svc.listSaved(A)),'denied');
    const read=await svc.readSaved(N,id);
    assert.equal(read.replay.commands.length,2);
    assert.equal(await code(svc.readSaved(A,id)),'denied');

    const cmd='11111111-1111-4111-8111-111111111111',cmd2='22222222-2222-4222-8222-222222222222';
    const r1=await svc.applySavedCommand(N,{sessionId:id,commandId:cmd,expectedVersion:2,command:{type:'MOVE',x:1}});
    assert.equal(r1.stateVersion,3);assert.equal(r1.duplicate,false);
    const again=await svc.applySavedCommand(N,{sessionId:id,commandId:cmd,expectedVersion:2,command:{type:'MOVE',x:1}});
    assert.equal(again.duplicate,true);assert.equal(again.receipt.actionSeq,3);
    assert.equal(await code(svc.applySavedCommand(N,{sessionId:id,commandId:cmd,expectedVersion:2,command:{type:'MOVE',x:2}})),'conflict');
    assert.equal(await code(svc.applySavedCommand(N,{sessionId:id,commandId:cmd2,expectedVersion:2,command:{type:'MOVE'}})),'conflict');
    assert.equal(await code(svc.applySavedCommand(A,{sessionId:id,commandId:cmd2,expectedVersion:3,command:{type:'MOVE'}})),'denied');
    assert.equal((await svc.readSaved(N,id)).replay.commands.length,3);
    // Two racing writers on the same version: exactly one wins.
    const race=await Promise.all([
      code(svc.applySavedCommand(N,{sessionId:id,commandId:cmd2,expectedVersion:3,command:{type:'MOVE',r:1}})),
      code(svc.applySavedCommand(N,{sessionId:id,commandId:'33333333-3333-4333-8333-333333333333',expectedVersion:3,command:{type:'MOVE',r:2}}))]);
    assert.equal(race.filter(x=>x===null).length,1);assert.equal(race.filter(x=>x==='conflict').length,1);
    assert.equal((await svc.readSaved(N,id)).stateVersion,4);
    // Corrupting the stored current state is detected on read.
    await adminDb.collection(ROOT).doc(snap).collection('states').doc('current:'+id)
      .set({sessionId:id,kind:'current',json:JSON.stringify({...base(),n:99})});
    assert.equal(await code(svc.readSaved(N,id)),'invalid');

    // --- live V3 matches ---
    const game=liveGame(),replay={finalHash:battleHash(game),game};
    const mk=(o={})=>svc.liveCreate(N,{title:'Partida 1',attackerHouseId:'hA',defenderHouseId:'hB',replay,...o});
    assert.equal(await code(svc.liveCreate(A,{title:'Partida 1',attackerHouseId:'hA',defenderHouseId:'hB',replay})),'denied');
    assert.equal(await code(mk({defenderHouseId:'hA'})),'invalid');
    assert.equal(await code(mk({defenderHouseId:'hOff'})),'invalid');
    assert.equal(await code(mk({defenderHouseId:'hOld'})),'invalid');
    const live=await mk();
    assert.equal((await svc.liveList(A)).length,1);
    assert.equal((await svc.liveList(B)).length,0);
    assert.equal((await svc.liveGet(A,live.id)).canPlay,true);
    assert.equal((await svc.liveGet(V,live.id)).canPlay,false);
    assert.equal(await code(svc.liveGet(B,live.id)),'not_found');
    const step={type:'COMMAND',actor:'narrator',command:{type:'MOVE'}};
    assert.equal(await code(svc.livePlay(V,{matchId:live.id,expectedVersion:0,step})),'denied');
    assert.equal(await code(svc.livePlay(A,{matchId:live.id,expectedVersion:0,step:{type:'AI'}})),'denied');
    assert.equal(await code(svc.livePlay(A,{matchId:live.id,expectedVersion:3,step})),'conflict');
    assert.equal((await svc.livePlay(A,{matchId:live.id,expectedVersion:0,step})).version,1);
    assert.equal(await code(svc.livePlay(A,{matchId:live.id,expectedVersion:0,step})),'conflict');
    assert.equal((await svc.liveGet(A,live.id)).version,1);
    const lr=await Promise.all([code(svc.livePlay(A,{matchId:live.id,expectedVersion:1,step})),code(svc.livePlay(N,{matchId:live.id,expectedVersion:1,step}))]);
    assert.equal(lr.filter(x=>x===null).length,1);assert.equal(lr.filter(x=>x==='conflict').length,1);

    // --- invitations ---
    const inv={title:'Convocação',houseId:'hA',scenario:'plain-open',attackerHouseId:'ashkar-model',defenderHouseId:'evenhand-model',
      attackerCommander:'ranger',defenderCommander:'knight'};
    assert.equal(await code(svc.inviteCreate(A,inv)),'denied');
    assert.equal(await code(svc.inviteCreate(N,{...inv,houseId:'hOld'})),'invalid');
    assert.equal(await code(svc.inviteCreate(N,{...inv,scenario:'x'})),'invalid');
    const i1=await svc.inviteCreate(N,inv);
    assert.equal((await svc.inviteList(A)).length,1);assert.equal((await svc.inviteList(B)).length,0);
    assert.equal(await code(svc.inviteClose(A,i1.id)),'denied');
    assert.equal(await code(svc.inviteClose(N,'ghost')),'not_found');
    await svc.inviteClose(N,i1.id);
    assert.equal((await svc.inviteList(A)).length,0);

    // --- D&D, narrator only ---
    assert.equal((await svc.dndCatalog(N)).length,1);
    assert.equal(await code(svc.dndCatalog(A)),'denied');
    assert.equal((await svc.dndVerified(N))[0].combat_defaults.x,1);
    assert.equal(await code(svc.dndVerified(A)),'denied');
    assert.equal(await code(svc.dndSaveOverride(N,{monsterId:'ghost',patch:{}})),'invalid');
    await svc.dndSaveOverride(N,{monsterId:'orc',patch:{hp:20}});
    assert.equal((await svc.dndOverrides(N))[0].combat_patch.hp,20);
    assert.equal(await code(svc.dndOverrides(A)),'denied');
    await svc.dndResetOverride(N,'orc');
    assert.equal((await svc.dndOverrides(N)).length,0);
    assert.equal(await code(svc.dndSaveCustom(N,{payload:{id:'goblin'}})),'invalid');
    await svc.dndSaveCustom(N,{payload:{id:'custom-a',hp:3}});
    assert.equal((await svc.dndCustom(N))[0].payload.hp,3);
    assert.equal(await code(svc.dndSaveCustom(A,{payload:{id:'custom-b'}})),'denied');
    await svc.dndDeleteCustom(N,'custom-a');
    assert.equal((await svc.dndCustom(N)).length,0);
    await svc.dndSave(N,{battleId:'dnd-training-1',replay:'{"a":1}',report:{x:1}});
    assert.equal((await svc.dndList(N)).length,1);
    assert.equal((await svc.dndLoad(N,'dnd-training-1')).replay,'{"a":1}');
    assert.equal(await code(svc.dndLoad(N,'dnd-training-2')),'not_found');
    assert.equal(await code(svc.dndSave(A,{battleId:'dnd-training-1',replay:'x'})),'denied');
    assert.deepEqual((await svc.rosterFor(N,'hA')).map(r=>r.source_key),['k1','k2']);
    assert.equal(await code(svc.rosterFor(A,'hA')),'denied');

    // --- rules: every battle collection is server-only ---
    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      for(const c of ['sessions','states','events','live','liveReplays','invitations','dndSessions','overrides','custom','monsters','roster','verified']){
        await assertFails(getDocs(collection(db,ROOT,snap,c)));
        await assertFails(setDoc(doc(db,ROOT,snap,c,'x'),{houseId:'hA'}));
      }
      await assertFails(getDoc(doc(db,ROOT,snap,'live',live.id)));
    }
    console.log('Battle emulator: saved sessions, CAS races, idempotency, live matches, invitations, narrator-only D&D and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Battle integration failed:',e?.message||'error');process.exitCode=1;});
