import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCloudRoleLinkage} from './cloud-role-linkage-readonly.mjs';

const HASH='a'.repeat(64);
const BASE='https://firestore.googleapis.com/v1/projects/cormyr/databases/(default)/documents/';
const PREFIX='projects/cormyr/databases/(default)/documents/migrationDomainStage/';
const AUTH='https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000';
const rootUrl=BASE+'migrationDomainStage?pageSize=2&mask.fieldPaths=status&mask.fieldPaths=private';
const accessPrefix=BASE+'migrationDomainStage/'+HASH+'/access?';
const housesPrefix=BASE+'migrationDomainStage/'+HASH+'/houses?';
const houseDoc=(id,active=true,season=2)=>({
  name:PREFIX+HASH+'/houses/'+('a'.repeat(63)+String(id.length%10)),
  fields:{
    sourceId:{stringValue:id},active:{booleanValue:active},
    season:{integerValue:String(season)},
  },
});
const field={
  text:v=>({stringValue:v}),
  bool:v=>({booleanValue:v}),
  list:values=>({arrayValue:{values:values.map(v=>({stringValue:v}))}}),
};
const uids=['PRIVATE_UID_ONE','PRIVATE_UID_TWO','PRIVATE_UID_THREE'];
const accessRow=(uid,role,options={})=>({
  name:PREFIX+HASH+'/access/'+uid,
  fields:{
    userId:field.text(uid),profile:field.text(role),
    active:field.bool(true),admin:field.bool(role==='narrador'),
    requirePasswordChange:field.bool(false),
    memberHouseIds:field.list(role==='jogador'?['PRIVATE_HOUSE_ID']:[]),
    editHouseIds:field.list(role==='jogador'?['PRIVATE_HOUSE_ID']:[]),
    ...options,
  },
});
function fixture({
  root={documents:[{name:PREFIX+HASH,fields:{
    status:field.text('complete'),private:field.bool(true),
  }}]},
  auth={users:uids.map(localId=>({
    localId,disabled:true,email:'never.print@example.test',
  }))},
  access={documents:[
    accessRow(uids[0],'narrador'),
    accessRow(uids[1],'jogador'),
    accessRow(uids[2],'editor'),
  ]},
  houses={documents:[houseDoc('PRIVATE_HOUSE_ID')]},
  statuses={},
}={}){
  const requests=[];
  const fetcher=async(url,options)=>{
    requests.push({url,options});
    const data=url===rootUrl?root:
      url===AUTH?auth:
      url.startsWith(accessPrefix)?access:
      url.startsWith(housesPrefix)?houses:undefined;
    const status=statuses[url===rootUrl?'root':url===AUTH?'auth':
      url.startsWith(accessPrefix)?'access':'houses']??
      (data===undefined?404:200);
    if(status!==200)return new Response('PRIVATE_GOOGLE_ERROR_MESSAGE',{status});
    return Response.json(data);
  };
  return {
    requests,
    run:()=>inspectCloudRoleLinkage({
      tokenProvider:async()=> 'SENSITIVE_EPHEMERAL_OPERATOR_TOKEN',
      fetcher,
    }),
  };
}

