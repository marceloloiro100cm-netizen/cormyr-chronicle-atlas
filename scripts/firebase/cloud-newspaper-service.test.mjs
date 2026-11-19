import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudNewspaperError,createFirebaseCloudNewspaper} from './cloud-newspaper-service.mjs';

const snapshot='b'.repeat(64),token='firebase-synthetic-newspaper-token';
const path=(...parts)=>parts.join('/');
const doc=value=>({exists:value!==undefined,data:()=>value});
const input=(changes={})=>({
  action:'publish',requestKey:'unique-key-001',
  title:'A Folha Sem Selo',subtitle:'Folha especial',
  article:'Conselho de Cormyr\nNotícia de interesse geral',...changes,
});

function fixture(profile='editor'){
  const records=new Map();
  for(const root of ['migrationDomainStage','migrationAuthStage',
    'migrationTimeEngineStage','migrationNewspaperRuntimeStage'])
    records.set(path(root,snapshot),{status:'complete',private:true});
  const calendar=path('migrationTimeEngineStage',snapshot,'calendar','current');
  records.set(calendar,{year:1522,month:0,day:10,festival:null,version:5});
  const runtime=path('campaignCloudRuntime',snapshot);
  records.set(runtime,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    newspaperWriteApproved:true,newspaperSequenceReconciled:true,
    newspaperImportedMaxEditionNo:12,nextNewspaperEditionNo:13,calendarVersion:5,
  });
  const access=path('migrationDomainStage',snapshot,'access','editor-1');
  records.set(access,{userId:'editor-1',profile,admin:profile==='narrador',
    active:true,requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]});
  const ref=(p='')=>({
    path:p,
    collection(name){return ref(p?path(p,name):name);},
    doc(id){return ref(path(p,id));},
    limit(n){return {async get(){return {docs:[...records].filter(([k])=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).slice(0,n).map(([,v])=>doc(v))};}};},
    async get(){return doc(records.get(p));},
  });
  let transactions=0;
  const db={
    collection(name){return ref(name);},
    async runTransaction(fn){
      transactions++;
      const writes=[];
      const tx={
        get:reference=>reference.get(),
        create(reference,value){writes.push({operation:'create',path:reference.path,value});},
        update(reference,value){writes.push({operation:'update',path:reference.path,value});},
        delete(reference){writes.push({operation:'delete',path:reference.path});},
      };
      const result=await fn(tx);
      for(const w of writes){
        if(w.operation==='create'&&records.has(w.path))throw Error('duplicate');
        if(w.operation==='update'&&!records.has(w.path))throw Error('missing');
      }
      for(const w of writes){
        if(w.operation==='delete')records.delete(w.path);
        else records.set(w.path,w.operation==='create'?structuredClone(w.value):
          {...records.get(w.path),...structuredClone(w.value)});
      }
      return result;
    },
  };
  const auth={
    async verifyIdToken(t,revoked){
      assert.equal(revoked,true);
      if(t!==token)throw Error('invalid token');
      return {uid:'editor-1'};
    },
    async getUser(uid){return {uid,disabled:false};},
  };
  const service=(overrides={})=>createFirebaseCloudNewspaper({
    db,auth,snapshotId:snapshot,projectId:'cormyr',enabled:true,
    env:{},clock:()=>'2026-11-16T14:00:00.000Z',...overrides,
  });
  return {records,access,calendar,runtime,db,auth,service,transactions:()=>transactions};
}
async function denied(fn,code,status){
  await assert.rejects(fn,e=>e instanceof CloudNewspaperError&&
    e.code===code&&e.status===status);
}
test('editor publishes with the operational date without changing the archived date',async()=>{
  const f=fixture();
  f.records.set(f.runtime,{...f.records.get(f.runtime),calendarSource:'operational',
    calendar:{year:1522,month:1,day:20,festival:null,version:6},calendarVersion:6});
  assert.equal((await f.service().status(token)).canPublish,true);
  await f.service().publish(token,input());
  const edition=[...f.records].find(([key])=>key.includes('/publishedNewspapers/'))[1];
  assert.equal(edition.campaignDate,'1522-02-20');
  assert.equal(f.records.get(f.calendar).version,5);
});

