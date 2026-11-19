import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightReviewedPublicStage,publishReviewedPublicStage,
  preflightReviewedPublicCatalogStage,publishReviewedPublicCatalogStage}
  from './public-content-cloud-stage.mjs';

const SNAP='a'.repeat(64);
const source=()=>({
  snapshotId:SNAP,catalogVersion:4,translationsVersion:3,
  houses:Array.from({length:10},(_,i)=>{
    const key=String.fromCharCode(97+i);
    return {id:'house_'+key,name:'House '+key.toUpperCase(),
      region:'Region',classification:i===0?'Major':'Minor',
      updated_at:null,gallery:[],
      narrative_text:i===0?'Reviewed public story':null,
      active:true,season:2,publicReviewed:true,
      ...(i===0?{privateBank:9999}:{}),
    };
  }),
  playerHouses:[{house_id:'house_a'},{house_id:'house_b'}],
  translationsByLocale:Object.fromEntries(['en','es','de'].map(locale=>[
    locale,[{entity_type:'house',entity_id:'house_a',field_name:'name',
      translated_text:'Reviewed '+locale+' public label',publicReviewed:true}],
  ])),
});
function fakeDb({
  targetExists=false,sourceVerified=true,storageVerified=true,
  sourceSnapshotMismatch=false,
  houseRows=Array.from({length:10},(_,i)=>({
    sourceId:'house_'+String.fromCharCode(97+i),
    name:'House '+String.fromCharCode(65+i),
    active:true,season:2,
    ...(i===0?{secret:'DO_NOT_LOG'}:{}),
  })),
}={}){
  const entries=[],calls=[];
  const collection=(path)=>({
    doc(id){return {path:path+'/'+id,collection(name){return collection(path+'/'+id+'/'+name);}};},
  });
  const originalCollection=(path)=>({
    ...collection(path),
    doc(id){
      const value=collection(path).doc(id);
      return {...value,collection(name){
        const nested=collection(value.path+'/'+name);
        return {...nested,limit(n){
          assert.equal(n,251);
          return {kind:'query',path:value.path+'/'+name};
        }};
      }};
    },
  });
  const db={collection:originalCollection,
    async runTransaction(work){
      calls.push('transaction');
      const staged=[];
      const tx={
        async get(ref){
          if(ref.kind==='query')return {docs:houseRows.map(row=>({data:()=>structuredClone(row)}))};
          if(ref.path.startsWith('migrationDomainStage/'))
            return {exists:true,data:()=>({status:sourceVerified?'complete':'pending',private:true,
              sourceSnapshotId:sourceSnapshotMismatch?'b'.repeat(64):SNAP})};
          if(ref.path.startsWith('migrationStorageStage/'))
            return {exists:true,data:()=>({status:storageVerified?'complete':'pending',private:true,
              sourceSnapshotId:sourceSnapshotMismatch?'b'.repeat(64):SNAP})};
          if(ref.path.startsWith('migrationPublicContentStage/'))
            return {exists:targetExists};
          throw Error('unexpected read');
        },
        create(ref,value){staged.push({path:ref.path,value:structuredClone(value)});},
      };
      await work(tx);
      entries.push(...staged);
    },
  };
  return {db,entries,calls};
}
const inputs=(f,s=source())=>({
  db:f.db,source:s,expectedSnapshotId:SNAP,projectId:'cormyr',env:{},
  approvalDigest:preflightReviewedPublicStage(s).approvalDigest,
  explicitApproval:true,
});

test('five documents staged atomically and runtime remains OFF',async()=>{
  const f=fakeDb();
  const report=await publishReviewedPublicStage(inputs(f));
  assert.equal(report.stageCreated,true);
  assert.equal(report.documentsCreated,5);
  assert.equal(report.publicRoutesEnabled,false);
  assert.equal(report.cloudRuntimeModified,false);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.readyForCutover,false);
  assert.equal(f.entries.length,5);
  assert.deepEqual(f.entries.map(v=>v.path),[
    'migrationPublicContentStage/'+SNAP,
    'migrationPublicContentStage/'+SNAP+'/catalog/published',
    'migrationPublicContentStage/'+SNAP+'/translations/en',
    'migrationPublicContentStage/'+SNAP+'/translations/es',
    'migrationPublicContentStage/'+SNAP+'/translations/de',
  ]);
  const output=JSON.stringify(report);
  for(const privateValue of ['House A','house_a','Reviewed public story',
    'DO_NOT_LOG','privateBank',SNAP])assert.ok(!output.includes(privateValue));
  const catalog=f.entries[1].value;
  assert.ok(!JSON.stringify(catalog).includes('privateBank'));
});

