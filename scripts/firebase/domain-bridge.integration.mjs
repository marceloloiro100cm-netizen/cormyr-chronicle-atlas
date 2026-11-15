/** Real Firestore Emulator, synthetic identities only. No Cloud access. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createEmulatorDomainHttpHandler} from './domain-http-handler.mjs';
import {createEmulatorHouseViewService} from './house-view-service.mjs';
import {sheetDocId} from './stage-noble-house-emulator.mjs';
import {assertEmulatorOnly} from './stage-firestore-emulator.mjs';

const PROJECT='demo-cormyr-migration';
const snapshot=createHash('sha256').update('domain-bridge-synthetic-acceptance').digest('hex');
const origin='http://127.0.0.1:8788';
const docId=house=>createHash('sha256').update('house:'+house).digest('hex');
const tok=who=>'synthetic:'+who;
const call=(who,domain,action,args=[])=>new Request(origin+'/api/domain',{
 method:'POST',
 headers:{authorization:'Bearer '+tok(who),'content-type':'application/json'},
 body:JSON.stringify({domain,action,args}),
});

async function run(){
 assertEmulatorOnly(process.env,PROJECT);
 const app=initializeApp({projectId:PROJECT},'domain-bridge-integration');
 const auth={
   async verifyIdToken(token,revoked){
     assert.equal(revoked,true);
     if(!token?.startsWith('synthetic:'))throw Error('invalid test token');
     return {uid:token.slice(10)};
   },
   async getUser(uid){return {uid,disabled:uid==='disabled'};},
 };
 try{
   const db=getFirestore(app);
   const root=db.collection('migrationDomainStage').doc(snapshot);
   const sheets=db.collection('migrationNobleHouseStage').doc(snapshot).collection('sheets');
   await root.set({status:'complete'});
   await Promise.all(['A','B'].map(async id=>{
     await root.collection('houses').doc(docId(id)).set({
       sourceId:id,name:'Synthetic House '+id,active:true,season:2,
     });
     await sheets.doc(sheetDocId(id)).set({
       houseId:id,version:1,state:{houseId:id,privateBudget:'ONLY-'+id},
     });
   }));
   const access=root.collection('access');
   const put=(uid,extra)=>access.doc(uid).set({
     userId:uid,active:true,admin:false,profile:'jogador',
     requirePasswordChange:false,memberHouseIds:[],editHouseIds:[],...extra,
   });
   await put('alice',{memberHouseIds:['A'],editHouseIds:['A'],rosterHouseId:'B'});
   await put('bob',{memberHouseIds:['B'],editHouseIds:['B'],rosterHouseId:'A'});
   await put('editor',{profile:'editor',rosterHouseId:'A'});
   await put('narrator',{profile:'narrador',admin:true});
   await put('disabled',{memberHouseIds:['A']});
   const view=createEmulatorHouseViewService({db,auth,snapshotId:snapshot,env:process.env});
   const handler=createEmulatorDomainHttpHandler({
     services:{access:view,houses:view},auth,env:process.env,origin,
   });
   const result=async(who,action,args)=>handler(call(who,'houses',action,args));
   let r=await result('alice','getHouse',['A']);
   assert.equal(r.status,200);
   assert.equal((await r.json()).result.state.privateBudget,'ONLY-A');
   r=await result('alice','getHouse',['B']);
   assert.equal(r.status,403);
   assert.equal(JSON.stringify(await r.json()).includes('ONLY-B'),false);
   r=await result('bob','getHouse',['B']);
   assert.equal(r.status,200);
   r=await result('editor','getHouse',['A']);
   assert.equal(r.status,403);
   r=await result('narrator','getHouse',['B']);
   assert.equal(r.status,200);
   r=await result('disabled','getHouse',['A']);
   assert.equal(r.status,401);
   const list=await result('alice','listHouses',[]);
   assert.deepEqual((await list.json()).result.map(x=>x.id),['A','B']);
   const scope=await handler(call('alice','access','getProfile',[]));
   assert.deepEqual((await scope.json()).result.memberHouseIds,['A']);
   // Every request re-reads current authorization; roster is not authority.
   await put('alice',{memberHouseIds:[],rosterHouseId:'A'});
   r=await result('alice','getHouse',['A']);
   assert.equal(r.status,403);
   console.log('Domain bridge: synthetic House A/B isolation, narrator, editor, disabled user and live revocation passed.');
 }finally{await deleteApp(app);}
}
run().catch(()=>{
 console.error('Domain bridge synthetic Firestore integration failed.');
 process.exitCode=1;
});
