import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirebaseCloudReadonly,CloudAccessError} from './cloud-readonly-service.mjs';
import {mailReceiptId} from './cloud-mail-receipt-core.mjs';

const snapshot='a'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const d=value=>({exists:value!==undefined,data:()=>value});
const scope=(profile,extra={})=>({
  userId:'user-1',profile,active:true,admin:profile==='narrador',
  requirePasswordChange:false,playerId:profile==='jogador'?'player-a':null,
  memberHouseIds:profile==='jogador'?['house-a']:[],
  editHouseIds:[],...extra,
});

function fixture(profile='jogador',extra={}){
  const docs=new Map();
  const stage=name=>docs.set(name+'/'+snapshot,{status:'complete',private:true});
  for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationNobleHouseStage','migrationTimeEngineStage',
    'migrationNewspaperRuntimeStage','migrationSpyStage','migrationBattleStage'])stage(name);
  docs.set('migrationDomainStage/'+snapshot+'/access/user-1',scope(profile,extra));
  docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a'),{
    sourceId:'house-a',name:'House A',active:true,castle:'A Keep',season:2
  });
  docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-b'),{
    sourceId:'house-b',name:'House B',active:true,castle:'B Keep',season:2
  });
  docs.set('migrationNobleHouseStage/'+snapshot+'/sheets/'+hash('noble-sheet:house-a'),{
    houseId:'house-a',state:{houseId:'house-a',wealth:5},version:3
  });
  docs.set('migrationTimeEngineStage/'+snapshot+'/calendar/current',{
    year:1522,month:1,day:10,festival:null,version:5
  });
  const addLetter=(id,overrides={})=>docs.set(
    'migrationDomainStage/'+snapshot+'/letters/'+hash('letter:'+id),{
      sourceId:id,subject:'Letter '+id,content:'Message '+id,
      createdAt:'2026-11-15T12:00:00Z',deletedAt:null,
      publicationState:'delivered',senderUid:'user-other',
      recipientHouseId:'house-a',recipientPlayerId:null,
      ...overrides,
    });
  addLetter('to-a');
  addLetter('to-b',{recipientHouseId:'house-b'});
  addLetter('to-person',{recipientHouseId:null,recipientPlayerId:'player-a'});
  addLetter('own-sent',{senderUid:'user-1',recipientHouseId:'house-b'});
  addLetter('draft',{publicationState:'draft'});
  addLetter('deleted',{deletedAt:'2026-11-16T00:00:00Z'});
  addLetter('ambiguous',{recipientHouseId:'house-a',recipientPlayerId:'player-a'});
  const paperRoot='migrationNewspaperRuntimeStage/'+snapshot+'/editions/';
  docs.set(paperRoot+'published',{
    id:'published',editionNo:2,title:'A Folha Sem Selo',subtitle:'Capa',
    state:'published',blocks:[{text:'Edição pública'}],
    publishedAt:'2026-11-15T13:00:00Z',cancelledAt:null,
  });
  docs.set(paperRoot+'private',{
    id:'private',editionNo:3,title:'Rascunho secreto',subtitle:'Não divulgar',
    state:'draft',blocks:[{text:'Privado'}],publishedAt:null,cancelledAt:null,
  });
  const spies='migrationSpyStage/'+snapshot+'/assets/';
  docs.set(spies+'own',{id:'own',codename:'Agente A',ownerHouseId:'house-a',
    status:'available',missionSuccesses:3,portraitId:null});
  docs.set(spies+'other',{id:'other',codename:'Agente B',ownerHouseId:'house-b',
    status:'operating',missionSuccesses:1,portraitId:null});
  const node=path=>({
    collection:name=>node(path?path+'/'+name:name),
    doc:id=>node(path+'/'+id),
    limit:n=>{assert.ok(n>0&&n<=251);return node(path);},
    async get(){
      if(docs.has(path))return d(docs.get(path));
      const entries=[...docs].filter(([key])=>
        key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')
      );
      if(entries.length)return {size:entries.length,
        docs:entries.map(([,value])=>d(value))};
      // Empty Firestore collections still return QuerySnapshot.docs=[].
      if(path.endsWith('/letters')||path.endsWith('/mailReadReceipts')||
         path.endsWith('/dossiers')||path.endsWith('/findings')||path.endsWith('/live'))
        return {size:0,docs:[]};
      return d(undefined);
    }
  });
  const auth={
    async verifyIdToken(token,revoked){
      assert.equal(revoked,true);
      if(token==='expired-token')throw Error('expired');
      return {uid:'user-1'};
    },
    async getUser(){return {uid:'user-1',disabled:false};},
    async listUsers(){
      const prefix='migrationDomainStage/'+snapshot+'/access/';
      return {users:[...docs.keys()]
        .filter(key=>key.startsWith(prefix)&&
          !key.slice(prefix.length).includes('/'))
        .map(key=>({uid:key.slice(prefix.length),disabled:false}))};
    }
  };
  const db={collection:name=>node(name)};
  const service=()=>createFirebaseCloudReadonly({
    auth,db,snapshotId:snapshot,projectId:'cormyr',enabled:true,env:{}
  });
  return {docs,auth,db,service};
}
/** Fixtures must explicitly approve BOTH runtime roots before Cloud mail appears. */
function approveCloudMailbox(f){
  const root='campaignCloudRuntime/'+snapshot;
  if(!f.docs.has(root))throw Error('cloud_runtime_fixture_missing');
  f.docs.set(root,{...f.docs.get(root),openRound:3,calendarVersion:5});
  f.docs.set('campaignMailRuntime/'+snapshot,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceLiveReconciled:true,applicationEnabled:true,mailEnabled:true,
    openRound:3,calendarVersion:5,
  });
}
const token='firebase-id-token-example';
const rejects=async(fn,code,status)=>{
  await assert.rejects(fn,error=>
    error instanceof CloudAccessError &&
    error.code===code&&error.status===status
  );
};

