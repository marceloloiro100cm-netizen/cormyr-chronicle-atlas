import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLot5Safety} from './lot5-safety-preflight.mjs';

const base={
  firestoreRules:"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }",
  storageRules:"rules_version = '2'; service firebase.storage { match /b/{bucket}/o { match /{path=**} { allow read, write: if false; } } }",
  appStart:"export const startInstance=createStart(()=>({functionMiddleware: [],requestMiddleware:[archiveOnlyMiddleware,errorMiddleware,csrfMiddleware]})); const archived=shouldBlockLegacyRequest(pathname, handlerType);",
  apphosting:"env:\n  - variable: CRON_SECRET\n    secret: CRON_SECRET\n",
};
test('production deny-all and origin backend remain unchanged while cloud cutover is blocked',()=>{
 const result=evaluateLot5Safety(base);
 assert.equal(result.safeToMergeCode,true);
 assert.ok(Object.values(result.checks).every(Boolean));
 assert.equal(result.readyForCutover,false);
 assert.equal(result.realUserCloudE2EVerified,false);
 assert.equal(result.cloudFirestoreDataReconciled,false);
 assert.equal(result.allMediaBucketsVerified,false);
 assert.equal(result.rollbackInCloudVerified,false);
 assert.equal(result.cloudWrites,0);
});
test('accidental Firestore or Storage permission grants block release',()=>{
 assert.equal(evaluateLot5Safety({...base,
   firestoreRules:base.firestoreRules.replace('if false','if request.auth != null')})
   .checks.productionFirestoreDenyAll,false);
 assert.equal(evaluateLot5Safety({...base,
   storageRules:base.storageRules+'\nallow read: if true;'})
   .safeToMergeCode,false);
});
test('a legacy Supabase middleware or missing archive gate blocks release',()=>{
 const legacy=base.appStart.replace('functionMiddleware: []',
   'functionMiddleware: [attachSupabaseAuth]');
 assert.equal(evaluateLot5Safety({...base,appStart:legacy}).safeToMergeCode,false);
 assert.equal(evaluateLot5Safety({...base,appStart:
   base.appStart.replace('archiveOnlyMiddleware,','')}).safeToMergeCode,false);
 assert.equal(evaluateLot5Safety({...base,appStart:
   base.appStart.replace('shouldBlockLegacyRequest','bypassLegacyRequest')})
   .safeToMergeCode,false);
});
test('premature backend switch or App Hosting emulator switches block release',()=>{
 assert.equal(evaluateLot5Safety({...base,appStart:'functionMiddleware: [attachFirebaseAuth]'})
   .safeToMergeCode,false);
 assert.equal(evaluateLot5Safety({...base,apphosting:base.apphosting+'\nFIREBASE_DOMAIN_HOMOLOGATION_ENABLED: true'})
   .safeToMergeCode,false);
 assert.equal(evaluateLot5Safety({...base,apphosting:base.apphosting+'\nVITE_FIREBASE_DOMAIN_HOMOLOGATION: true'})
   .safeToMergeCode,false);
});
test('cannot satisfy gate using private secrets committed in YAML',()=>{
 const unsafe=base.apphosting+'\nclient_secret: "reallysecretvalue1234567890123456"';
 assert.equal(evaluateLot5Safety({...base,apphosting:unsafe}).safeToMergeCode,false);
 assert.throws(()=>evaluateLot5Safety({...base,firestoreRules:null}));
});