test('joins private Auth accounts to access docs by exact UID and produces only aggregate counts',async()=>{
  const f=fixture();
  const report=await f.run();
  assert.equal(report.firestoreHttpStatus,200);
  assert.equal(report.authHttpStatus,200);
  assert.equal(report.accessHttpStatus,200);
  assert.equal(report.accounts,3);
  assert.equal(report.disabledAccounts,3);
  assert.equal(report.linkedAccounts,3);
  assert.equal(report.unlinkedAccounts,0);
  assert.equal(report.structurallyEligibleProfiles,3);
  assert.deepEqual(report.profileCounts,{
    narrador:1,jogador:1,editor:1,other:0,
  });
  assert.deepEqual(report.structurallyEligibleByProfile,{
    narrador:1,jogador:1,editor:1,other:0,
  });
  assert.deepEqual(report.structurallyIneligibleByProfile,{
    narrador:0,jogador:0,editor:0,other:0,
  });
  assert.ok(Object.values(report.blockingReasonCounts).every(n=>n===0));
  assert.equal(report.houseCatalogHttpStatus,200);
  assert.equal(report.houseReferenceAuditComplete,true);
  assert.equal(report.houseCatalogCount,1);
  assert.equal(report.activeSeason2Houses,1);
  assert.equal(report.playerHouseReferencesTotal,1);
  assert.equal(report.unresolvedPlayerHouseReferences,0);
  assert.equal(report.playersWithUnresolvedHouseReferences,0);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.equal(report.readyForCutover,false);
  assert.equal(report.writes,0);
  assert.equal(f.requests.length,4);
  assert.ok(f.requests.every(x=>x.options.method==='GET'&&
    x.options.credentials==='omit'&&x.options.redirect==='error'));
  assert.equal(f.requests.find(x=>x.url===AUTH)
    .options.headers['X-Goog-User-Project'],'cormyr');
  assert.ok(f.requests.some(x=>x.url.startsWith(accessPrefix)&&
    x.url.includes('mask.fieldPaths=admin')));
  const safe=JSON.stringify(report);
  for(const secret of [HASH,...uids,'PRIVATE_HOUSE_ID',
    'never.print@example.test','SENSITIVE_EPHEMERAL_OPERATOR_TOKEN']){
    assert.ok(!safe.includes(secret));
  }
});

test('missing, mismatched and inactive profile records cannot be accepted',async()=>{
  const f=fixture({access:{documents:[
    accessRow(uids[0],'narrador',{admin:field.bool(false)}),
    accessRow(uids[1],'jogador',{active:field.bool(false)}),
    accessRow('OTHER_PRIVATE_UID','editor'),
  ]}});
  const report=await f.run();
  assert.equal(report.accounts,3);
  assert.equal(report.linkedAccounts,2);
  assert.equal(report.unlinkedAccounts,1);
  assert.equal(report.unmatchedAccessDocuments,1);
  assert.equal(report.structurallyEligibleProfiles,0);
  assert.equal(report.readyForCutover,false);
});

test('a 403 at root or Auth does not fetch private access records',async()=>{
  for(const statuses of [{root:403},{auth:403}]){
    const f=fixture({statuses});
    const report=await f.run();
    assert.equal(report.accessHttpStatus,null);
    assert.equal(report.linkedAccounts,null);
    assert.equal(report.readyForCutover,false);
    assert.ok(!f.requests.some(x=>x.url.startsWith(accessPrefix)));
    assert.ok(!JSON.stringify(report).includes('PRIVATE_GOOGLE_ERROR_MESSAGE'));
  }
});

test('root with multiple snapshots or paginated Auth never joins an arbitrary account',async()=>{
  const one={name:PREFIX+HASH,fields:{
    status:field.text('complete'),private:field.bool(true),
  }};
  const fixtures=[
    fixture({root:{documents:[one,{...one,name:PREFIX+'b'.repeat(64)}]}}),
    fixture({auth:{users:uids.map(localId=>({localId,disabled:true})),
      nextPageToken:'NEVER_PRINT_PRIVATE_PAGE_TOKEN'}}),
  ];
  for(const f of fixtures){
    const report=await f.run();
    assert.equal(report.accessHttpStatus,null);
    assert.equal(report.readyForCutover,false);
    assert.ok(!f.requests.some(x=>x.url.startsWith(accessPrefix)));
    assert.ok(!JSON.stringify(report).includes('NEVER_PRINT_PRIVATE_PAGE_TOKEN'));
  }
});

test('unknown or duplicate UID and incomplete access pagination are fail-closed',async()=>{
  const duplicate=fixture({auth:{users:[
    {localId:uids[0],disabled:true},{localId:uids[0],disabled:true},
  ]}});
  const a=await duplicate.run();
  assert.equal(a.authListComplete,false);
  assert.equal(a.accessHttpStatus,null);
  const pages=fixture({access:{documents:[accessRow(uids[0],'narrador')],
    nextPageToken:'PRIVATE_PAGE_TOKEN'}});
  const b=await pages.run();
  assert.equal(b.accessListComplete,false);
  assert.equal(b.linkedAccounts,null);
  assert.equal(b.readyForCutover,false);
  assert.ok(!JSON.stringify(b).includes('PRIVATE_PAGE_TOKEN'));
});