test('Cloud mode must be explicitly enabled; emulator and wrong project rejected',()=>{
  const {auth,db}=fixture();
  const base={auth,db,snapshotId:snapshot,projectId:'cormyr',env:{}};
  assert.throws(()=>createFirebaseCloudReadonly(base),/cloud_read_disabled/);
  assert.throws(()=>createFirebaseCloudReadonly({...base,enabled:true,projectId:'demo-cormyr-migration'}),/cloud_read_disabled/);
  assert.throws(()=>createFirebaseCloudReadonly({...base,enabled:true,env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}}),/cloud_read_disabled/);
  assert.throws(()=>createFirebaseCloudReadonly({...base,enabled:true,snapshotId:'bad'}),/cloud_read_disabled/);
});

test('Firebase ID token, enabled account and active scope required on each call',async()=>{
  const f=fixture();
  await rejects(()=>f.service().session('x'),'authentication_required',401);
  await rejects(()=>f.service().session('expired-token'),'authentication_required',401);
  f.auth.getUser=async()=>({uid:'user-1',disabled:true});
  await rejects(()=>f.service().session(token),'authentication_required',401);
  f.auth.getUser=async()=>({uid:'user-1',disabled:false});
  f.docs.set('migrationDomainStage/'+snapshot+'/access/user-1',scope('jogador',{active:false}));
  await rejects(()=>f.service().session(token),'access_denied',403);
  f.docs.set('migrationDomainStage/'+snapshot+'/access/user-1',scope('jogador',{requirePasswordChange:true}));
  await rejects(()=>f.service().session(token),'access_denied',403);
  f.docs.set('migrationDomainStage/'+snapshot,{status:'incomplete',private:true});
  await rejects(()=>f.service().session(token),'migration_stage_not_ready',503);
});

test('stale, absent and duplicated House memberships deny every private Cloud read',async()=>{
  const f=fixture('jogador');
  const scopePath='migrationDomainStage/'+snapshot+'/access/user-1';
  const housePath='migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a');
  const raw=f.docs.get(scopePath),original=f.docs.get(housePath);
  for(const bad of [
    {...raw,memberHouseIds:[],editHouseIds:[]},
    {...raw,memberHouseIds:['house-a','house-a'],editHouseIds:[]},
    {...raw,memberHouseIds:['unknown-house'],editHouseIds:[]},
    {...raw,memberHouseIds:['house-a'],editHouseIds:['house-a','house-a']},
  ]){
    f.docs.set(scopePath,bad);
    await rejects(()=>f.service().session(token),'invalid_access_scope',403);
    await rejects(()=>f.service().listMailbox(token),'invalid_access_scope',403);
  }
  f.docs.set(scopePath,raw);
  for(const changes of [
    {active:false},{season:1},{sourceId:'house-b'},
  ]){
    f.docs.set(housePath,{...original,...changes});
    await rejects(()=>f.service().session(token),'invalid_access_scope',403);
    await rejects(()=>f.service().getHouse(token,'house-a'),'invalid_access_scope',403);
  }
  f.docs.delete(housePath);
  await rejects(()=>f.service().session(token),'invalid_access_scope',403);
  const narrator=fixture('narrador');
  // A narrator has no House membership, but remains separately authorized.
  assert.equal((await narrator.service().session(token)).profile,'narrador');
});

test('Player can see own house, not other houses, with read-only state',async()=>{
  const f=fixture();
  const srv=f.service();
  assert.deepEqual(await srv.session(token),{
    authenticated:true,profile:'jogador',memberHouseIds:['house-a'],
    readOnly:true,snapshotReconciliationPending:true
  });
  const house=await srv.getHouse(token,'house-a');
  assert.equal(house.state.wealth,5);
  assert.equal(house.readOnly,true);
  await rejects(()=>srv.getHouse(token,'house-b'),'access_denied',403);
  await rejects(()=>srv.getHouse(token,'../other'),'invalid_house',400);
  const list=await srv.listHouses(token);
  assert.equal(list.length,2);
  assert.ok(list.every(h=>!('state' in h)));
  assert.deepEqual(await srv.getCalendar(token),{
    year:1522,month:1,day:10,festival:null,version:5,
    readOnly:true,snapshotReconciliationPending:true
  });
});

test('Editor has no house access; Narrator requires server-side admin bit',async()=>{
  const editor=fixture('editor');
  await rejects(()=>editor.service().getHouse(token,'house-a'),'access_denied',403);
  await rejects(()=>editor.service().getCalendar(token),'access_denied',403);
  const narrator=fixture('narrador');
  const srv=narrator.service();
  assert.equal((await srv.getHouse(token,'house-a')).state.wealth,5);
  narrator.docs.set('migrationDomainStage/'+snapshot+'/access/user-1',
    scope('narrador',{admin:false}));
  await rejects(()=>srv.session(token),'access_denied',403);
});

test('Invalid group scopes are not trusted, and missing house sheet fails closed',async()=>{
  const f=fixture('jogador',{editHouseIds:['house-b']});
  await rejects(()=>f.service().session(token),'invalid_access_scope',403);
  f.docs.set('migrationDomainStage/'+snapshot+'/access/user-1',scope('jogador'));
  f.docs.delete('migrationNobleHouseStage/'+snapshot+'/sheets/'+hash('noble-sheet:house-a'));
  await rejects(()=>f.service().getHouse(token,'house-a'),'house_sheet_unavailable',404);
});

