import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCloudAccountAccess,accountAuditSummary} from './accounts-cloud-readiness.mjs';
const snap='a'.repeat(64),base='projects/cormyr/databases/(default)/documents/';
const hash=v=>createHash('sha256').update(v).digest('hex');
const encode=v=>{
 if(v===null)return{nullValue:null};
 if(typeof v==='boolean')return{booleanValue:v};
 if(typeof v==='string')return{stringValue:v};
 if(typeof v==='number')return{integerValue:String(v)};
 if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(
  Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw Error('invalid_fixture');
};
const doc=(path,obj)=>({name:base+path,fields:Object.fromEntries(
 Object.entries(obj).map(([k,v])=>[k,encode(v)]))});
const createFixture=({denied=false,revoked=false,incomplete=false}={})=>{
 const paths=new Map([
  ['migrationDomainStage',[
   doc('migrationDomainStage/'+snap,{status:'complete',private:true})]],
  ['migrationDomainStage/'+snap,{status:'complete',private:true}],
  ['campaignCloudRuntime/'+snap,{status:'active',private:true,
   applicationEnabled:true,sourceSnapshotId:snap,sourceSnapshotReconciled:true}],
  ['migrationDomainStage/'+snap+'/access',[
   doc('migrationDomainStage/'+snap+'/access/gm',{userId:'gm',profile:'narrador',admin:true,
    active:!revoked,requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]}),
   doc('migrationDomainStage/'+snap+'/access/player',{userId:'player',profile:'jogador',
    admin:false,active:true,requirePasswordChange:true,
    memberHouseIds:incomplete?[]:['house-a'],editHouseIds:[],
    attrHouseIds:[]}),
  ]],
  ['campaignCloudRuntime/'+snap+'/accountAccess',[]],
  ['migrationDomainStage/'+snap+'/houses',[
   doc('migrationDomainStage/'+snap+'/houses/'+hash('house:house-a'),
    {sourceId:'house-a',active:true,season:2}),
  ]],
 ]);
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method});
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer readonly-credential');
  if(denied)return{status:403};
  const path=new URL(url).pathname.split('/documents/')[1];
  const value=paths.get(path);
  if(value===undefined)return{status:404};
  return{status:200,json:async()=>Array.isArray(value)?{documents:value}:
   doc(path,value)};
 };
 return{fetcher,calls};
};
test('snapshot e acessos são auditados somente em contagens, sem informações privadas',async()=>{
 const f=createFixture();
 const r=await auditCloudAccountAccess({fetcher:f.fetcher,
  tokenProvider:()=> 'readonly-credential'});
 assert.equal(r.runtimeReconciled,true);
 assert.equal(r.sourceAccounts,2);
 assert.equal(r.activeAccess,2);
 assert.equal(r.mustChangePassword,1);
 assert.equal(r.roleCounts.narrador,1);
 assert.equal(r.roleCounts.jogador,1);
 assert.equal(r.invalidAccessRecords,0);
 assert.equal(r.releaseDecision,'NO_GO');
 assert.deepEqual(r.blockingCodes,[
  'AUTH_ADMIN_INVENTORY_PENDING','AUTHENTICATED_ACCOUNT_E2E_PENDING']);
 assert.ok(f.calls.every(x=>x.method==='GET'));
 const summary=accountAuditSummary(r);
 assert.doesNotMatch(summary,/house-a|player|readonly-credential|a{64}|@/);
});
test('perfis incompletos e revogações permanecem visíveis sem ativar conta',async()=>{
 const f=createFixture({revoked:true,incomplete:true});
 const r=await auditCloudAccountAccess({fetcher:f.fetcher,
  tokenProvider:()=> 'readonly-credential'});
 assert.equal(r.inactiveAccess,1);
 assert.equal(r.playersWithoutHouse,1);
 assert.ok(r.blockingCodes.includes('INCOMPLETE_PLAYER_PROFILES'));
 assert.equal(r.releaseDecision,'NO_GO');
});
test('IAM negado falha fechado sem qualquer gravação',async()=>{
 const f=createFixture({denied:true});
 const r=await auditCloudAccountAccess({fetcher:f.fetcher,
  tokenProvider:()=> 'readonly-credential'});
 assert.deepEqual(r.blockingCodes,['SOURCE_UNAVAILABLE']);
 assert.equal(r.sourceAccounts,0);
 assert.ok(f.calls.every(x=>x.method==='GET'));
});
test('sem OIDC não faz qualquer chamada Cloud',async()=>{
 const r=await auditCloudAccountAccess({tokenProvider:()=> '',
  fetcher:()=>{throw Error('must not fetch')}});
 assert.deepEqual(r.blockingCodes,['OIDC_UNAVAILABLE']);
});
