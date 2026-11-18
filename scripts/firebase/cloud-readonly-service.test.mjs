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
    async getUser(){return {uid:'user-1',disabled:false};}
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
  f.docs.set(root+'/letters/cloud-visible',{
    id:'cloud-visible',source:'firebase-cloud',senderUid:'player-b',
    originHouseId:'house-b',recipientKind:'house',recipientHouseId:'house-a',
    recipientPlayerId:null,publicationState:'delivered',deletedAt:null,
    subject:'TEST_PRIVATE_CLOUD_MAIL',content:'TEST_PRIVATE_CLOUD_CONTENT',
    createdAt:'2026-11-16T12:00:00Z',
  });
  const positive=(await f.service().listMailbox(token));
  assert.equal(positive.items.some(x=>x.id==='cloud-visible'),true);
  assert.equal(positive.items.find(x=>x.id==='cloud-visible').canReply,true);
  assert.equal(positive.items.find(x=>x.id==='to-a').canMarkRead,true);
  const approved=f.docs.get(mailRoot);
  for(const [key,value] of [
    ['status','pending'],['sourceLiveReconciled',false],
    ['mailEnabled',false],['calendarVersion',4],
    ['openRound',4],['sourceSnapshotId','b'.repeat(64)],
  ]){
    f.docs.set(mailRoot,{...approved,[key]:value});
    const blocked=await f.service().listMailbox(token);
    assert.equal(blocked.items.some(x=>x.id==='cloud-visible'),false);
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
    x.id==='cloud-visible'),false);
  f.docs.set(mailRoot,approved);
  f.docs.set(root,{...f.docs.get(root),calendarVersion:4});
  assert.equal((await f.service().listMailbox(token)).items.some(x=>
    x.id==='cloud-visible'),false);
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
  await rejects(()=>f.service().listSpyDossiers(token,'house-a'),
    'house_unavailable',404);
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
  await rejects(()=>f.service().listHouseBattles(token,'house-a'),
    'house_unavailable',404);
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