test('Narrator alone can inspect pending accounts without changing historic access',async()=>{
  const f=fixture('narrador');
  const root='migrationDomainStage/'+snapshot+'/access/';
  for(let i=2;i<=14;i++){
    const uid='account-'+i;
    const changes={
      userId:uid,profile:'jogador',active:true,admin:false,
      requirePasswordChange:false,playerId:'player-'+i,
      memberHouseIds:['house-a'],editHouseIds:['house-a'],
    };
    if(i===2)changes.active=false;
    if(i===3){changes.profile=null;changes.memberHouseIds=[];changes.editHouseIds=[];}
    if(i===4){changes.memberHouseIds=[];changes.editHouseIds=[];}
    if(i===5)changes.requirePasswordChange=true;
    f.docs.set(root+uid,changes);
  }
  f.auth.getUser=async uid=>({
    uid,email:uid+'@example.invalid',disabled:false,
  });
  const before=JSON.stringify([...f.docs]);
  const report=await f.service().listAccessRemediation(token);
  assert.equal(report.accountsChecked,14);
  assert.equal(report.pendingAccounts,4);
  assert.equal(report.issues.inactive,1);
  assert.equal(report.issues.missingProfile,1);
  assert.equal(report.issues.playerWithoutHouse,1);
  assert.equal(report.issues.passwordChangePending,1);
  assert.equal(report.readOnly,true);
  assert.equal(report.sourceImmutable,true);
  assert.equal(report.readyForRemediation,false);
  assert.equal(report.authWrites,0);
  assert.equal(report.firestoreWrites,0);
  assert.equal(report.items.length,4);
  assert.ok(report.items.every(row=>
    row.uid.startsWith('account-')&&row.email.endsWith('@example.invalid')));
  assert.ok(report.items.every(row=>row.issues.length>0));
  assert.ok(!JSON.stringify(report).includes('user-1@example.invalid'));
  assert.equal(JSON.stringify([...f.docs]),before);
  const player=fixture('jogador');
  await rejects(()=>player.service().listAccessRemediation(token),'access_denied',403);
  const editor=fixture('editor');
  await rejects(()=>editor.service().listAccessRemediation(token),'access_denied',403);
});

test('Narrator pending access report fails closed on partial or spoofed inventory',async()=>{
  const f=fixture('narrador');
  await rejects(()=>f.service().listAccessRemediation(token),
    'access_inventory_unverified',503);
  const root='migrationDomainStage/'+snapshot+'/access/';
  for(let i=2;i<=14;i++){
    f.docs.set(root+'account-'+i,{
      userId:'account-'+i,profile:'jogador',active:i!==2,
      admin:false,requirePasswordChange:false,playerId:null,
      memberHouseIds:['house-a'],editHouseIds:['house-a'],
    });
  }
  // A provider mapping mismatch must not expose a partial list.
  f.auth.getUser=async()=>({uid:'another-uid',email:'SECRET_ACCOUNT_EMAIL'});
  await rejects(()=>f.service().listAccessRemediation(token),
    'authentication_required',401);
  f.auth.getUser=async uid=>uid==='user-1'
    ?{uid,disabled:false}
    :{uid:'wrong-uid',email:'SECRET_ACCOUNT_EMAIL',disabled:false};
  await rejects(()=>f.service().listAccessRemediation(token),
    'access_inventory_unverified',503);
  // Even the Narrator cannot inspect when their account is suspended.
  f.docs.set(root+'user-1',scope('narrador',{active:false}));
  await rejects(()=>f.service().listAccessRemediation(token),'access_denied',403);
});

test('Narrator remediation identifies deactivated or outdated House memberships',async()=>{
  const f=fixture('narrador');
  const root='migrationDomainStage/'+snapshot+'/access/';
  for(let i=2;i<=14;i++){
    const uid='player-'+i;
    f.docs.set(root+uid,{
      userId:uid,profile:'jogador',admin:false,active:true,
      requirePasswordChange:false,playerId:uid,
      memberHouseIds:['house-a'],editHouseIds:['house-a'],
    });
  }
  f.auth.getUser=async uid=>({uid,email:uid+'@example.invalid',disabled:false});
  const base=await f.service().listAccessRemediation(token);
  assert.equal(base.issues.invalidScope,0);
  assert.equal(base.pendingAccounts,0);
  const housePath='migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a');
  const current=f.docs.get(housePath);
  f.docs.set(housePath,{...current,season:1});
  const report=await f.service().listAccessRemediation(token);
  assert.equal(report.issues.invalidScope,13);
  assert.equal(report.pendingAccounts,13);
  assert.ok(report.items.every(item=>item.issues.includes('invalidScope')));
  assert.equal(report.firestoreWrites,0);
  assert.equal(report.authWrites,0);
  f.docs.set(housePath,{...current,active:false});
  assert.equal((await f.service().listAccessRemediation(token)).issues.invalidScope,13);
});

test('narrator dry-run uses server House catalog and never changes access',async()=>{
  const f=fixture('narrador');
  const root='migrationDomainStage/'+snapshot;
  f.docs.set(root+'/access/account-2',{
    userId:'account-2',profile:null,active:false,
    admin:false,requirePasswordChange:true,
    memberHouseIds:[],editHouseIds:[],playerId:null,
  });
  for(let i=2;i<10;i++)f.docs.set(root+'/houses/'+hash('house:house-'+i),{
    sourceId:'house-'+i,name:'House '+i,active:true,season:2,
  });
  f.docs.set(root+'/houses/'+hash('house:old'),{
    sourceId:'house-old',name:'Old House',active:false,season:1,
  });
  const original=JSON.stringify([...f.docs]);
  f.auth.getUser=async uid=>({uid,disabled:false,
    email:uid+'@example.invalid'});
  const decision={profile:'jogador',active:true,
    memberHouseIds:['house-a'],editHouseIds:['house-a'],
    manualReviewConfirmed:true};
  const r=await f.service().previewAccessRemediation(token,'account-2',decision);
  assert.equal(r.mode,'preview-only');
  assert.equal(r.checked,true);
  assert.equal(r.proposedProfile,'jogador');
  assert.equal(r.proposedMemberHouseCount,1);
  assert.equal(r.requiresPasswordResetProof,true);
  assert.equal(r.passwordFlagCleared,false);
  assert.equal(r.adminGranted,false);
  assert.equal(r.roleGranted,false);
  assert.equal(r.decisionApplied,false);
  assert.equal(r.firestoreWrites,0);
  assert.equal(r.authWrites,0);
  assert.equal(r.readyForPlayers,false);
  assert.ok(r.blockingCodes.includes('PASSWORD_RESET_PROOF_PENDING'));
  assert.ok(!JSON.stringify(r).includes('account-2'));
  assert.ok(!JSON.stringify(r).includes('house-a'));
  assert.equal(JSON.stringify([...f.docs]),original);
  await rejects(()=>f.service().previewAccessRemediation(
    token,'account-2',{...decision,admin:true}),
    'invalid_access_decision',400);
  await rejects(()=>f.service().previewAccessRemediation(
    token,'account-2',{...decision,memberHouseIds:['house-old'],
      editHouseIds:[]}),
    'invalid_access_decision',400);
  await rejects(()=>f.service().previewAccessRemediation(
    token,'user-1',decision),
    'invalid_access_decision',400);
  const player=fixture('jogador');
  await rejects(()=>player.service().previewAccessRemediation(
    token,'account-2',decision),'access_denied',403);
  const editor=fixture('editor');
  await rejects(()=>editor.service().previewAccessRemediation(
    token,'account-2',decision),'access_denied',403);
});

