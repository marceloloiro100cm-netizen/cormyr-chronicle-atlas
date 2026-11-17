import test from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapDisabledCloudRuntimes,classifyRuntimeDraftFailure}
  from './cloud-runtime-draft-bootstrap.mjs';

const ID='a'.repeat(64);
const STAGES=['migrationDomainStage','migrationAuthStage',
 'migrationTimeEngineStage','migrationNobleHouseStage',
 'migrationNewspaperRuntimeStage','migrationSpyStage',
 'migrationPrivateGmStage','migrationDriveSyncStage',
 'migrationPublicContentStage','migrationStorageStage'];
function fixture({missing=['migrationPublicContentStage'],
  existingHouse=false,existingMail=false,badCalendar=false,
  extraSnapshot=false}={}){
  const writes=[];let transactions=0,reads=0;
  const doc=path=>({
    path,
    collection(name){return {doc(id){return doc(path+'/'+name+'/'+id);}};},
    async get(){reads++;return value(path);},
  });
  function value(path){
    if(path==='migrationTimeEngineStage/'+ID+'/calendar/current')
      return {exists:true,data:()=>({
        year:1522,month:0,day:10,version:badCalendar?0:5,
        lastRound:2,privateValue:'NEVER_OUTPUT',
      })};
    const [name]=path.split('/');
    // Real Firestore snapshots always expose data(), even for unexpected roots.
    if(name==='campaignCloudRuntime')return {exists:existingHouse,data:()=>({})};
    if(name==='campaignMailRuntime')return {exists:existingMail,data:()=>({})};
    if(STAGES.includes(name))return {exists:!missing.includes(name),
      data:()=>({status:'complete',private:true,sourceSnapshotId:ID,
        privateValue:'NEVER_OUTPUT'})};
    throw Error('unexpected_file');
  }
  const db={
    collection(name){
      return {
        doc(id){return doc(name+'/'+id);},
        limit(n){
          assert.equal(name,'migrationDomainStage');
          assert.equal(n,2);
          return {async get(){
            reads++;
            return {docs:[
              {id:ID,exists:true,data:()=>({
                status:'complete',private:true,sourceSnapshotId:ID,
              })},
              ...(extraSnapshot?[{id:'b'.repeat(64),exists:true,
                data:()=>({status:'complete',private:true})}]:[]),
            ]};
          }};
        },
      };
    },
    async runTransaction(callback){
      transactions++;
      const pending=[];
      await callback({
        get(ref){reads++;return Promise.resolve(value(ref.path));},
        create(ref,v){pending.push({path:ref.path,data:v});},
      });
      writes.push(...pending);
    },
  };
  return {db,writes,stats:()=>({transactions,reads})};
}
const call=(f,mode='preview',confirmation='')=>
  bootstrapDisabledCloudRuntimes({
    db:f.db,projectId:'cormyr',mode,confirmation,env:{},
  });

test('preview is sanitized and does not write',async()=>{
  const f=fixture(),r=await call(f);
  assert.equal(r.historicalStagesVerified,6);
  assert.equal(r.storageVerified,true);
  assert.equal(r.historicalCalendarVerified,true);
  assert.equal(r.prerequisitesVerified,true);
  assert.equal(r.documentsPlanned,2);
  assert.equal(r.documentsCreated,0);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.equal(f.stats().transactions,0);
  assert.equal(f.writes.length,0);
  const output=JSON.stringify(r);
  for(const hidden of [ID,'1522','NEVER_OUTPUT','openRound','lastRound'])
    assert.ok(!output.includes(hidden));
});
test('apply needs exact approval BEFORE any reads',async()=>{
  const f=fixture();
  for(const s of ['','yes','ACTIVATE']){
    await assert.rejects(call(f,'apply',s),/runtime_draft_approval_required/);
  }
  assert.deepEqual(f.stats(),{transactions:0,reads:0});
});
test('one transaction creates only two pending and disabled roots',async()=>{
  const f=fixture();
  const r=await call(f,'apply','CREATE_DISABLED_CORMYR_RUNTIME_DRAFTS');
  assert.equal(r.documentsCreated,2);
  assert.equal(f.stats().transactions,1);
  assert.deepEqual(f.writes.map(x=>x.path),[
    'campaignCloudRuntime/'+ID,'campaignMailRuntime/'+ID]);
  for(const v of f.writes.map(x=>x.data)){
    assert.equal(v.status,'pending');
    assert.equal(v.private,true);
    assert.equal(v.applicationEnabled,false);
    assert.equal(Object.hasOwn(v,'openRound'),false);
    assert.equal(Object.hasOwn(v,'calendarVersion'),false);
  }
  assert.equal(f.writes[0].data.sourceSnapshotReconciled,false);
  assert.equal(f.writes[0].data.mailWriteApproved,false);
  assert.equal(f.writes[0].data.publicCatalogApproved,false);
  assert.equal(f.writes[1].data.mailEnabled,false);
  assert.equal(r.readyForCutover,false);
  assert.ok(!JSON.stringify(r).includes(ID));
});
test('missing source, bad calendar, or existing root prevents writes',async()=>{
  for(const opts of [
    {missing:['migrationStorageStage']},
    {missing:['migrationTimeEngineStage']},
    {badCalendar:true},
    {existingHouse:true},
    {existingMail:true},
    {extraSnapshot:true},
  ]){
    const f=fixture(opts);
    await assert.rejects(call(f,'apply','CREATE_DISABLED_CORMYR_RUNTIME_DRAFTS'),
      /runtime_draft_/);
    assert.equal(f.writes.length,0);
  }
});
test('wrong project, emulator, mode fail before reads',async()=>{
  const f=fixture();
  for(const args of [
    {projectId:'other'},{env:{FIRESTORE_EMULATOR_HOST:'localhost'}},
    {env:{FIREBASE_AUTH_EMULATOR_HOST:'localhost'}},{mode:'activate'},
  ]){
    await assert.rejects(bootstrapDisabledCloudRuntimes({
      db:f.db,projectId:'cormyr',mode:'preview',env:{},...args,
    }),/runtime_draft_invalid_configuration/);
  }
  assert.equal(f.stats().reads,0);
});

test('protected diagnostics expose only fixed error categories',()=>{
  assert.equal(classifyRuntimeDraftFailure({code:7,message:'private UID'}),'firestore_permission_denied');
  assert.equal(classifyRuntimeDraftFailure({code:'permission-denied'}),'firestore_permission_denied');
  assert.equal(classifyRuntimeDraftFailure({code:14}),'firestore_unavailable');
  assert.equal(classifyRuntimeDraftFailure({code:10}),'firestore_transaction_aborted');
  assert.equal(classifyRuntimeDraftFailure(new Error('runtime_draft_destination_exists')),'destination_exists');
  assert.equal(classifyRuntimeDraftFailure(new Error('SECRET_MAIL_USER_EMAIL')),'unknown_failure');
});
test('diagnostic phase callbacks receive only fixed phases, no source data',async()=>{
  const f=fixture();
  const phases=[];
  const r=await bootstrapDisabledCloudRuntimes({
    db:f.db,projectId:'cormyr',mode:'preview',env:{},
    onPhase:label=>phases.push(label),
  });
  assert.equal(r.documentsCreated,0);
  assert.deepEqual(phases,[
    'initialization','snapshot_inventory','historical_source_preflight','completed',
  ]);
  assert.ok(!JSON.stringify(phases).includes(ID));
});
