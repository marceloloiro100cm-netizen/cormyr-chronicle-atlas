import test from 'node:test';
import assert from 'node:assert/strict';
import {
 isolatedDestination,preflightEmptyDestination,inspectFirebaseAdminDestination,
} from './lot7-cloud-destination-preflight.mjs';

test('only explicit isolated Cormyr projects are inspectable',()=>{
 for(const p of ['cormyr','demo-cormyr-migration','cormyr-preview','cormyr-homolog-','project-other',
   'cormyr-homolog-foo/../../cormyr','cormyr-homolog-a']) {
   assert.equal(isolatedDestination(p),false,p);
 }
 assert.equal(isolatedDestination('cormyr-homolog-sandbox1'),true);
 assert.equal(isolatedDestination('cormyr-migration-test123'),true);
});

test('empty destination is a preparation result, not permission to migrate',async()=>{
 const report=await preflightEmptyDestination({
   projectId:'cormyr-homolog-test123',
   readAuthCount:async()=>0,
   readCollectionCount:async()=>0,
 });
 assert.equal(report.destinationEmpty,true);
 assert.equal(report.canPrepareDryRun,true);
 assert.equal(report.productionImportAuthorized,false);
 assert.equal(report.readyForCutover,false);
 assert.equal(report.cloudWrites,0);
 assert.equal(report.sourceLiveReconciled,false);
});

test('occupied identity or document space blocks staging and imports',async()=>{
 for(const [users,collections] of [[1,0],[0,1],[1,1]]) {
   const report=await preflightEmptyDestination({
     projectId:'cormyr-homolog-test123',readAuthCount:async()=>users,
     readCollectionCount:async()=>collections,
   });
   assert.equal(report.destinationEmpty,false);
   assert.equal(report.canPrepareDryRun,false);
   assert.ok(report.blockers.includes('destination_not_empty'));
 }
});

test('non-isolated target is rejected before readers are invoked',async()=>{
 let calls=0;
 await assert.rejects(preflightEmptyDestination({
   projectId:'cormyr',
   readAuthCount:async()=>{calls++;return 0;},
   readCollectionCount:async()=>{calls++;return 0;},
 }),/isolated_homologation/);
 assert.equal(calls,0);
});

test('read-only Firebase Admin probe does not list IDs or private rows',async()=>{
 const calls=[];const app={name:'test'};
 const loadAdmin=async()=>({
   initializeApp:()=>{calls.push('initialize');return app;},
   deleteApp:async a=>{assert.equal(a,app);calls.push('delete');},
   getAuth:a=>{assert.equal(a,app);return{listUsers:async limit=>{
     assert.equal(limit,1);calls.push('listUsers');return {users:[{uid:'secret-uid',email:'secret@example.com'}]};
   }};},
   getFirestore:a=>{assert.equal(a,app);return{listCollections:async()=>{
     calls.push('listCollections');return[{id:'private-records'}];
   }};},
 });
 const result=await inspectFirebaseAdminDestination('cormyr-migration-stage01',loadAdmin);
 assert.deepEqual(calls.sort(),['initialize','delete','listUsers','listCollections'].sort());
 assert.equal(result.destinationEmpty,false);
 assert.ok(!JSON.stringify(result).includes('secret'));
 assert.ok(!JSON.stringify(result).includes('private-records'));
});

test('admin application is cleaned up when a read fails',async()=>{
 let deleted=false;
 await assert.rejects(inspectFirebaseAdminDestination('cormyr-homolog-test123',async()=>({
   initializeApp:()=>({}),
   deleteApp:async()=>{deleted=true;},
   getAuth:()=>({listUsers:async()=>{throw Error('access denied');}}),
   getFirestore:()=>({listCollections:async()=>[]}),
 })),/access denied/);
 assert.equal(deleted,true);
});

test('unknown source counts fail closed',async()=>{
 await assert.rejects(preflightEmptyDestination({
   projectId:'cormyr-homolog-test123',
   readAuthCount:async()=>-1,readCollectionCount:async()=>0,
 }),/Invalid Auth count/);
});