test('source link audit is Narrator-only and pending before workspace import',async()=>{
 const player=fixture('jogador');
 await rejects(()=>player.service().inspectWorkspaceLinks(token),'access_denied',403);
 const editor=fixture('editor');
 await rejects(()=>editor.service().inspectWorkspaceLinks(token),'access_denied',403);
 const gm=fixture('narrador');
 const report=await gm.service().inspectWorkspaceLinks(token);
 assert.equal(report.status,'pending');
 assert.equal(report.operationalConnected,false);
});

test('original mail workspace scope is checked against live Auth and House stage',async()=>{
 const player=fixture('jogador');
 const scope=await player.service().workspaceMailScope(token);
 assert.deepEqual(scope,{uid:'user-1',profile:'jogador',
  playerId:'player-a',memberHouseIds:['house-a']});
 const gm=fixture('narrador');
 assert.equal((await gm.service().workspaceMailScope(token)).profile,'narrador');
 const editor=fixture('editor');
 await rejects(()=>editor.service().workspaceMailScope(token),'access_denied',403);
 const noPlayer=fixture('jogador',{playerId:null});
 await rejects(()=>noPlayer.service().workspaceMailScope(token),'access_denied',403);
});

test('only the Narrator may inspect imported workspace metadata',async()=>{
 const f=fixture('jogador');
 await rejects(()=>f.service().inspectWorkspaceImport(token),'access_denied',403);
 const editor=fixture('editor');
 await rejects(()=>editor.service().inspectWorkspaceImport(token),'access_denied',403);
 const gm=fixture('narrador');
 const pending=await gm.service().inspectWorkspaceImport(token);
 assert.equal(pending.status,'pending');
 assert.equal(pending.operationalConnected,false);
 const root='campaignWorkspaceImports/'+snapshot;
 gm.docs.set(root,{status:'complete',private:true,formatVersion:1,
  sourceSnapshotId:snapshot,counts:{campaign_letters:1}});
 gm.docs.set(root+'/tables/campaign_letters',{rowCount:1,
  sourceTableDocumentId:'archive-table-1',columns:['id','subject']});
 const complete=await gm.service().inspectWorkspaceImport(token);
 assert.equal(complete.status,'complete');
 assert.equal(complete.rowsImported,1);
 assert.equal(complete.relationshipsVerified,false);
 gm.docs.set(root+'/tables/campaign_letters',{rowCount:2,
  sourceTableDocumentId:'archive-table-1',columns:['id','subject']});
 await rejects(()=>gm.service().inspectWorkspaceImport(token),
  'workspace_integrity_unverified',503);
});

test('Mailbox includes delivered own correspondence and excludes other-house, drafts, deleted and ambiguous',async()=>{
  const f=fixture('jogador');
  const messages=await f.service().listMailbox(token);
  assert.equal(messages.totalVisible,3);
  assert.equal(messages.items.length,3);
  assert.deepEqual(new Set(messages.items.map(m=>m.id)),
    new Set(['to-a','to-person','own-sent']));
  assert.ok(messages.items.every(m=>!('publicationState' in m)));
  const editor=fixture('editor');
  await rejects(()=>editor.service().listMailbox(token),'access_denied',403);
});

test('Imported narrator letters are private to Narrator and their actual sender',async()=>{
  const path='migrationDomainStage/'+snapshot+'/letters/'+hash('letter:to-narrator');
  const original={
    sourceId:'to-narrator',recipientKind:'narrator',
    recipientPlayerId:null,recipientHouseId:null,senderUid:'user-other',
    subject:'Original narrator letter',content:'Private historical content',
    createdAt:'2026-11-15T13:00:00Z',deletedAt:null,publicationState:'delivered',
  };
  const gm=fixture('narrador');
  gm.docs.set(path,original);
  assert.equal((await gm.service().listMailbox(token)).items.some(x=>x.id==='to-narrator'),true);
  const player=fixture('jogador');
  player.docs.set(path,original);
  assert.equal((await player.service().listMailbox(token)).items.some(x=>x.id==='to-narrator'),false);
  player.docs.set(path,{...original,senderUid:'user-1'});
  assert.equal((await player.service().listMailbox(token)).items.some(x=>x.id==='to-narrator'),true);
  const editor=fixture('editor');
  editor.docs.set(path,original);
  await rejects(()=>editor.service().listMailbox(token),'access_denied',403);
});

test('Newspaper reveals published contents but never drafts or revisions',async()=>{
  const f=fixture('jogador');
  const summary=await f.service().listNewspaper(token);
  assert.equal(summary.items.length,1);
  assert.equal(summary.items[0].id,'published');
  const paper=await f.service().getNewspaper(token,'published');
  assert.deepEqual(paper.blocks,[{text:'Edição pública'}]);
  await rejects(()=>f.service().getNewspaper(token,'private'),'edition_unavailable',404);
  await rejects(()=>f.service().getNewspaper(token,'/private'),'invalid_edition',400);
});

test('Spy agent list requires authorized house; editorial user is denied',async()=>{
  const f=fixture('jogador');
  const mine=await f.service().listSpyAgents(token,'house-a');
  assert.equal(mine.items.length,1);
  assert.equal(mine.items[0].codename,'Agente A');
  await rejects(()=>f.service().listSpyAgents(token,'house-b'),'access_denied',403);
  const editor=fixture('editor');
  await rejects(()=>editor.service().listSpyAgents(token,'house-a'),'access_denied',403);
  const narrator=fixture('narrador');
  assert.equal((await narrator.service().listSpyAgents(token,'house-b')).items.length,1);
});

