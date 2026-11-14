import test from 'node:test';
import assert from 'node:assert/strict';
import * as n from './newspaper-core.mjs';

const ID='11111111-1111-4111-8111-111111111111';
const KEY='22222222-2222-4222-8222-222222222222';
const acc=o=>({userId:'u',active:true,requirePasswordChange:false,profile:'jogador',admin:false,
  playerId:'p',memberHouseIds:['hA'],editHouseIds:['hA'],...o});
const narrator=n.newspaperScope({uid:'u',access:acc({profile:'narrador',admin:true,playerId:null})});
const leo=n.newspaperScope({uid:'u',access:acc(),player:{userId:'u',name:'  Leonardo ',active:true,
  requirePasswordChange:false,rosterHouseId:'espiao'}});
const plain=n.newspaperScope({uid:'u',access:acc()});
const code=(fn)=>{try{fn();}catch(e){return e.code;}return null;};
const draft=()=>n.createEdition({input:{campaignDate:'1522-01-05'},actorUid:'u',id:ID,editionNo:1,now:'2026-01-01T00:00:00.000Z'});

test('authorization: narrator or Leonardo of the spy house edit; players read', () => {
  assert.equal(narrator.canEdit,true);
  assert.equal(leo.canEdit,true);
  assert.equal(plain.canEdit,false);
  assert.equal(plain.canRead,true);
  const otherHouse=n.newspaperScope({uid:'u',access:acc(),player:{userId:'u',name:'leonardo',active:true,
    requirePasswordChange:false,rosterHouseId:'outra'}});
  assert.equal(otherHouse.canEdit,false);
  assert.equal(code(()=>n.newspaperScope({uid:'u',access:acc({requirePasswordChange:true})})),'denied');
  assert.equal(code(()=>n.newspaperScope({uid:'u',access:acc({active:false})})),'denied');
  assert.equal(n.newspaperScope({uid:'u',access:acc({playerId:null})}).canRead,false);
});

test('dates and ordinals follow newspaper_date_ordinal', () => {
  assert.equal(n.dateOrdinal('1522-01-05'),1522*100000+10);
  assert.equal(n.dateOrdinal('1522-F-midsummer'),1522*100000+6000+61);
  assert.equal(n.dateOrdinal('1522-F-shieldmeet'),1522*100000+6000+62);
  assert.equal(n.dateOrdinal('x'),null);
  assert.equal(n.todayOf({year:1522,month:0,day:5,festival:null}),'1522-01-05');
  assert.equal(n.todayOf({year:1522,month:6,day:30,festival:'midsummer'}),'1522-F-midsummer');
});

test('create forces draft, v1, revision 0 and validates fields', () => {
  const e=draft();
  assert.equal(e.state,'draft');assert.equal(e.version,1);assert.equal(e.publicationRevision,0);
  assert.equal(e.title,n.DEFAULT_TITLE);
  assert.equal(code(()=>n.createEdition({input:{campaignDate:'1522-01-05',state:'published'},actorUid:'u',id:ID,editionNo:1})),'denied');
  assert.equal(code(()=>n.createEdition({input:{campaignDate:'1522-13-01'},actorUid:'u',id:ID,editionNo:1})),'invalid');
  assert.equal(code(()=>n.createEdition({input:{campaignDate:'1522-01-05',pdfPath:'other/x.pdf'},actorUid:'u',id:ID,editionNo:1})),'invalid');
  assert.equal(code(()=>n.createEdition({input:{campaignDate:'1522-01-05',blocks:new Array(81).fill({})},actorUid:'u',id:ID,editionNo:1})),'invalid');
  assert.equal(code(()=>n.createEdition({input:{campaignDate:'1522-01-05',fontStyle:'comic'},actorUid:'u',id:ID,editionNo:1})),'invalid');
});

