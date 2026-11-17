import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightReviewedPublicStage,publishReviewedPublicStage}
  from './public-content-cloud-stage.mjs';

const SNAP='a'.repeat(64);
const source=()=>({
  snapshotId:SNAP,catalogVersion:4,translationsVersion:3,
  houses:[
    {id:'house_a',name:'House A',region:'Region',
      classification:'Major',updated_at:null,gallery:[],
      narrative_text:'Reviewed public story',active:true,season:2,
      publicReviewed:true,privateBank:9999},
    {id:'house_b',name:'House B',region:'Region',
      classification:'Minor',updated_at:null,gallery:[],
      narrative_text:null,active:true,season:2,publicReviewed:true},
  ],
  playerHouses:[{house_id:'house_a'},{house_id:'house_b'}],
  translationsByLocale:{en:[],es:[],de:[]},
});
function fakeDb({
  targetExists=false,sourceVerified=true,storageVerified=true,
  houseRows=[
    {sourceId:'house_a',name:'House A',active:true,season:2,secret:'DO_NOT_LOG'},
    {sourceId:'house_b',name:'House B',active:true,season:2},
  ],
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
        return {limit(n){
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
            return {exists:true,data:()=>({status:sourceVerified?'complete':'pending',private:true})};
          if(ref.path.startsWith('migrationStorageStage/'))
            return {exists:true,data:()=>({status:storageVerified?'complete':'pending',private:true})};
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
  db:f.db,source:s,expectedSnapshotId:SNAP,
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
    {houseRows:[{sourceId:'house_a',name:'House A',active:true,season:2}]},
    {houseRows:[
      {sourceId:'house_a',name:'House A',active:true,season:2},
      {sourceId:'house_b',name:'OLD NAME',active:true,season:2},
    ]},
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
