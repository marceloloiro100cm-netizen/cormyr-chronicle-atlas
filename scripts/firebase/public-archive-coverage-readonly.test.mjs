import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePublicArchivePayload,summarizePublicArchiveCoverage,
 inspectPublicArchiveCoverage} from './public-archive-coverage-readonly.mjs';

const SNAP='a'.repeat(64);
const demo=()=>({regions:[
  {name:'Crownlands',houses:[{name:'Phelles'},{name:'Alsevir'}]},
  {name:'Helmlands',houses:[{name:'Evenhand'},{name:'Evenhand'}]},
]});
const rows=()=>[
  {sourceId:'house-1',name:'Phelles',active:true,season:2},
  {sourceId:'house-2',name:'Alsevir',active:true,season:2},
  {sourceId:'house-3',name:'Evenhand',active:true,season:2},
  {sourceId:'house-4',name:'Missing',active:true,season:2},
  {sourceId:'house-5',name:'Old',active:false,season:1},
];
test('pure coverage counts match, ambiguous and missing without leaking names',()=>{
  const report=summarizePublicArchiveCoverage({
    archive:demo(),sourceHouses:rows(),
  });
  assert.equal(report.archivedRegions,2);
  assert.equal(report.archivedHouses,4);
  assert.equal(report.sourceHouses,5);
  assert.equal(report.activeSourceHouses,4);
  assert.equal(report.exactMatches,2);
  assert.equal(report.ambiguousMatches,1);
  assert.equal(report.unmatchedActive,1);
  assert.equal(report.reviewApproved,false);
  assert.equal(report.readyForPlayers,false);
  assert.equal(report.releaseDecision,'NO_GO');
  for(const secret of ['Phelles','Alsevir','Evenhand','Missing','house-1']){
    assert.ok(!JSON.stringify(report).includes(secret));
  }
});
test('archive parser rejects code execution and invalid JSON',()=>{
  assert.deepEqual(parsePublicArchivePayload(
    'window.CORMYR_DATA = '+JSON.stringify(demo())+';'
  ),demo());
  for(const input of [
    'eval(1)', 'window.CORMYR_DATA = alert(1);',
    'window.CORMYR_DATA = {"regions":[]};',
    'window.CORMYR_DATA = {};',
    'window.CORMYR_DATA = '+JSON.stringify(demo())+'; extra()',
  ]){
    assert.throws(()=>parsePublicArchivePayload(input),
      /public_archive_coverage_/);
  }
});
test('real checked-in archive is parsed without external fetch or execution',()=>{
  const raw=readFileSync(new URL('../../public/cormyr/data.js',import.meta.url),
    'utf8');
  const data=parsePublicArchivePayload(raw);
  const report=summarizePublicArchiveCoverage({
    archive:data,sourceHouses:rows(),
  });
  assert.equal(report.archivedRegions,11);
  assert.ok(report.archivedHouses>=100);
  assert.equal(report.releaseDecision,'NO_GO');
});
test('missing, duplicate and malformed source references fail closed',()=>{
  for(const bad of [
    [], [{sourceId:'a',name:'',active:true,season:2}],
    [{sourceId:'a',name:'Phelles',active:true,season:2},
     {sourceId:'a',name:'Alsevir',active:true,season:2}],
    [{sourceId:'a',name:'Phelles',active:'yes',season:2}],
    [{sourceId:'a',name:'Phelles',active:true,season:'2'}],
  ]){
    assert.throws(()=>summarizePublicArchiveCoverage({
      archive:demo(),sourceHouses:bad,
    }),/public_archive_coverage_/);
  }
});
test('protected read-only probe fetches only same-snapshot private houses',async()=>{
  const accessed=[];let writes=0;
  const db={collection(name){
    assert.equal(name,'migrationDomainStage');
    return {doc(id){
      assert.equal(id,SNAP);
      return {
        async get(){accessed.push('root');return {exists:true,
          data:()=>({status:'complete',private:true,sourceSnapshotId:SNAP})};},
        collection(name){
          assert.equal(name,'houses');
          return {limit(limit){
            assert.equal(limit,251);
            return {async get(){accessed.push('houses');return {
              docs:rows().map(row=>({data:()=>row})),
            };}};
          }};
        },
        set(){writes++;throw Error('write forbidden');},
      };
    }};
  }};
  const result=await inspectPublicArchiveCoverage({db,snapshotId:SNAP});
  assert.deepEqual(accessed,['root','houses']);
  assert.equal(writes,0);
  assert.equal(result.checked,true);
  assert.equal(result.reviewApproved,false);
  assert.ok(!JSON.stringify(result).includes(SNAP));
});