test('update: version, publication_revision, timestamps, audit snapshot', () => {
  const e=draft();
  const pub=n.applyEditionUpdate({current:e,patch:{state:'published'},actorUid:'v',now:'2026-02-01T00:00:00.000Z'});
  assert.equal(pub.next.version,2);assert.equal(pub.next.publicationRevision,1);
  assert.equal(pub.next.publishedAt,'2026-02-01T00:00:00.000Z');
  assert.equal(pub.revision.previousVersion,1);assert.equal(pub.revision.snapshot.state,'draft');
  // content change while published advances the revision
  const edit=n.applyEditionUpdate({current:pub.next,patch:{title:'Novo'},actorUid:'v'});
  assert.equal(edit.next.publicationRevision,2);
  // unchanged content does not
  const same=n.applyEditionUpdate({current:edit.next,patch:{publishOn:null},actorUid:'v'});
  assert.equal(same.next.publicationRevision,2);
  // published -> archived keeps revision, stamps archivedAt
  const arch=n.applyEditionUpdate({current:same.next,patch:{state:'archived'},actorUid:'v',now:'2026-03-01T00:00:00.000Z'});
  assert.equal(arch.next.publicationRevision,2);assert.equal(arch.next.archivedAt,'2026-03-01T00:00:00.000Z');
  // archived -> published bumps revision
  const back=n.applyEditionUpdate({current:arch.next,patch:{state:'published'},actorUid:'v'});
  assert.equal(back.next.publicationRevision,3);
  // draft cannot jump to archived; identity is immutable; stale version conflicts
  assert.equal(code(()=>n.applyEditionUpdate({current:e,patch:{state:'archived'},actorUid:'v'})),'invalid');
  assert.equal(code(()=>n.applyEditionUpdate({current:e,patch:{editionNo:9},actorUid:'v'})),'invalid');
  assert.equal(code(()=>n.applyEditionUpdate({current:e,patch:{version:7},actorUid:'v'})),'conflict');
  const cancelled=n.applyEditionUpdate({current:e,patch:{state:'cancelled'},actorUid:'v',now:'2026-04-01T00:00:00.000Z'});
  assert.equal(cancelled.next.cancelledAt,'2026-04-01T00:00:00.000Z');
});

test('visibility and read receipts', () => {
  const e=draft();
  assert.equal(n.canSeeEdition(plain,e),false);
  assert.equal(n.canSeeEdition(narrator,e),true);
  const p={...e,state:'published',publicationRevision:2};
  assert.equal(n.canSeeEdition(plain,p),true);
  assert.equal(n.markRead({scope:plain,edition:p}).readVersion,2);
  assert.equal(code(()=>n.markRead({scope:plain,edition:e})),'invalid');
  assert.equal(code(()=>n.markRead({scope:n.newspaperScope({uid:'u',access:acc({playerId:null})}),edition:p})),'denied');
});

test('lowest free edition number is reused', () => {
  assert.equal(n.nextEditionNo([]),1);
  assert.equal(n.nextEditionNo([{editionNo:1},{editionNo:3}]),2);
});

test('scheduled publication needs the date and content', () => {
  const e=(o)=>({...draft(),blocks:[{kind:'text'}],publishOn:'1522-01-05',...o});
  const list=[e({id:'a'}),e({id:'b',publishOn:'1522-01-06'}),e({id:'c',blocks:[]}),e({id:'d',state:'published'}),
    e({id:'f',blocks:[],pdfPath:ID+'/x.pdf'}),e({id:'g',publishOn:null})];
  assert.deepEqual(n.dueEditions({editions:list,today:'1522-01-05'}).map(x=>x.id),['a','f']);
  assert.deepEqual(n.dueEditions({editions:list,today:null}),[]);
});