test('Incomplete protected newspaper and spy stages fail closed',async()=>{
  const f=fixture();
  f.docs.set('migrationNewspaperRuntimeStage/'+snapshot,
    {status:'incomplete',private:true});
  await rejects(()=>f.service().listNewspaper(token),'migration_stage_not_ready',503);
  f.docs.set('migrationSpyStage/'+snapshot,
    {status:'incomplete',private:true});
  await rejects(()=>f.service().listSpyAgents(token,'house-a'),
    'migration_stage_not_ready',503);
});

test('Approved Cloud messages merge only with recipient House, sender or narrator',async()=>{
  const f=fixture('jogador');
  const root='campaignCloudRuntime/'+snapshot;
  f.docs.set(root,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,mailWriteApproved:true,applicationEnabled:true,
  });
  approveCloudMailbox(f);
  function add(id,data){
    f.docs.set(root+'/letters/'+id,{
      id,source:'firebase-cloud',senderUid:'external-author',
      senderName:'Jogador',subject:'CLOUD '+id,content:'private '+id,
      createdAt:'2026-11-16T01:00:00.000Z',
      deliveredAt:'2026-11-16T01:00:00.000Z',
      campaignDate:'1522-01-10',publicationState:'delivered',
      deletedAt:null,recipientPlayerId:null,recipientHouseId:'house-a',
      recipientKind:'house',...data,
    });
  }
  add('to-a',{});
  add('to-b',{recipientHouseId:'house-b'});
  add('own-sent',{senderUid:'user-1',recipientHouseId:'house-b'});
  add('to-gm',{senderUid:'user-1',recipientKind:'narrator',
    recipientHouseId:null});
  add('deleted',{deletedAt:'2026-11-16T02:00:00Z'});
  add('draft',{publicationState:'draft'});
  const player=(await f.service().listMailbox(token)).items.map(x=>x.id);
  assert.equal(player.includes('to-a'),true);
  assert.equal(player.includes('own-sent'),true);
  assert.equal(player.includes('to-gm'),true);
  assert.equal(player.includes('to-b'),false);
  assert.equal(player.includes('deleted'),false);
  assert.equal(player.includes('draft'),false);
  const narrator=fixture('narrador');
  for(const [key,value] of f.docs)
    if(key.startsWith(root)||key==='campaignMailRuntime/'+snapshot)
      narrator.docs.set(key,value);
  const gm=(await narrator.service().listMailbox(token)).items.map(x=>x.id);
  assert.equal(gm.includes('to-b'),true);
  assert.equal(gm.includes('to-gm'),true);
});

test('Mail runtime mismatch hides new mail and disables receipts/replies',async()=>{
  const f=fixture('jogador',{editHouseIds:['house-a']});
  const root='campaignCloudRuntime/'+snapshot;
  const mailRoot='campaignMailRuntime/'+snapshot;
  f.docs.set(root,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,mailWriteApproved:true,applicationEnabled:true,
  });
  approveCloudMailbox(f);
  const visibleId=hash('reply:cloud-visible');
  f.docs.set(root+'/letters/'+visibleId,{
    id:visibleId,source:'firebase-cloud',sourceSnapshotId:snapshot,
    senderUid:'player-b',
    originHouseId:'house-b',recipientKind:'house',recipientHouseId:'house-a',
    recipientPlayerId:null,publicationState:'delivered',deletedAt:null,
    subject:'TEST_PRIVATE_CLOUD_MAIL',content:'TEST_PRIVATE_CLOUD_CONTENT',
    createdAt:'2026-11-16T12:00:00Z',
  });
  const positive=(await f.service().listMailbox(token));
  assert.equal(positive.items.some(x=>x.id===visibleId),true);
  assert.equal(positive.items.find(x=>x.id===visibleId).canReply,true);
  assert.equal(positive.items.find(x=>x.id==='to-a').canMarkRead,true);
  const approved=f.docs.get(mailRoot);
  for(const [key,value] of [
    ['status','pending'],['sourceLiveReconciled',false],
    ['mailEnabled',false],['calendarVersion',4],
    ['openRound',4],['sourceSnapshotId','b'.repeat(64)],
  ]){
    f.docs.set(mailRoot,{...approved,[key]:value});
    const blocked=await f.service().listMailbox(token);
    assert.equal(blocked.items.some(x=>x.id===visibleId),false);
    assert.equal(blocked.items.find(x=>x.id==='to-a').canMarkRead,false);
    assert.equal(blocked.items.find(x=>x.id==='to-a').readAt,null);
    assert.equal(blocked.items.some(x=>x.canReply===true),false);
    assert.equal(blocked.items.some(x=>x.id==='to-a'),true);
    const body=JSON.stringify(blocked);
    assert.equal(body.includes('TEST_PRIVATE_CLOUD_MAIL'),false);
    assert.equal(body.includes('TEST_PRIVATE_CLOUD_CONTENT'),false);
  }
  f.docs.delete(mailRoot);
  assert.equal((await f.service().listMailbox(token)).items.some(x=>
    x.id===visibleId),false);
  f.docs.set(mailRoot,approved);
  f.docs.set(root,{...f.docs.get(root),calendarVersion:4});
  assert.equal((await f.service().listMailbox(token)).items.some(x=>
    x.id===visibleId),false);
});

test('Unapproved Cloud runtime never leaks messages through historical mailbox',async()=>{
  const f=fixture();
  const root='campaignCloudRuntime/'+snapshot;
  f.docs.set(root,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:false,mailWriteApproved:true,
    applicationEnabled:true,
  });
  f.docs.set(root+'/letters/hidden',{
    id:'hidden',source:'firebase-cloud',senderUid:'user-1',
    subject:'HIDDEN',content:'private',createdAt:'2026-11-16T00:00:00Z',
    publicationState:'delivered',deletedAt:null,recipientKind:'narrator',
    recipientHouseId:null,recipientPlayerId:null,
  });
  const messages=(await f.service().listMailbox(token)).items;
  assert.equal(messages.some(x=>x.id==='hidden'),false);
});