test('aggregate role diagnostics explain structural blockers without exposing identities',async()=>{
  const moreUids=['PRIVATE_FOUR','PRIVATE_FIVE'];
  const f=fixture({
    auth:{users:[...uids,...moreUids].map(localId=>({
      localId,email:'NO_EXPORT@example.test',disabled:true,
    }))},
    access:{documents:[
      accessRow(uids[0],'narrador',{admin:field.bool(false)}),
      accessRow(uids[1],'jogador',{
        active:field.bool(false),
        memberHouseIds:field.list([]),editHouseIds:field.list([]),
      }),
      accessRow(uids[2],'editor',{
        requirePasswordChange:field.bool(true),
        memberHouseIds:field.list(['PRIVATE_HOUSE_A']),
        editHouseIds:field.list(['PRIVATE_HOUSE_B']),
      }),
      accessRow(moreUids[0],'none',{
        profile:{nullValue:null},
      }),
      accessRow(moreUids[1],'observer'),
    ]},
  });
  const report=await f.run();
  assert.deepEqual(report.profileCounts,{
    narrador:1,jogador:1,editor:1,other:2,
  });
  assert.deepEqual(report.structurallyEligibleByProfile,{
    narrador:0,jogador:0,editor:0,other:0,
  });
  assert.deepEqual(report.structurallyIneligibleByProfile,{
    narrador:1,jogador:1,editor:1,other:2,
  });
  assert.deepEqual(report.blockingReasonCounts,{
    missingProfile:1,unrecognizedProfile:1,
    accessInactiveOrInvalid:1,passwordChangePendingOrInvalid:1,
    adminFlagMismatch:1,invalidHouseLists:0,
    editScopeOutsideMembership:1,playerWithoutHouse:1,
    editorWithHouse:1,
  });
  assert.equal(report.structurallyEligibleProfiles,0);
  assert.equal(report.linkedAccounts,5);
  assert.equal(report.readyForCutover,false);
  assert.equal(report.writes,0);
  const safe=JSON.stringify(report);
  for(const val of [...uids,...moreUids,'PRIVATE_HOUSE_A',
    'PRIVATE_HOUSE_B','NO_EXPORT@example.test','SENSITIVE_EPHEMERAL_OPERATOR_TOKEN']){
    assert.ok(!safe.includes(val));
  }
});

test('incomplete Auth or access pages do not report reason breakdowns',async()=>{
  for(const opts of [
    {auth:{users:[{localId:uids[0],disabled:true}],
      nextPageToken:'PRIVATE_TOKEN'}},
    {statuses:{access:403}},
  ]){
    const report=await fixture(opts).run();
    assert.equal(report.blockingReasonCounts,null);
    assert.equal(report.structurallyEligibleByProfile,null);
    assert.equal(report.structurallyIneligibleByProfile,null);
    assert.equal(report.readyForCutover,false);
  }
});


test('unresolved, inactive and wrong-season House links are only reported in aggregate',async()=>{
  const f=fixture({
    houses:{documents:[houseDoc('PRIVATE_HOUSE_ID',false,2)]},
  });
  const report=await f.run();
  assert.equal(report.houseReferenceAuditComplete,true);
  assert.equal(report.houseCatalogCount,1);
  assert.equal(report.activeSeason2Houses,0);
  assert.equal(report.playerHouseReferencesTotal,1);
  assert.equal(report.unresolvedPlayerHouseReferences,1);
  assert.equal(report.playersWithUnresolvedHouseReferences,1);
  assert.equal(report.releaseDecision,'NO_GO');
  assert.ok(!JSON.stringify(report).includes('PRIVATE_HOUSE_ID'));
});

test('incomplete House list keeps reference metrics unknown, not falsely zero',async()=>{
  for(const config of [
    {statuses:{houses:403}},
    {houses:{documents:[],nextPageToken:'PRIVATE_PAGE_TOKEN'}},
    {houses:{documents:[houseDoc('PRIVATE_HOUSE_ID'),houseDoc('PRIVATE_HOUSE_ID')]}},
  ]){
    const report=await fixture(config).run();
    assert.equal(report.houseReferenceAuditComplete,false);
    assert.equal(report.unresolvedPlayerHouseReferences,null);
    assert.equal(report.playersWithUnresolvedHouseReferences,null);
    assert.equal(report.readyForCutover,false);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_PAGE_TOKEN'));
  }
});