test('fails closed without flag or with emulator or wrong project',()=>{
  const f=fixture();
  const cfg={db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',env:{}};
  assert.throws(()=>createFirebaseCloudNewspaper(cfg),/cloud_newspaper_disabled/);
  assert.throws(()=>createFirebaseCloudNewspaper({...cfg,enabled:true,projectId:'demo'}),/cloud_newspaper_disabled/);
  assert.throws(()=>createFirebaseCloudNewspaper({...cfg,enabled:true,snapshotId:'bad'}),/cloud_newspaper_disabled/);
  assert.throws(()=>createFirebaseCloudNewspaper({...cfg,enabled:true,env:{
    FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',
  }}),/cloud_newspaper_disabled/);
});
test('editor publishes once, retry is idempotent, original migration roots never mutate',async()=>{
  const f=fixture(),srv=f.service();
  const before=new Map([...f.records].filter(([k])=>k.startsWith('migration')));
  assert.deepEqual(await srv.status(token),{enabled:true,canPublish:true,readOnly:false});
  const a=await srv.publish(token,input());
  const b=await srv.publish(token,input());
  assert.deepEqual(b,{...a,duplicate:true});
  assert.equal(a.duplicate,false);
  assert.equal(a.editionNo,13);
  assert.equal(f.records.get(f.runtime).nextNewspaperEditionNo,14);
  const editions=[...f.records].filter(([k])=>k.includes('/publishedNewspapers/'));
  const audits=[...f.records].filter(([k])=>k.includes('/newspaperAudits/'));
  assert.equal(editions.length,1);
  assert.equal(audits.length,1);
  assert.equal(editions[0][1].blocks[0].text,input().article);
  assert.equal(editions[0][1].state,'published');
  assert.equal(editions[0][1].campaignDate,'1522-01-10');
  for(const [key,value] of before)assert.deepEqual(f.records.get(key),value);
  assert.equal(f.transactions(),2);
});
test('newspaper edition numbering is monotonic without collisions',async()=>{
  const f=fixture(),srv=f.service();
  const a=await srv.publish(token,input());
  const b=await srv.publish(token,input({requestKey:'unique-key-002'}));
  assert.equal(a.editionNo,13);
  assert.equal(b.editionNo,14);
  assert.equal(f.records.get(f.runtime).nextNewspaperEditionNo,15);
});
test('reusing the same idempotency key for new content fails',async()=>{
  const f=fixture(),srv=f.service();
  await srv.publish(token,input());
  await denied(()=>srv.publish(token,input({article:'Texto diferente'})),
    'request_key_conflict',409);
  assert.equal(f.records.get(f.runtime).nextNewspaperEditionNo,14);
});
test('players and disabled accounts cannot write',async()=>{
  const f=fixture('jogador');
  await denied(()=>f.service().publish(token,input()),'editor_not_authorized',403);
  f.records.set(f.access,{...f.records.get(f.access),profile:'editor',admin:false,active:false});
  await denied(()=>f.service().publish(token,input()),'editor_not_authorized',403);
  f.records.set(f.access,{...f.records.get(f.access),active:true,memberHouseIds:['house-a']});
  await denied(()=>f.service().publish(token,input()),'editor_not_authorized',403);
  f.auth.getUser=async()=>({uid:'editor-1',disabled:true});
  await denied(()=>f.service().publish(token,input()),'authentication_required',401);
  assert.equal(f.transactions(),3);
});
test('narrator is allowed only when explicitly admin',async()=>{
  const f=fixture('narrador');
  assert.equal((await f.service().publish(token,input())).editionNo,13);
  const g=fixture('narrador');
  g.records.set(g.access,{...g.records.get(g.access),admin:false});
  await denied(()=>g.service().publish(token,input()),'editor_not_authorized',403);
});
test('stage, reconciliation, edition sequence and calendar gates must be satisfied',async()=>{
  const f=fixture();
  const original=structuredClone(f.records.get(f.runtime));
  for(const change of [
    {newspaperWriteApproved:false},{sourceSnapshotReconciled:false},
    {newspaperSequenceReconciled:false},{applicationEnabled:false},
    {nextNewspaperEditionNo:12},{calendarVersion:4},
    {status:'incomplete'},
  ]){
    f.records.set(f.runtime,{...original,...change});
    await denied(()=>f.service().publish(token,input()),
      'newspaper_runtime_not_approved',503);
    assert.equal((await f.service().status(token)).enabled,false);
  }
  f.records.set(f.runtime,original);
  f.records.set(f.calendar,{year:1522,month:14,day:10,version:5});
  await denied(()=>f.service().publish(token,input()),'calendar_unavailable',503);
  f.records.set(f.calendar,{year:1522,month:0,day:10,version:5});
  f.records.set('migrationNewspaperRuntimeStage/'+snapshot,{status:'incomplete',private:true});
  await denied(()=>f.service().publish(token,input()),'migration_stage_not_ready',503);
  assert.equal([...f.records].filter(([k])=>k.includes('/publishedNewspapers/')).length,0);
});
test('strict request shape, byte bounds and forged claims are rejected',async()=>{
  const f=fixture(),s=f.service();
  for(const v of [
    input({requestKey:'short'}),input({article:''}),input({article:'x'.repeat(12001)}),
    input({subtitle:undefined}),input({title:{name:'bad'}}),
    input({houseId:'another-house'}),input({action:'delete'}),
  ])await denied(()=>s.publish(token,v),'invalid_newspaper_request',400);
  await denied(()=>s.publish('invalid-token',input()),'authentication_required',401);
  assert.equal([...f.records].filter(([k])=>k.includes('publishedNewspapers')).length,0);
});


const rich=(changes={})=>({action:'saveEdition',requestKey:'editorial-key-001',id:null,
  expectedVersion:0,state:'draft',content:{title:'Edição especial',subtitle:'Vozes de Cormyr',
    blocks:[{id:'a',type:'headline',text:'Abertura da campanha',span:12,height:110},
      {id:'b',type:'article',text:'Notícia\nConteúdo da reportagem',bodyFont:'garamond',span:6,height:190}]},...changes});

test('editorial lifecycle persists drafts, edits, cancellation and archive with audit and CAS',async()=>{
  const f=fixture(),srv=f.service();
  const initial=await srv.saveEdition(token,rich());
  assert.equal(initial.state,'draft');assert.equal(initial.version,1);
  assert.equal(initial.publishedAt,null);assert.equal(initial.editionNo,13);
  assert.deepEqual((await srv.listEditorial(token)).items.map(x=>x.id),[initial.id]);
  assert.equal((await srv.getEditorial(token,{action:'getEditorial',id:initial.id})).blocks.length,2);
  assert.equal((await srv.saveEdition(token,rich())).duplicate,true);
  const publish=rich({id:initial.id,expectedVersion:1,state:'published',requestKey:'editorial-key-002'});
  const pub=await srv.saveEdition(token,publish);
  assert.equal(pub.state,'published');assert.equal(pub.version,2);assert.ok(pub.publishedAt);
  await denied(()=>srv.saveEdition(token,{...publish,requestKey:'editorial-key-stale'}),'edition_version_conflict',409);
  const cancel=await srv.saveEdition(token,{...publish,expectedVersion:2,state:'cancelled',requestKey:'editorial-key-003'});
  assert.equal(cancel.state,'cancelled');
  const archived=await srv.saveEdition(token,{...publish,expectedVersion:3,state:'archived',requestKey:'editorial-key-004'});
  assert.equal(archived.state,'archived');
  assert.equal(f.records.get(f.runtime).nextNewspaperEditionNo,14);
  assert.equal([...f.records.keys()].filter(k=>k.includes('/newspaperAudits/')).length,4);
});

test('editorial writes and private drafts reject players, forged fields and reused keys',async()=>{
  const f=fixture('jogador'),srv=f.service();
  await denied(()=>srv.listEditorial(token),'editor_not_authorized',403);
  await denied(()=>srv.saveEdition(token,rich()),'editor_not_authorized',403);
  const editor=fixture(),s=editor.service();
  await denied(()=>s.saveEdition(token,rich({createdBy:'forged'})),'invalid_editorial_request',400);
  await s.saveEdition(token,rich());
  await denied(()=>s.saveEdition(token,rich({state:'published'})),'request_key_conflict',409);
  await denied(()=>s.saveEdition(token,rich({content:{title:'T',subtitle:'',blocks:[
    {id:'a',type:'image',text:'',imageSrc:'https://evil.invalid/track'}]}})),
    'invalid_editorial_content',400);
});


test('a player records and clears only their own published newspaper receipt',async()=>{
 const f=fixture('jogador');
 f.records.set(f.access,{...f.records.get(f.access),
  playerId:'player-a',memberHouseIds:['house-a'],editHouseIds:['house-a']});
 const id='cloud-'+'a'.repeat(64),url='campaignCloudRuntime/'+snapshot+'/publishedNewspapers/'+id;
 f.records.set(url,{id,source:'firebase-cloud',sourceSnapshotId:snapshot,
  state:'published',publishedAt:'2026-11-16T14:00:00Z',
  cancelledAt:null,version:2});
 const once=await f.service().markReader(token,{action:'markRead',id});
 assert.equal(once.recorded,true);
 assert.equal((await f.service().markReader(token,{action:'markRead',id})).alreadyRecorded,true);
 const key='campaignCloudRuntime/'+snapshot+'/newspaperReadReceipts/';
 assert.equal([...f.records].filter(([p])=>p.startsWith(key)).length,1);
 const gone=await f.service().markReader(token,{action:'markUnread',id});
 assert.equal(gone.recorded,false);
 assert.equal([...f.records].filter(([p])=>p.startsWith(key)).length,0);
 const original=f.records.get(url);
 assert.equal(original.version,2);
 await denied(()=>f.service().markReader(token,{
  action:'markRead',id:'../other',
 }),'invalid_receipt_request',400);
});

test('unpublished imported editions cannot receive operational read receipts',async()=>{
 const f=fixture('jogador');
 f.records.set(f.access,{...f.records.get(f.access),
  playerId:'player-a',memberHouseIds:['house-a'],editHouseIds:['house-a']});
 const id='11111111-1111-4111-8111-111111111111';
 f.records.set('migrationNewspaperRuntimeStage/'+snapshot+'/editions/'+id,{
  id,state:'draft',publishedAt:null,cancelledAt:null,publicationRevision:1,
 });
 await denied(()=>f.service().markReader(token,{action:'markRead',id}),
  'edition_unavailable',404);
 assert.equal([...f.records.keys()].some(p=>p.includes('newspaperReadReceipts')),false);
});