test('Cloud inbox returns only the viewer own receipt; never another user status',async()=>{
  const f=fixture('jogador');
  const root='campaignCloudRuntime/'+snapshot;
  f.docs.set(root,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,mailWriteApproved:true,applicationEnabled:true,
  });
  approveCloudMailbox(f);
  const id='to-a';
  const wrongId=mailReceiptId('other-viewer','imported',id);
  f.docs.set(root+'/mailReadReceipts/'+wrongId,{
    source:'imported',letterId:id,viewerUid:'other-viewer',
    readAt:'2026-11-16T10:00:00.000Z',
  });
  const first=await f.service().listMailbox(token);
  const mail=first.items.find(v=>v.id===id);
  assert.equal(mail.source,'imported');
  assert.equal(mail.canMarkRead,true);
  assert.equal(mail.readAt,null);
  const own=mailReceiptId('user-1','imported',id);
  f.docs.set(root+'/mailReadReceipts/'+own,{
    source:'imported',letterId:id,viewerUid:'user-1',
    readAt:'2026-11-16T11:00:00.000Z',
  });
  const second=await f.service().listMailbox(token);
  assert.equal(second.items.find(v=>v.id===id).readAt,
    '2026-11-16T11:00:00.000Z');
  const outgoing=second.items.find(v=>v.id==='own-sent');
  assert.equal(outgoing.canMarkRead,false);
  assert.equal(outgoing.readAt,null);
  f.docs.set(root,{...f.docs.get(root),mailWriteApproved:false});
  const blocked=await f.service().listMailbox(token);
  assert.equal(blocked.items.find(v=>v.id===id).canMarkRead,false);
  assert.equal(blocked.items.find(v=>v.id===id).readAt,null);
});


test('Spy dossiers expose own House verified findings, not foreign House secrets',async()=>{
  const f=fixture('jogador');
  const root='migrationSpyStage/'+snapshot+'/';
  f.docs.set(root+'dossiers/dos-a',{
    id:'dos-a',ownerHouseId:'house-a',targetHouseId:'house-b',
    createdAt:'2026-11-15T12:00:00Z',
  });
  f.docs.set(root+'dossiers/dos-b',{
    id:'dos-b',ownerHouseId:'house-b',targetHouseId:'house-a',
  });
  f.docs.set(root+'findings/f-a',{
    id:'f-a',dossierId:'dos-a',objective:'house_resources',
    subjectKey:'wealth',valueSnapshot:{wealth:7},
    discoveredDateKey:'1522-01-10',verifiedDateKey:'1522-01-10',
  });
  f.docs.set(root+'findings/f-b',{
    id:'f-b',dossierId:'dos-b',objective:'army',
    subjectKey:'secret-army',valueSnapshot:{units:999},
    verifiedDateKey:'1522-01-11',
  });
  f.docs.set(root+'findings/f-draft',{
    id:'f-draft',dossierId:'missing-dossier',objective:'possessions',
    subjectKey:'gm-unreleased',valueSnapshot:{secret:'never deliver'},
  });
  f.docs.set(root+'adminAudit/audit-1',{
    id:'audit-1',dossierId:'dos-a',
    secretGmNote:'SECRET_GM_AUDIT_DONT_INCLUDE',
  });
  const result=await f.service().listSpyDossiers(token,'house-a');
  assert.equal(result.ownerHouseId,'house-a');
  assert.deepEqual(result.items.map(d=>d.targetHouseId),['house-b']);
  assert.equal(result.items[0].findings.length,1);
  assert.deepEqual(result.items[0].findings[0].valueSnapshot,{wealth:7});
  assert.ok(!JSON.stringify(result).includes('secret-army'));
  assert.ok(!JSON.stringify(result).includes('SECRET_GM_AUDIT_DONT_INCLUDE'));
  assert.ok(!JSON.stringify(result).includes('gm-unreleased'));
  await rejects(()=>f.service().listSpyDossiers(token,'house-b'),'access_denied',403);
  await rejects(()=>f.service().listSpyDossiers(token,'../secret'),'invalid_house',400);
  const editor=fixture('editor');
  await rejects(()=>editor.service().listSpyDossiers(token,'house-a'),'access_denied',403);
  const gm=fixture('narrador');
  for(const [path,value] of f.docs)
    if(path.startsWith(root))gm.docs.set(path,value);
  const ownGM=await gm.service().listSpyDossiers(token,'house-b');
  assert.deepEqual(ownGM.items.map(d=>d.targetHouseId),['house-a']);
  assert.equal(ownGM.items[0].findings[0].subjectKey,'secret-army');
});

test('Spy dossier query fails closed when stage is incomplete or House inactive',async()=>{
  const f=fixture('jogador');
  f.docs.set('migrationSpyStage/'+snapshot,{status:'incomplete',private:true});
  await rejects(()=>f.service().listSpyDossiers(token,'house-a'),
    'migration_stage_not_ready',503);
  f.docs.set('migrationSpyStage/'+snapshot,{status:'complete',private:true});
  f.docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a'),{
    sourceId:'house-a',active:false,
  });
  // The global membership guard denies stale scope BEFORE the spy route.
  await rejects(()=>f.service().listSpyDossiers(token,'house-a'),
    'invalid_access_scope',403);
});

test('Spy dossier returns empty without exposing unpublished operations',async()=>{
  const f=fixture('jogador');
  const root='migrationSpyStage/'+snapshot+'/';
  f.docs.set(root+'operations/private',{
    id:'private',ownerHouseId:'house-a',secretMission:'underway',
  });
  const result=await f.service().listSpyDossiers(token,'house-a');
  assert.deepEqual(result.items,[]);
  assert.ok(!JSON.stringify(result).includes('underway'));
});

test('Spy dossier output has a bounded response size',async()=>{
  const f=fixture('jogador');
  const root='migrationSpyStage/'+snapshot+'/';
  f.docs.set(root+'dossiers/dos',{
    id:'dos',ownerHouseId:'house-a',targetHouseId:'house-b',
  });
  for(let i=0;i<9;i++)f.docs.set(root+'findings/'+i,{
    id:'f'+i,dossierId:'dos',objective:'possessions',
    subjectKey:'item-'+i,valueSnapshot:{description:'A'.repeat(31000)},
  });
  await rejects(()=>f.service().listSpyDossiers(token,'house-a'),
    'spy_dossier_response_too_large',503);
});