test('unreviewed records, wrong digest and absent approval write nothing',async()=>{
  const f=fakeDb();
  const base=source();
  const changes=[
    {...inputs(f),explicitApproval:false},
    {...inputs(f),approvalDigest:'b'.repeat(64)},
    {...inputs(f),expectedSnapshotId:'b'.repeat(64)},
    {...inputs(f),source:{...base,houses:[{...base.houses[0],publicReviewed:false},base.houses[1]]}},
  ];
  for(const input of changes)
    await assert.rejects(()=>publishReviewedPublicStage(input),/reviewed_public_stage_/);
  assert.equal(f.calls.length,0);
  assert.equal(f.entries.length,0);
});

test('mismatched real source, incomplete stages or existing destination abort all creates',async()=>{
  for(const change of [
    {targetExists:true},{sourceVerified:false},{storageVerified:false},
    {sourceSnapshotMismatch:true},
    {houseRows:[{sourceId:'house_a',name:'House A',active:true,season:2}]},
    {houseRows:Array.from({length:10},(_,i)=>({
      sourceId:'house_'+String.fromCharCode(97+i),
      name:i===1?'OLD NAME':'House '+String.fromCharCode(65+i),
      active:true,season:2,
    }))},
  ]){
    const f=fakeDb(change);
    await assert.rejects(()=>publishReviewedPublicStage(inputs(f)),
      /reviewed_public_stage_/);
    assert.equal(f.entries.length,0);
  }
});

test('digest changes when a reviewed public field changes, not from private fields',()=>{
  const s=source(),a=preflightReviewedPublicStage(s);
  assert.equal(a.summary.reviewPlanValid,true);
  assert.match(a.approvalDigest,/^[a-f0-9]{64}$/);
  const different=source();
  different.houses[0].narrative_text='A different reviewed public story';
  assert.notEqual(a.approvalDigest,
    preflightReviewedPublicStage(different).approvalDigest);
  different.houses[0].narrative_text=s.houses[0].narrative_text;
  different.houses[0].privateBank=1;
  assert.equal(a.approvalDigest,
    preflightReviewedPublicStage(different).approvalDigest);
  const invalid=source();
  invalid.houses[0].publicReviewed=false;
  assert.equal(preflightReviewedPublicStage(invalid).approvalDigest,null);
});

test('wrong Cloud project and emulators never run the public write',async()=>{
  const f=fakeDb();
  for(const changes of [
    {projectId:'other'}, {projectId:undefined},
    {env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}},
    {env:{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}},
  ]){
    await assert.rejects(()=>publishReviewedPublicStage({
      ...inputs(f),...changes,
    }),/reviewed_public_stage_cloud_environment_unverified/);
  }
  assert.equal(f.calls.length,0);
  assert.equal(f.entries.length,0);
});

test('publication requires ten reviewed Houses and nonempty en/es/de review',async()=>{
  const f=fakeDb(),baseline=source();
  const valid=preflightReviewedPublicStage(baseline);
  assert.equal(valid.summary.reviewPlanValid,true);
  assert.match(valid.approvalDigest,/^[a-f0-9]{64}$/);
  for(const change of [
    current=>{current.houses.pop();},
    current=>{current.translationsByLocale.en=[];},
    current=>{current.translationsByLocale.es=[];},
    current=>{current.translationsByLocale.de=[];},
    current=>{current.translationsByLocale.en[0].publicReviewed=false;},
  ]){
    const current=source();change(current);
    assert.equal(preflightReviewedPublicStage(current).approvalDigest,null);
    await assert.rejects(()=>publishReviewedPublicStage({
      ...inputs(f,current),approvalDigest:valid.approvalDigest,
    }),/reviewed_public_stage_review_plan_invalid/);
  }
  assert.equal(f.calls.length,0);
  assert.equal(f.entries.length,0);
});

