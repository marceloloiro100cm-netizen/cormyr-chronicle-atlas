import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditHouseRulesCloud,summarizeHouseRules}
 from './house-rules-cloud-acceptance.mjs';
const snapshot='a'.repeat(64);
const hash=v=>createHash('sha256').update(v).digest('hex');
const base='projects/cormyr/databases/(default)/documents/';
const encode=v=>{
 if(v===null)return{nullValue:null};
 if(typeof v==='string')return{stringValue:v};
 if(typeof v==='boolean')return{booleanValue:v};
 if(typeof v==='number')return{integerValue:String(v)};
 if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(
  Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw Error('bad_fixture');
};
const doc=(path,value)=>({name:base+path,fields:Object.fromEntries(
 Object.entries(value).map(([k,v])=>[k,encode(v)]))});
function fixture({denied=false,invalid=false,approved=false,haveRule=false}={}){
 const path='campaignCloudRuntime/'+snapshot+'/houseRuleSets/'+hash('house:house-a')+'/rules';
 const rule=doc(path+'/'+hash('rule:fort'),{
  houseId:'house-a',itemId:'fort',version:1,updatedBy:'narrator-a',
  sourceSnapshotId:invalid?'b'.repeat(64):snapshot,
  definition:{id:'fort',custom:true,name:'Fortificação de teste'},
 });
 const values=new Map([
  ['migrationDomainStage',[doc('migrationDomainStage/'+snapshot,
   {status:'complete',private:true})]],
  ['migrationDomainStage/'+snapshot,{status:'complete',private:true}],
  ['migrationAuthStage/'+snapshot,{status:'complete',private:true}],
  ['campaignCloudRuntime/'+snapshot,{status:'active',private:true,
   sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,
   applicationEnabled:true,houseRulesWriteApproved:approved}],
  ['migrationDomainStage/'+snapshot+'/houses',[
   doc('migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a'),
    {sourceId:'house-a',active:true,season:2}),
  ]],
  [path,haveRule?[rule]:[]],
 ]);
 const calls=[];
 const fetcher=async (url,opts)=>{
  calls.push({url,opts});
  assert.equal(opts.method,'GET');
  assert.equal(opts.headers.Authorization,'Bearer oidc-token-for-test');
  if(denied)return{status:403};
  const pathValue=new URL(url).pathname.split('/documents/')[1];
  if(!values.has(pathValue))return{status:404};
  const item=values.get(pathValue);
  return {status:200,json:async()=>Array.isArray(item)?
   {documents:item}:doc(pathValue,item)};
 };
 return {fetcher,calls};
}
test('sem regras operacionais, valida o catálogo e mantém NO_GO até E2E',async()=>{
 const f=fixture();
 const r=await auditHouseRulesCloud({fetcher:f.fetcher,
  tokenProvider:()=> 'oidc-token-for-test'});
 assert.equal(r.housesChecked,1);
 assert.equal(r.operationalRules,0);
 assert.equal(r.invalidRules,0);
 assert.equal(r.stagesVerified,true);
 assert.equal(r.houseRulesWriteApproved,false);
 assert.equal(r.releaseDecision,'NO_GO');
 assert.ok(r.blockingCodes.includes('RULES_WRITE_APPROVAL_MISSING'));
 assert.ok(f.calls.every(c=>c.opts.method==='GET'));
 assert.doesNotMatch(summarizeHouseRules(r),/house-a|narrator-a|Fortificação|a{64}|oidc-token/);
});
test('regra íntegra e regra adulterada são distinguidas sem divulgar conteúdo',async()=>{
 for(const invalid of [false,true]){
  const f=fixture({haveRule:true,invalid,approved:true});
  const r=await auditHouseRulesCloud({fetcher:f.fetcher,
   tokenProvider:()=> 'oidc-token-for-test'});
  assert.equal(r.operationalRules,1);
  assert.equal(r.ruleHouses,1);
  assert.equal(r.invalidRules,Number(invalid));
  assert.equal(r.releaseDecision,'NO_GO');
 }
});
test('OIDC inválido ou IAM 403 não é tratado como dado vazio',async()=>{
 const denied=await auditHouseRulesCloud({fetcher:fixture({denied:true}).fetcher,
  tokenProvider:()=> 'oidc-token-for-test'});
 assert.equal(denied.cloudReadHttp,403);
 assert.equal(denied.housesChecked,0);
 const missing=await auditHouseRulesCloud({tokenProvider:()=> '',
  fetcher:()=>{throw Error('unexpected network')}});
 assert.deepEqual(missing.blockingCodes,['OIDC_UNAVAILABLE']);
});