test('publishing settles only pending commissions named in the blocks', () => {
  const e={...draft(),state:'published',blocks:[{commissionId:'c1'},{commissionId:'c2'},{kind:'text'}]};
  const cs=[{id:'c1',state:'pending'},{id:'c2',state:'rejected'},{id:'c3',state:'pending'}];
  const r=n.settleCommissions({edition:e,commissions:cs,now:'t'});
  assert.deepEqual(r.map(c=>c.id),['c1']);assert.equal(r[0].newspaperId,ID);assert.equal(r[0].state,'published');
  assert.deepEqual(n.settleCommissions({edition:{...e,state:'draft'},commissions:cs}),[]);
});

const sheet=(state,version=3)=>({houseId:'hA',version,state:{phase:'active',month:4,base:{wealth:5},
  permanent:{wealth:0},...state}});
const story=(o={})=>n.commissionStory({scope:plain,houseId:'hA',title:'Titulo',body:'Corpo da noticia longo',
  imagePath:null,key:KEY,sheet:sheet({}),existingByKey:null,ledgerKeyTaken:false,pendingCount:0,newId:()=>ID,
  now:'t',...o});

test('commission debits one permanent Wealth with ledger and idempotency', () => {
  const r=story();
  assert.equal(r.sheet.state.permanent.wealth,-1);
  assert.equal(r.sheet.version,4);
  assert.equal(r.ledger.action,'newspaper_commission');assert.equal(r.ledger.campaignMonth,4);
  assert.equal(r.ledger.operationKey,KEY);assert.equal(r.commission.state,'pending');
  assert.equal(r.result.remainingWealthEstimate,4);
  const again=story({existingByKey:{id:'x',houseId:'hA'}});
  assert.equal(again.alreadyApplied,true);assert.equal(again.houseVersion,3);
  assert.equal(code(()=>story({existingByKey:{id:'x',houseId:'hB'}})),'conflict');
  assert.equal(code(()=>story({ledgerKeyTaken:true})),'conflict');
  assert.equal(code(()=>story({pendingCount:3})),'invalid');
});

test('commission authorization, validation and available Wealth', () => {
  assert.equal(code(()=>story({scope:n.newspaperScope({uid:'u',access:acc({editHouseIds:[]})})})),'denied');
  assert.equal(story({scope:narrator}).alreadyApplied,false);
  assert.equal(code(()=>story({title:'ab'})),'invalid');
  assert.equal(code(()=>story({body:'curto'})),'invalid');
  assert.equal(code(()=>story({imagePath:'hB/x.png'})),'invalid');
  assert.equal(code(()=>story({sheet:{...sheet({}),state:{...sheet({}).state,phase:'draft'}}})),'invalid');
  assert.equal(code(()=>story({sheet:sheet({base:{wealth:0}})})),'invalid');
  // allocated costs reduce the available Wealth
  const held=sheet({base:{wealth:2},holdings:[{status:'active',allocatedCosts:{wealth:2}}]});
  assert.equal(code(()=>story({sheet:held})),'invalid');
  const units=sheet({base:{wealth:2},units:[{destroyed:false,costs:[{resource:'wealth',mode:'allocation',amount:1}]}]});
  assert.equal(story({sheet:units}).result.remainingWealthEstimate,0);
  const region=sheet({regionalApplied:true,method:'rolled',identity:{region:'Dragon Coast'},base:{wealth:0}});
  assert.equal(n.wealthAvailable(region.state).available,20);
  const imported=sheet({regionalApplied:true,method:'import',identity:{region:'Dragon Coast'},base:{wealth:0}});
  assert.equal(n.wealthAvailable(imported.state).available,0);
  const cons=sheet({base:{wealth:0},mailConsequences:[{active:true,changes:{wealth:2}},{active:false,changes:{wealth:9}}]});
  assert.equal(n.wealthAvailable(cons.state).available,2);
  const destroyed=sheet({base:{wealth:3},holdings:[{status:'destroyed',allocatedCosts:{wealth:2}},
    {status:'destroyed',lostAllocation:true,allocatedCosts:{wealth:1}}]});
  assert.equal(n.wealthAvailable(destroyed.state).available,1);
});