test('Cloud editions are readable only after separate runtime approval and remain isolated from drafts',async()=>{
  const f=fixture('editor');
  const runtime='campaignCloudRuntime/'+snapshot;
  const published=runtime+'/publishedNewspapers/cloud-allowed';
  const draft=runtime+'/publishedNewspapers/cloud-hidden';
  const approved={
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    newspaperWriteApproved:true,newspaperSequenceReconciled:true,
  };
  f.docs.set(runtime,approved);
  f.docs.set(published,{
    id:'cloud-allowed',source:'firebase-cloud',sourceSnapshotId:snapshot,
    title:'Nova Folha',subtitle:'Notícias de Cormyr',editionNo:4,
    publishedAt:'2026-11-16T14:00:00Z',cancelledAt:null,
    state:'published',blocks:[{type:'article',text:'Edição Nova'}],
  });
  f.docs.set(draft,{
    id:'cloud-hidden',source:'firebase-cloud',sourceSnapshotId:snapshot,
    title:'Segredo Editorial',editionNo:5,state:'draft',publishedAt:null,
    blocks:[{type:'article',text:'Nunca revelar'}],
  });
  let list=await f.service().listNewspaper(token);
  assert.ok(list.items.some(e=>e.id==='published'));
  assert.ok(list.items.some(e=>e.id==='cloud-allowed'));
  assert.ok(!list.items.some(e=>e.id==='cloud-hidden'));
  const original=f.docs.get(published);
  f.docs.set(published,{...original,state:'archived'});
  assert.equal((await f.service().getNewspaper(token,'cloud-allowed')).state,'archived');
  assert.ok((await f.service().listNewspaper(token)).items.some(e=>e.id==='cloud-allowed'));
  f.docs.set(published,{...original,state:'cancelled',cancelledAt:'2026-11-18T22:00:00Z'});
  assert.ok(!(await f.service().listNewspaper(token)).items.some(e=>e.id==='cloud-allowed'));
  await rejects(()=>f.service().getNewspaper(token,'cloud-allowed'),'edition_unavailable',404);
  f.docs.set(published,original);
  const open=await f.service().getNewspaper(token,'cloud-allowed');
  assert.equal(open.blocks[0].text,'Edição Nova');
  await rejects(()=>f.service().getNewspaper(token,'cloud-hidden'),'edition_unavailable',404);
  f.docs.set(runtime,{...approved,newspaperWriteApproved:false});
  list=await f.service().listNewspaper(token);
  assert.ok(!list.items.some(e=>e.id==='cloud-allowed'));
  await rejects(()=>f.service().getNewspaper(token,'cloud-allowed'),'edition_unavailable',404);
  f.docs.set(runtime,{...approved,sourceSnapshotId:'other-snapshot'});
  list=await f.service().listNewspaper(token);
  assert.ok(!list.items.some(e=>e.id==='cloud-allowed'));
});

test('Cloud inbox exposes reply control only for the receiving House, not senders or foreign Houses',async()=>{
  const f=fixture('jogador',{editHouseIds:['house-a']});
  const root='campaignCloudRuntime/'+snapshot;
  f.docs.set(root,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,mailWriteApproved:true,applicationEnabled:true,
  });
  approveCloudMailbox(f);
  const add=(tag,changes={})=>{
    const id=hash('reply:'+tag);
    f.docs.set(root+'/letters/'+id,{
      id,source:'firebase-cloud',sourceSnapshotId:snapshot,
      senderUid:'player-b',originHouseId:'house-b',
      recipientKind:'house',recipientHouseId:'house-a',recipientPlayerId:null,
      publicationState:'delivered',deletedAt:null,
      subject:'Carta '+tag,content:'Texto',
      createdAt:'2026-11-16T12:00:00Z',...changes,
    });
    return id;
  };
  const incoming=add('incoming');
  const outgoing=add('own',{senderUid:'user-1',recipientHouseId:'house-b',
    originHouseId:'house-a'});
  const foreign=add('foreign',{recipientHouseId:'house-b',originHouseId:'house-a'});
  const draft=add('draft',{publicationState:'draft'});
  const mailbox=await f.service().listMailbox(token);
  assert.equal(mailbox.items.find(x=>x.id===incoming).canReply,true);
  assert.equal(mailbox.items.find(x=>x.id===outgoing).canReply,false);
  assert.equal(mailbox.items.some(x=>x.id===foreign),false);
  assert.equal(mailbox.items.some(x=>x.id===draft),false);
  assert.ok(mailbox.items.filter(x=>x.source==='imported').every(x=>x.canReply===false));
  f.docs.set(root,{...f.docs.get(root),sourceSnapshotReconciled:false});
  assert.ok((await f.service().listMailbox(token)).items.every(x=>x.canReply===false));
});