test('duplicate active private names never count as exact identity matches',()=>{
  const archive={regions:[{name:'Helmlands',houses:[
    {name:'Evenhand',region:'Helmlands',
      hierarchy:{kind:'major'},crest:'assets/helmlands-evenhand.webp',
      historyPath:'histories/evenhand.json'},
  ]}]};
  const result=summarizePublicArchiveCoverage({archive,sourceHouses:[
    {sourceId:'unique-private-a',name:'Evenhand',active:true,season:2},
    {sourceId:'unique-private-b',name:'Evenhand',active:true,season:2},
  ]});
  assert.equal(result.exactMatches,0);
  assert.equal(result.ambiguousMatches,2);
  assert.equal(result.candidateFields.region,0);
  assert.equal(result.reviewApproved,false);
  assert.equal(result.readyForPlayers,false);
});
test('only unambiguous source names contribute to review field availability',()=>{
  const archive={regions:[{name:'Helmlands',houses:[{
    name:'Evenhand',region:'Helmlands',
    hierarchy:{kind:'major'},crest:'assets/helmlands-evenhand.webp',
    historyPath:'histories/evenhand.json',
    description:'PUBLIC ARCHIVE STORY',
  },{
    name:'Phelles',region:'WRONG REGION',
    hierarchy:{kind:'crown'},crest:'../private/crest.webp',
    historyPath:'histories/../../private.json',
  }]}]};
  const rows=[
    {sourceId:'src-1',name:'Evenhand',active:true,season:2},
    {sourceId:'src-2',name:'Phelles',active:true,season:2},
  ];
  const r=summarizePublicArchiveCoverage({archive,sourceHouses:rows});
  assert.equal(r.exactMatches,2);
  assert.deepEqual(r.candidateFields,{
    region:1,classification:2,crest:1,historyReference:1,
    directDescription:1,
  });
  assert.equal(r.reviewApproved,false);
  assert.equal(r.releaseDecision,'NO_GO');
  for(const secret of ['src-1','src-2','PUBLIC ARCHIVE STORY','Evenhand'])
    assert.ok(!JSON.stringify(r).includes(secret));
});

test('unique current season houses require valid public asset bytes, not names alone',()=>{
  const archive={regions:[{name:'Helmlands',houses:[
    {name:'Evenhand',region:'Helmlands',hierarchy:{kind:'major'},
      crest:'assets/evenhand.webp',historyPath:'histories/evenhand.json'},
    {name:'Stonecastle',region:'Helmlands',hierarchy:{kind:'major'},
      crest:'assets/stonecastle.webp',historyPath:'histories/stonecastle.json'},
    {name:'Forgotten',region:'Helmlands',
      crest:'assets/forgotten.webp'},
  ]}]};
  const sourceHouses=[
    {sourceId:'private-a',name:'Evenhand',active:true,season:2},
    {sourceId:'private-b',name:'Stonecastle',active:true,season:2},
    {sourceId:'private-c',name:'Forgotten',active:false,season:1},
  ];
  const called=[];
  const r=summarizePublicArchiveCoverage({archive,sourceHouses,assetChecks:{
    crest:ref=>{called.push('crest');return ref==='assets/evenhand.webp';},
    history:ref=>{
      called.push('history');
      if(ref==='histories/stonecastle.json')throw Error('SECRET_PRIVATE_PATH');
      return ref==='histories/evenhand.json';
    },
  }});
  assert.equal(r.exactMatches,2);
  assert.equal(r.assetVerification.checked,true);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithValidCrests,1);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithValidHistories,1);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithBothValid,1);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithUnverifiedAssets,1);
  assert.equal(called.length,4);
  assert.equal(r.reviewApproved,false);
  assert.equal(r.readyForPlayers,false);
  assert.equal(r.releaseDecision,'NO_GO');
  for(const secret of ['Evenhand','Stonecastle','private-a',
    'SECRET_PRIVATE_PATH','assets/evenhand.webp']){
    assert.ok(!JSON.stringify(r).includes(secret));
  }
});

test('an unverified archive match never turns missing or invalid files into approval',()=>{
  const archive={regions:[{name:'Helmlands',houses:[{
    name:'Evenhand',region:'Helmlands',hierarchy:{kind:'major'},
    crest:'../private.webp',historyPath:'histories/../private.json',
  }]}]};
  const privateHouses=[{sourceId:'internal-id',name:'Evenhand',
    active:true,season:2}];
  const r=summarizePublicArchiveCoverage({archive,sourceHouses:privateHouses,
    assetChecks:{crest:()=>true,history:()=>true}});
  assert.equal(r.exactMatches,1);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithValidCrests,0);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithValidHistories,0);
  assert.equal(r.assetVerification.uniqueSeason2MatchesWithUnverifiedAssets,1);
  const noChecks=summarizePublicArchiveCoverage({
    archive,sourceHouses:privateHouses,
  });
  assert.equal(noChecks.assetVerification.checked,false);
  assert.equal(noChecks.assetVerification.uniqueSeason2MatchesWithValidCrests,null);
  assert.throws(()=>summarizePublicArchiveCoverage({
    archive,sourceHouses:privateHouses,assetChecks:{crest:()=>true},
  }),/public_archive_coverage_asset_checks_invalid/);
});