test('rejection refunds Wealth once and needs a note', () => {
  const c={id:ID,houseId:'hA',title:'T',state:'pending',costWealth:1};
  const s=sheet({permanent:{wealth:-1}});
  const r=n.rejectCommission({scope:narrator,commission:c,note:' sem espaço ',sheet:s,ledgerKey:KEY,now:'t'});
  assert.equal(r.sheet.state.permanent.wealth,0);assert.equal(r.commission.state,'rejected');
  assert.equal(r.commission.rejectionNote,'sem espaço');assert.equal(r.ledger.action,'newspaper_commission_refund');
  assert.equal(code(()=>n.rejectCommission({scope:plain,commission:c,note:'abc',sheet:s,ledgerKey:KEY})),'denied');
  assert.equal(code(()=>n.rejectCommission({scope:narrator,commission:c,note:'a',sheet:s,ledgerKey:KEY})),'invalid');
  assert.equal(code(()=>n.rejectCommission({scope:narrator,commission:{...c,state:'rejected'},note:'abc',sheet:s,ledgerKey:KEY})),'invalid');
});

test('seen marks answered commissions of the house only', () => {
  const cs=[{id:'1',houseId:'hA',state:'rejected',seenAt:null},{id:'2',houseId:'hA',state:'pending',seenAt:null},
    {id:'3',houseId:'hB',state:'published',seenAt:null},{id:'4',houseId:'hA',state:'published',seenAt:'x'}];
  assert.deepEqual(n.markCommissionsSeen({scope:plain,houseId:'hA',commissions:cs,now:'t'}).map(c=>c.id),['1']);
  assert.equal(code(()=>n.markCommissionsSeen({scope:plain,houseId:'hB',commissions:cs})),'denied');
});

test('staff, models, engravings and settings validation', () => {
  assert.equal(code(()=>n.cleanStaff({name:' '})),'invalid');
  assert.equal(n.cleanStaff({name:'Ana'}).specialty,'');
  assert.equal(code(()=>n.cleanModel({name:'m',blocks:[]})),'invalid');
  assert.equal(n.cleanModel({name:'m',blocks:[{}]}).description,'');
  assert.equal(code(()=>n.cleanEngraving({name:'g'})),'invalid');
  assert.equal(code(()=>n.cleanEngraving({name:'g',imagePath:'a',publicSrc:'/newspaper/gravuras/a.jpg'})),'invalid');
  assert.equal(code(()=>n.cleanEngraving({name:'g',publicSrc:'/outro/a.jpg'})),'invalid');
  assert.equal(n.cleanEngraving({name:'g',publicSrc:'/newspaper/gravuras/a.jpg'}).inCollection,true);
  assert.equal(code(()=>n.cleanSettings({title:'t',template:'x',fontStyle:'classico'})),'invalid');
  assert.equal(n.cleanSettings({title:'t',template:'gazeta',fontStyle:'romana'}).fontStyle,'romana');
});

test('editor calendar lists only published events of the month', () => {
  const ev=[{id:'1',publishedDate:'1522-01-10',publishedTitle:'A'},
    {id:'2',publishedDate:'1522-F-midwinter',publishedTitle:'B',publishedDescription:'d'},
    {id:'3',publishedDate:'1522-02-01',publishedTitle:'C'},{id:'4',publishedDate:null,publishedTitle:null},
    {id:'5',publishedDate:'1523-01-10',publishedTitle:'D'}];
  const r=n.calendarEvents({scope:narrator,events:ev,year:1522,month:0});
  assert.deepEqual(r.map(x=>x.id),['schedule:1','schedule:2']);
  assert.equal(r[1].description,'d');
  assert.equal(code(()=>n.calendarEvents({scope:plain,events:ev,year:1522,month:0})),'denied');
  assert.equal(code(()=>n.calendarEvents({scope:narrator,events:ev,year:1522,month:12})),'invalid');
});
