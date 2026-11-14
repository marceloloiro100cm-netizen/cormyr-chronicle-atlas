/** Real LOCAL Firestore Emulator, synthetic data only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc} from 'firebase/firestore';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';
import {buildSpyAgentsPlan,writeSpyAgentsToEmulator,ROOT} from './stage-spy-emulator.mjs';
import {ROOT as NOBLE,sheetDocId,ledgerDocId} from './stage-noble-house-emulator.mjs';
import {ROOT as TIME} from './stage-time-engine-emulator.mjs';
import {createEmulatorSpyAgentsService} from './spy-agents-service.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const tab=(table,rows)=>({table,rows,columns:rows.length?Object.keys(rows[0]):[]});
const U=n=>`00000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;

async function run(){
  const projectId='demo-cormyr-migration';
  assertEmulatorOnly(process.env,projectId);
  const snap=sha('spy-agents-synthetic-v1');
  const plan=buildSpyAgentsPlan([
    tab('public.spy_portrait_catalog',['p1','p2','p3'].map((id,i)=>({id,label:id,image_url:'https://x/'+id+'.png',sort_order:String(i),
      active:'t',created_at:'2026-01-01 00:00:00+00'}))),
    tab('public.spy_locations',[{id:'loc1',kind:'domain',ref_id:'dom1',region_id:'reg1',name:'N',approved:'t',source:'s',version:'1',visibility:'public'}]),
    tab('public.spy_assets',[{id:U(1),owner_house_id:'hB',kind:'network_cell',codename:'Alheio',source_holding_id:'hb1',source_ref:'x',
      current_location_id:'loc1',status:'available',rules_version:'',mission_successes:'0',portrait_id:'p3',version:'1',created_at:'2026-01-01 00:00:00+00'}]),
  ],snap);
  assert.equal(plan.summary.planValid,true);
  const adminApp=initializeApp({projectId},'cormyr-spy-agents-test');
  const adminDb=getFirestore(adminApp);
  const rules=await readFile('firebase/firestore.domain.rules','utf8');
  const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules}});
  try{
    await writeSpyAgentsToEmulator(plan,adminDb);
    const domain=adminDb.collection('migrationDomainStage').doc(snap);
    const acc=(uid,o)=>domain.collection('access').doc(uid).set({userId:uid,requirePasswordChange:false,active:true,...o});
    await acc('narrator',{profile:'narrador',admin:true,playerId:null,memberHouseIds:[],editHouseIds:[]});
    await acc('alice',{profile:'jogador',admin:false,playerId:'pA',memberHouseIds:['hA'],editHouseIds:['hA']});
    await acc('reader',{profile:'jogador',admin:false,playerId:'pR',memberHouseIds:['hA'],editHouseIds:[]});
    await acc('bob',{profile:'jogador',admin:false,playerId:'pB',memberHouseIds:['hB'],editHouseIds:['hB']});
    const noble=adminDb.collection(NOBLE).doc(snap);
    const hold={id:'h1',name:'Rede A',itemId:'pros-spy-network',status:'active',domainId:'dom1'};
    await noble.collection('sheets').doc(sheetDocId('hA')).set({houseId:'hA',version:5,state:{houseId:'hA',schemaVersion:1,phase:'active',
      month:3,base:{wealth:4},permanent:{wealth:0},holdings:[hold]}});
    await adminDb.collection(TIME).doc(snap).collection('calendar').doc('current').set({year:1522,month:0,day:5,festival:null,version:3});
    const auth={async verifyIdToken(t){if(!t?.startsWith('synthetic:'))throw Error('no');return {uid:t.slice(10)};}};
    const svc=createEmulatorSpyAgentsService({db:adminDb,auth,snapshotId:snap,env:process.env});
    const code=async p=>{try{await p;}catch(e){return e.code||'error';}return null;};
    const N='synthetic:narrator',A='synthetic:alice',R='synthetic:reader',B='synthetic:bob';
    const sheetDoc=async()=>(await noble.collection('sheets').doc(sheetDocId('hA')).get()).data();

    // Reading: members only; the cell list starts with 3 free vacancies.
    assert.equal(await code(svc.houseManagement('bad','hA')),'denied');
    assert.equal(await code(svc.houseManagement(B,'hA')),'denied');
    const m0=await svc.houseManagement(R,'hA');
    assert.equal(m0.agents.length,0);assert.equal(m0.recruitment[0].vacancies,3);assert.equal(m0.houseVersion,5);
    assert.deepEqual(m0.portraits.map(p=>[p.id,p.occupied]),[['p1',false],['p2',false],['p3',true]]);
    assert.equal((await svc.recruitmentOptions(R,'hA')).recruitment[0].capacity,3);

    // Creation: portrait + two paid upgrades, one transaction; retry is idempotent.
    const input={houseId:'hA',sourceHolding:'h1',codename:'  Corvo ',portraitId:'p1',upgrades:['forged_documents','ace_in_the_hole'],key:U(20)};
    assert.equal(await code(svc.createAgent(R,input)),'denied');                       // reader cannot write
    assert.equal(await code(svc.createAgent(A,{...input,portraitId:'p3'})),'conflict'); // taken by another house
    assert.equal(await code(svc.createAgent(A,{...input,portraitId:null})),'invalid');  // portrait required
    const made=await svc.createAgent(A,input);
    assert.equal(made.alreadyApplied,false);assert.equal(made.codename,'Corvo');assert.equal(made.version,3);
    let sh=await sheetDoc();
    assert.equal(sh.version,7);assert.equal(sh.state.permanent.wealth,-2);
    assert.equal((await noble.collection('ledger').doc(ledgerDocId('hA',U(20))).get()).exists,false); // creation key itself is not a purchase key
    const again=await svc.createAgent(A,input);
    assert.equal(again.alreadyApplied,true);assert.equal(again.id,made.id);
    assert.equal((await sheetDoc()).version,7);                                         // no second debit
    assert.equal(await code(svc.createAgent(A,{...input,codename:'Outro'})),'conflict');
    const m1=await svc.houseManagement(A,'hA');
    assert.equal(m1.agents[0].forgedDocuments,true);assert.equal(m1.agents[0].aceInTheHole,true);
    assert.deepEqual(m1.history.map(h=>h.eventType).sort(),['recruited','upgrade_purchased','upgrade_purchased']);
    assert.equal(m1.recruitment[0].occupied,1);

    // Recruiting fills the network (3 cells), then refuses.
    await svc.recruit(A,{houseId:'hA',sourceHolding:'h1',codename:'Dois',key:U(21)});
    await svc.recruit(A,{houseId:'hA',sourceHolding:'h1',codename:'Tres',key:U(22)});
    assert.equal(await code(svc.recruit(A,{houseId:'hA',sourceHolding:'h1',codename:'Quatro',key:U(23)})),'invalid');
    assert.equal((await svc.recruit(A,{houseId:'hA',sourceHolding:'h1',codename:'Dois',key:U(21)})).codename,'Dois'); // retry
    assert.equal(await code(svc.recruit(B,{houseId:'hA',sourceHolding:'h1',codename:'Intruso',key:U(24)})),'denied');

    // Purchase: versions, double purchase and Wealth.
    const list=(await svc.houseManagement(A,'hA')).agents;
    const two=list.find(a=>a.codename==='Dois');
    assert.equal(await code(svc.buyUpgrade(A,{houseId:'hA',agentId:two.id,code:'forged_documents',expectedAgentVersion:1,
      expectedHouseVersion:5,key:U(30)})),'conflict');                                  // stale house version
    sh=await sheetDoc();
    const bought=await svc.buyUpgrade(A,{houseId:'hA',agentId:two.id,code:'forged_documents',expectedAgentVersion:1,
      expectedHouseVersion:sh.version,key:U(30)});
    assert.equal(bought.alreadyApplied,false);assert.equal(bought.remainingWealthEstimate,1);
    assert.equal((await svc.buyUpgrade(A,{houseId:'hA',agentId:two.id,code:'forged_documents',expectedAgentVersion:1,
      expectedHouseVersion:sh.version,key:U(30)})).alreadyApplied,true);
    assert.equal(await code(svc.buyUpgrade(A,{houseId:'hA',agentId:two.id,code:'forged_documents',expectedAgentVersion:2,
      expectedHouseVersion:sh.version+1,key:U(31)})),'invalid');                        // already owned

    // Portrait: unique across the campaign, cannot steal another house's.
    const three=list.find(a=>a.codename==='Tres');
    assert.equal(await code(svc.assignPortrait(A,{houseId:'hA',agentId:three.id,portraitId:'p1',expectedVersion:three.version})),'conflict');
    assert.equal((await svc.assignPortrait(A,{houseId:'hA',agentId:three.id,portraitId:'p2',expectedVersion:three.version})).version,three.version+1);

    // Removal: refund only paid upgrades, free cell and portrait, once.
    sh=await sheetDoc();
    const wealthBefore=sh.state.permanent.wealth;
    const corvo=(await svc.houseManagement(A,'hA')).agents.find(a=>a.codename==='Corvo');
    const rm={houseId:'hA',agentId:corvo.id,expectedAgentVersion:corvo.version,expectedHouseVersion:sh.version,key:U(40)};
    assert.equal(await code(svc.removeAgent(R,rm)),'denied');
    const gone=await svc.removeAgent(A,rm);
    assert.equal(gone.refundedWealth,2);assert.equal(gone.portraitReleased,true);
    assert.equal((await sheetDoc()).state.permanent.wealth,wealthBefore+2);
    assert.equal((await svc.removeAgent(A,rm)).alreadyApplied,true);
    assert.equal((await sheetDoc()).state.permanent.wealth,wealthBefore+2);             // no second refund
    assert.equal(await code(svc.removeAgent(A,{...rm,key:U(41)})),'conflict');
    const m2=await svc.houseManagement(A,'hA');
    assert.equal(m2.agents.find(a=>a.codename==='Corvo').status,'retired');
    assert.equal(m2.recruitment[0].occupied,2);
    assert.equal(m2.portraits.find(p=>p.id==='p1').occupied,false);
    assert.ok(m2.history.some(h=>h.eventType==='retired'));
    assert.equal((await svc.recruit(A,{houseId:'hA',sourceHolding:'h1',codename:'Novo',key:U(42)})).codename,'Novo');

    for(const db of [env.authenticatedContext('narrator').firestore(),env.authenticatedContext('alice').firestore(),
        env.unauthenticatedContext().firestore()]){
      await assertFails(getDocs(collection(db,ROOT,snap,'assets')));
      await assertFails(getDoc(doc(db,ROOT,snap,'history','x')));
      await assertFails(setDoc(doc(db,ROOT,snap,'assets','x'),{ownerHouseId:'hA'}));
    }
    console.log('Spy agents emulator: recruitment, creation, upgrades, portrait uniqueness, refundable removal and server-only rules verified.');
  }finally{await env.cleanup();await deleteApp(adminApp);}
}
run().catch(e=>{console.error('Spy agents integration failed:',e?.message||'error');process.exitCode=1;});