const portugueseCatalogSource=()=>{
  const {translationsVersion,translationsByLocale,...catalog}=source();
  return catalog;
};
const catalogInputs=(fixture,review=portugueseCatalogSource())=>({
  db:fixture.db,source:review,expectedSnapshotId:SNAP,projectId:'cormyr',
  env:{},approvalDigest:preflightReviewedPublicCatalogStage(review).approvalDigest,
  explicitApproval:true,
});

test('Portuguese-only reviewed catalog creates exactly two documents and no translation release',async()=>{
  const f=fakeDb(),plan=portugueseCatalogSource();
  const preflight=preflightReviewedPublicCatalogStage(plan);
  assert.equal(preflight.summary.reviewedHouses,10);
  assert.match(preflight.approvalDigest,/^[a-f0-9]{64}$/);
  assert.notEqual(preflight.approvalDigest,preflightReviewedPublicStage(source()).approvalDigest);
  const report=await publishReviewedPublicCatalogStage(catalogInputs(f,plan));
  assert.equal(report.stageCreated,true);
  assert.equal(report.documentsCreated,2);
  assert.equal(report.translationsDeferred,true);
  assert.equal(report.publicRoutesEnabled,false);
  assert.equal(report.cloudRuntimeModified,false);
  assert.equal(report.readyForPlayers,false);
  assert.deepEqual(f.entries.map(e=>e.path),[
    'migrationPublicContentStage/'+SNAP,
    'migrationPublicContentStage/'+SNAP+'/catalog/published',
  ]);
  assert.equal(f.entries[0].value.reviewScope,'catalog-only');
  assert.equal(f.entries[0].value.translationsDeferred,true);
  assert.equal(Object.hasOwn(f.entries[0].value,'translationsVersion'),false);
  assert.equal(JSON.stringify(f.entries).includes('DO_NOT_LOG'),false);
});

test('catalog-only import rejects translation payloads, wrong digest and absent explicit approval',async()=>{
  const f=fakeDb(),catalog=portugueseCatalogSource();
  assert.throws(()=>preflightReviewedPublicCatalogStage(source()),
    /reviewed_public_stage_catalog_only_scope_invalid/);
  const ok=catalogInputs(f,catalog);
  for(const changes of [
    {explicitApproval:false},
    {approvalDigest:preflightReviewedPublicStage(source()).approvalDigest},
    {source:source()},
    {source:{...catalog,houses:catalog.houses.slice(0,9)}},
    {source:{...catalog,houses:[
      {...catalog.houses[0],publicReviewed:false},...catalog.houses.slice(1)]}},
  ]){
    await assert.rejects(()=>publishReviewedPublicCatalogStage({...ok,...changes}),
      /reviewed_public_stage_/);
  }
  assert.equal(f.calls.length,0);
  assert.equal(f.entries.length,0);
});

test('catalog-only aborts atomically when source, Storage or target is not verified',async()=>{
  for(const problem of [
    {targetExists:true},{sourceVerified:false},{storageVerified:false},
    {sourceSnapshotMismatch:true},{houseRows:[{sourceId:'house_a',
      name:'House A',active:true,season:2}]},
  ]){
    const f=fakeDb(problem);
    await assert.rejects(()=>publishReviewedPublicCatalogStage(catalogInputs(f)),
      /reviewed_public_stage_/);
    assert.equal(f.entries.length,0);
  }
});

test('catalog-only digest changes with reviewed text and ignores private source fields',()=>{
  const s=portugueseCatalogSource(),a=preflightReviewedPublicCatalogStage(s);
  const second=portugueseCatalogSource();
  second.houses[0].narrative_text='Revised public history';
  assert.notEqual(a.approvalDigest,
    preflightReviewedPublicCatalogStage(second).approvalDigest);
  second.houses[0].narrative_text=s.houses[0].narrative_text;
  second.houses[0].privateBank=123;
  assert.equal(a.approvalDigest,
    preflightReviewedPublicCatalogStage(second).approvalDigest);
});