test('Battle summaries expose only authorized participating House, never replay state',async()=>{
  const f=fixture('jogador');
  const root='migrationBattleStage/'+snapshot+'/';
  f.docs.set(root+'live/own',{
    id:'own',title:'Batalha na Fronteira',status:'active',
    attackerHouseId:'house-a',defenderHouseId:'house-b',
    stateVersion:3,createdAt:'2026-11-16T10:00:00Z',
    stateHash:'SECRET_HASH_DO_NOT_DISPLAY',
    tacticalOrders:'SECRET_ORDERS_DO_NOT_DISPLAY',
  });
  f.docs.set(root+'live/foreign',{
    id:'foreign',title:'Batalha Estrangeira',status:'active',
    attackerHouseId:'house-b',defenderHouseId:'house-c',
    stateVersion:2,createdAt:'2026-11-16T12:00:00Z',
  });
  f.docs.set(root+'live/invalid',{
    id:'invalid',title:'Batalha incompleta',status:'hidden',
    attackerHouseId:'house-a',defenderHouseId:'house-b',
    stateVersion:1,
  });
  f.docs.set(root+'liveReplays/own',{
    matchId:'own',json:'SECRET_REPLAY_DO_NOT_DISPLAY'
  });
  const result=await f.service().listHouseBattles(token,'house-a');
  assert.equal(result.houseId,'house-a');
  assert.deepEqual(result.items.map(x=>x.id),['own']);
  assert.equal(result.readOnly,true);
  assert.equal(result.totalVisible,1);
  for(const secret of ['SECRET_HASH','SECRET_ORDERS','SECRET_REPLAY',
    'Batalha Estrangeira']){
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  await rejects(()=>f.service().listHouseBattles(token,'house-b'),
    'access_denied',403);
  await rejects(()=>f.service().listHouseBattles(token,'../foreign'),
    'invalid_house',400);
  const editor=fixture('editor');
  await rejects(()=>editor.service().listHouseBattles(token,'house-a'),
    'access_denied',403);
  const gm=fixture('narrador');
  for(const [key,value] of f.docs){
    if(key.startsWith(root))gm.docs.set(key,value);
  }
  const narratorResult=await gm.service().listHouseBattles(token,'house-b');
  assert.deepEqual(narratorResult.items.map(x=>x.id),['foreign','own']);
});

test('Battle stage is mandatory; empty verified stage shows empty overview',async()=>{
  const f=fixture();
  const root='migrationBattleStage/'+snapshot;
  f.docs.set(root,{status:'incomplete',private:true});
  await rejects(()=>f.service().listHouseBattles(token,'house-a'),
    'migration_stage_not_ready',503);
  f.docs.set(root,{status:'complete',private:true});
  const result=await f.service().listHouseBattles(token,'house-a');
  assert.equal(result.totalVisible,0);
  assert.deepEqual(result.items,[]);
  f.docs.set('migrationDomainStage/'+snapshot+'/houses/'+hash('house:house-a'),
    {sourceId:'house-a',active:false});
  // The global membership guard denies stale scope BEFORE battle data.
  await rejects(()=>f.service().listHouseBattles(token,'house-a'),
    'invalid_access_scope',403);
});

test('Oversized battle catalog fails closed instead of exposing unbounded rows',async()=>{
  const f=fixture();
  const root='migrationBattleStage/'+snapshot+'/live/';
  for(let i=0;i<251;i++){
    f.docs.set(root+i,{
      id:'match-'+i,title:'Exercito nao homologado',status:'active',
      stateVersion:0,attackerHouseId:'house-a',defenderHouseId:'house-b',
    });
  }
  await rejects(()=>f.service().listHouseBattles(token,'house-a'),
    'battle_catalog_too_large',503);
});

test('Narrator safely excludes one deleted legacy Auth account from pending review',async()=>{
  const f=fixture('narrador');
  const root='migrationDomainStage/'+snapshot+'/access/';
  for(let i=2;i<=14;i++){
    const uid='account-'+i;
    f.docs.set(root+uid,{
      userId:uid,profile:'jogador',active:i!==2,
      admin:false,requirePasswordChange:false,playerId:uid,
      memberHouseIds:['house-a'],editHouseIds:['house-a'],
    });
  }
  f.docs.set(root+'account-3',{
    userId:'account-3',profile:null,active:false,admin:false,
    requirePasswordChange:false,playerId:null,
    memberHouseIds:[],editHouseIds:[],
  });
  const originalList=f.auth.listUsers;
  f.auth.listUsers=async()=>{
    const inventory=await originalList();
    return {users:inventory.users.filter(u=>u.uid!=='account-3')};
  };
  f.auth.getUser=async uid=>{
    if(uid==='account-3')throw Error('auth/user-not-found');
    return {uid,email:uid+'@example.invalid',disabled:false};
  };
  const report=await f.service().listAccessRemediation(token);
  assert.equal(report.historicalAccountsChecked,14);
  assert.equal(report.accountsChecked,13);
  assert.equal(report.archivedHistoricalAccess,1);
  assert.equal(report.deletionIdentityApproved,false);
  assert.equal(report.pendingAccounts,1);
  assert.equal(report.issues.inactive,1);
  assert.equal(report.issues.missingProfile,0);
  assert.equal(report.archivedIdentityUid,'account-3');
  assert.equal(report.deletionIdentityApproved,false);
  const player=fixture('jogador');
  await rejects(()=>player.service().listAccessRemediation(token),
    'access_denied',403);
  assert.equal(report.authWrites,0);
  assert.equal(report.firestoreWrites,0);
});
test('Narrator pending-account review rejects unlinked or disabled current Auth users',async()=>{
  const f=fixture('narrador');
  const root='migrationDomainStage/'+snapshot+'/access/';
  for(let i=2;i<=14;i++)
    f.docs.set(root+'account-'+i,{
      userId:'account-'+i,profile:'jogador',active:true,admin:false,
      requirePasswordChange:false,playerId:null,
      memberHouseIds:['house-a'],editHouseIds:[],
    });
  const valid=f.auth.listUsers;
  f.auth.listUsers=async()=>({
    users:(await valid()).users.slice(0,13).concat({
      uid:'unlinked-new-user',disabled:false}),
  });
  await rejects(()=>f.service().listAccessRemediation(token),
    'access_inventory_unverified',503);
  f.auth.listUsers=async()=>({
    users:(await valid()).users.map((u,i)=>({...u,disabled:i===1})),
  });
  await rejects(()=>f.service().listAccessRemediation(token),
    'access_inventory_unverified',503);
});

test('historical privileged deletion is never silently archived in narrator review',async()=>{
  for(const protectedField of ['admin','profile','memberHouseIds','editHouseIds']){
    const f=fixture('narrador');
    const prefix='migrationDomainStage/'+snapshot+'/access/';
    for(let i=2;i<=14;i++)
      f.docs.set(prefix+'account-'+i,{
        userId:'account-'+i,profile:'jogador',active:true,admin:false,
        requirePasswordChange:false,playerId:null,
        memberHouseIds:[],editHouseIds:[],
      });
    const absent=f.docs.get(prefix+'account-14');
    if(protectedField==='admin')absent.admin=true;
    if(protectedField==='profile')absent.profile='editor';
    if(protectedField==='memberHouseIds')absent.memberHouseIds=['house-a'];
    if(protectedField==='editHouseIds')absent.editHouseIds=['house-a'];
    f.docs.set(prefix+'account-14',absent);
    const original=f.auth.listUsers;
    f.auth.listUsers=async()=>({
      users:(await original()).users.filter(u=>u.uid!=='account-14'),
    });
    f.auth.getUser=async uid=>({uid,disabled:false});
    await rejects(()=>f.service().listAccessRemediation(token),
      'access_inventory_unverified',503);
  }
});

