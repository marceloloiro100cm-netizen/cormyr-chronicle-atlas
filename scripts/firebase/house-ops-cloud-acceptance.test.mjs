import {createHash} from 'node:crypto';
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {auditHouseOpsCloud,summarize} from './house-ops-cloud-acceptance.mjs';

const snap='a'.repeat(64),uid='house-a';
const hash=v=>createHash('sha256').update(v).digest('hex');
const stable=v=>v&&typeof v==='object'
 ?Array.isArray(v)?v.map(stable):Object.fromEntries(
   Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const state={houseId:uid,phase:'active',month:18265,treasury:42,base:{wealth:2},
 identity:{region:'Ferlin'}};
const checksum=hash(JSON.stringify(stable(state)));
const encode=v=>{
 if(v===null)return {nullValue:null};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='number')return Number.isInteger(v)?
  {integerValue:String(v)}:{doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(
  Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw Error('bad fixture');
};
const document=(name,obj)=>({name,fields:Object.fromEntries(
 Object.entries(obj).map(([k,v])=>[k,encode(v)]))});
const goodRoot={status:'active',private:true,sourceSnapshotId:snap,
 sourceSnapshotReconciled:true,applicationEnabled:true,
 houseOpsWriteApproved:true,calendarVersion:5};
const base='projects/cormyr/databases/(default)/documents/';
function mock({denied=false,missing=false,corrupt=false,approved=true,
 partial=false,wrongMonth=false,sourcePhase='active'}={}){
 const docs=new Map([
  ['migrationDomainStage/'+snap,{status:'complete',private:true}],
  ['migrationAuthStage/'+snap,{status:'complete',private:true}],
  ['migrationTimeEngineStage/'+snap,{status:'complete',private:true}],
  ['migrationNobleHouseStage/'+snap,{status:'complete',private:true}],
  ['campaignCloudRuntime/'+snap,{...goodRoot,houseOpsWriteApproved:approved}],
  ['migrationTimeEngineStage/'+snap+'/calendar/current',
   {year:1522,month:1,day:1,version:5}],
  ['migrationNobleHouseStage/'+snap+'/sheets/'+hash('noble-sheet:'+uid),
   {houseId:uid,version:3,state:{...state,phase:sourcePhase,
     month:wrongMonth?18250:state.month}}],
  ...(!missing?[['campaignCloudRuntime/'+snap+'/houseEconomies/'+hash('house:'+uid),
   {houseId:uid,status:'active',private:true,
    sourceSnapshotId:snap,sourceReconciled:true,seedVerified:true,
    sourceSheetVersion:3,sourceStateHash:checksum,
    stateHash:corrupt?'0'.repeat(64):checksum,version:0,state}]]:[]),
  ...(missing&&partial?[['campaignCloudRuntime/'+snap+'/houseTreasuries/'+hash('house:'+uid),
   {houseId:uid,sourceSnapshotId:snap,balance:42}]]:[]),
 ]);
 const calls=[];
 const fetcher=async (url,opts)=>{
  calls.push({url,method:opts.method});
  assert.equal(opts.method,'GET');
  assert.equal(opts.headers.Authorization,'Bearer temporary-oidc');
  if(denied)return {status:403};
  if(new URL(url).pathname==='/v1/projects/cormyr/databases/(default)')
   return {status:200};
  const path=new URL(url).pathname.split('/documents/')[1];
  let result;
  if(path==='migrationDomainStage'){
   result={documents:[document(base+'migrationDomainStage/'+snap,docs.get(
    'migrationDomainStage/'+snap))]};
  }else if(path==='migrationDomainStage/'+snap+'/houses'){
   result={documents:[document(base+path+'/stub',
    {sourceId:uid,active:true,season:2})]};
  }else if(docs.has(path)){
   result=document(base+path,docs.get(path));
  }else return {status:404};
  return {status:200,json:async()=>result};
 };
 return {fetcher,calls};
}
describe('aceite Cloud da Ficha com escopo de leitura',()=>{
 it('falha fechado em Firestore 403 e nunca envia escrita',async()=>{
  const m=mock({denied:true});
  const r=await auditHouseOpsCloud({fetcher:m.fetcher,
   tokenProvider:()=> 'temporary-oidc'});
  assert.equal(r.releaseDecision,'NO_GO');
  assert.equal(r.cloudReadHttp,403);
  assert.equal(r.databaseMetadataHttp,403);
  assert.ok(r.blockingCodes.includes('FIRESTORE_READER_UNAVAILABLE'));
  assert.equal(m.calls.length,2);
  assert.ok(m.calls.every(c=>c.method==='GET'));
 });
 it('identifica origem íntegra, mas não considera E2E de perfis homologado',async()=>{
  const m=mock();
  const r=await auditHouseOpsCloud({fetcher:m.fetcher,
   tokenProvider:()=> 'temporary-oidc'});
  assert.equal(r.scannedHouses,1);
  assert.equal(r.reconciledHouses,1);
  assert.equal(r.runtimeApproved,true);
  assert.equal(r.databaseMetadataHttp,200);
  assert.equal(r.calendarApproved,true);
  assert.equal(r.releaseDecision,'NO_GO');
  assert.deepEqual(r.blockingCodes,['AUTHENTICATED_ROLE_E2E_PENDING']);
  const summary=summarize(r);
  assert.doesNotMatch(summary,/house-a|a{64}|privateMedia|Bearer/);
 });
 it('detecta economia ausente, corrompida e aprovação ausente',async()=>{
  for(const opts of [{missing:true},{corrupt:true},{approved:false}]){
   const r=await auditHouseOpsCloud({fetcher:mock(opts).fetcher,
    tokenProvider:()=> 'temporary-oidc'});
   assert.equal(r.releaseDecision,'NO_GO');
   if(opts.missing){
    assert.equal(r.missingEconomies,1);
    assert.equal(r.missingPreflight.requiresNarratorReview,1);
   }
   if(opts.corrupt)assert.equal(r.invalidEconomies,1);
   if(opts.approved===false)
    assert.ok(r.blockingCodes.includes('HOUSE_WRITE_APPROVAL_MISSING'));
  }
 });
 it('classifica destinos parciais e descompasso temporal sem expor dados das Casas',async()=>{
  const cases=[
   [{missing:true,partial:true},'partialTargets'],
   [{missing:true,wrongMonth:true},'calendarMismatch'],
  ];
  for(const [opts,kind] of cases){
   const m=mock(opts);
   const r=await auditHouseOpsCloud({tokenProvider:()=> 'temporary-oidc',fetcher:m.fetcher});
   assert.equal(r.missingEconomies,1);
   assert.equal(r.missingPreflight[kind],1);
   assert.ok(m.calls.every(c=>c.method==='GET'));
   assert.doesNotMatch(summarize(r),/house-a|temporary-oidc|a{64}/);
  }
 });
 it('distingue rascunho e revisão de origem, sem divulgar identificação',async()=>{
  for(const [sourcePhase,field] of [['draft','draft'],['review','review']]){
   const m=mock({missing:true,sourcePhase});
   const r=await auditHouseOpsCloud({fetcher:m.fetcher,
    tokenProvider:()=> 'temporary-oidc'});
   assert.equal(r.missingPreflight.sourceNotReady,1);
   assert.equal(r.missingSourceReasons[field],1);
   assert.equal(r.releaseDecision,'NO_GO');
   assert.ok(m.calls.every(c=>c.method==='GET'));
   assert.doesNotMatch(summarize(r),/house-a|temporary-oidc|a{64}/);
  }
 });
 it('não consulta Cloud sem credencial OIDC de leitura',async()=>{
  const r=await auditHouseOpsCloud({tokenProvider:()=> '',
   fetcher:()=>{throw Error('unexpected network')}});
  assert.equal(r.releaseDecision,'NO_GO');
  assert.deepEqual(r.blockingCodes,['OIDC_UNAVAILABLE']);
 });
});
