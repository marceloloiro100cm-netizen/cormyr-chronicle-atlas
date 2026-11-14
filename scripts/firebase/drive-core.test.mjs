import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEnvelope,allowed,canonical,digest,decide,retryDelay,filename,versionedFilename,postgrestTimestamp,stamp,
  recordEnvelope,applyDriveRecord,resolveDriveImport,leaseFree,DriveError} from './drive-core.mjs';

const U1='11111111-1111-4111-8111-111111111111',U2='22222222-2222-4222-8222-222222222222';
const env=(o={})=>({schema:'cormyr-record-v1',entityType:'record',id:U1,houseId:'h1',playerId:null,visibility:'house',
  version:2,baseVersion:1,title:'T',content:'C',kind:'document',createdAt:'2026-01-01T00:00:00+00:00',
  updatedAt:'2026-01-02T00:00:00+00:00',authorName:'',mutationId:U1,origin:'site',...o});
const hb={id:'b',scope:'house',houseId:'h1',playerId:null,enabled:true,privacyReviewed:true,runtimeAuthorized:true,confirmedBy:'adm'};
const pb={...hb,scope:'player',houseId:null,playerId:U2,ownerUserId:'u'};
const code=fn=>{try{fn();}catch(e){assert.ok(e instanceof DriveError);return e.code;}return null;};

test('canonical form and file names are stable (compatible with existing Drive files)',()=>{
  assert.equal(canonical(env()),JSON.stringify(['cormyr-record-v1','record',U1,'h1',null,'house',2,'T','C','document',null,
    '2026-01-01T00:00:00+00:00','2026-01-02T00:00:00+00:00','']));
  assert.equal(filename(env()),'cormyr-record-'+U1+'.json');
  assert.match(versionedFilename(env()),/^cormyr-record-.{36}-v2-[0-9a-f]{64}\.json$/);
  assert.equal(digest(env()),digest(env()));assert.notEqual(digest(env()),digest(env({content:'D'})));
  assert.equal(canonical(env({mailLinks:{originHouseId:'h',courtMemberId:null,courtAssignment:null,militaryUnitId:null,
    sheetVersion:3,deliveryWeek:null}})).endsWith('["h",null,null,null,3,null]]'),true);
});
test('envelope validation is strict',()=>{
  assert.doesNotThrow(()=>validateEnvelope(env()));
  for(const bad of [env({extra:1}),env({schema:'x'}),env({version:0}),env({id:'nope'}),env({kind:'other'}),
    env({title:'x'.repeat(501)}),env({origin:'cloud'}),null,{...env(),mailLinks:{}}])
    assert.equal(code(()=>validateEnvelope(bad)),'invalid');
  const noTitle=env();delete noTitle.title;assert.equal(code(()=>validateEnvelope(noTitle)),'invalid');
});
test('allowed by scope and authorization flags',()=>{
  assert.equal(allowed(hb,env()),true);
  assert.equal(allowed(hb,env({houseId:'h2'})),false);
  assert.equal(allowed(hb,env({playerId:U2})),false);
  assert.equal(allowed(pb,env({visibility:'player',playerId:U2,houseId:'h1'})),true);
  assert.equal(allowed({...hb,runtimeAuthorized:false},env()),false);
  assert.equal(allowed({...hb,scope:'master'},env({visibility:'master'})),false); // record never master
});
test('decide and retry delay',()=>{
  const base=env({version:1,baseVersion:0}),site=base;
  assert.equal(decide(base,site,site),'noop');
  assert.equal(decide(base,env({version:1,baseVersion:0,content:'N'}),base),'export');
  assert.equal(decide(base,site,env({version:2,baseVersion:1,content:'R'})),'import');
  assert.equal(decide(base,env({version:1,baseVersion:0,content:'S'}),env({version:2,baseVersion:1,content:'R'})),'conflict');
  assert.deepEqual([1,2,3,9,30].map(retryDelay),[30000,60000,120000,3600000,3600000]);
});
test('timestamps keep the exact PostgREST text for unchanged rows',()=>{
  assert.equal(postgrestTimestamp('2026-11-02 10:00:00.123456+00'),'2026-11-02T10:00:00.123456+00:00');
  assert.equal(postgrestTimestamp('2026-11-02 10:00:00+00'),'2026-11-02T10:00:00+00:00');
  assert.equal(postgrestTimestamp('garbage'),null);
  assert.equal(stamp('2026-11-02T10:00:00.123456+00:00','2026-11-02T10:00:00.123Z'),'2026-11-02T10:00:00.123456+00:00');
  assert.equal(stamp('2026-11-02T10:00:00.123456+00:00','2026-11-03T10:00:00.000Z'),'2026-11-03T10:00:00.000Z');
});
test('record envelope: gm never leaves, house record becomes player copy for a member',()=>{
  const r={id:U1,houseId:'h1',playerId:null,visibility:'house',version:2,title:'T',content:'C',kind:'document',
    createdAt:'2026-01-01T00:00:00.000Z',createdAtText:'2026-01-01T00:00:00+00:00',updatedAt:'2026-01-02T00:00:00.000Z',
    updatedAtText:'2026-01-02T00:00:00+00:00'};
  assert.equal(recordEnvelope({...r,visibility:'gm'},hb),null);
  assert.equal(canonical(recordEnvelope(r,hb)),canonical(env()));
  const pbHouse={...pb,houseId:'h1'};
  assert.equal(recordEnvelope(r,pbHouse,{ownerMemberHouseIds:new Set()}),null);
  const e=recordEnvelope(r,pbHouse,{ownerMemberHouseIds:new Set(['h1'])});
  assert.equal(e.visibility,'player');assert.equal(e.playerId,U2);
  assert.equal(recordEnvelope(r,hb.scope==='house'?{...hb,houseId:'zz'}:hb),null);
});
const rec=(o={})=>({id:U1,houseId:'h1',playerId:null,visibility:'house',version:2,title:'T',content:'C',kind:'document',
  createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-02T00:00:00.000Z',...o});
test('apply_drive_record accepts only the next version inside the binding scope',()=>{
  const args={binding:hb,mapped:true,confirmerIsAdmin:true,record:rec(),siteVersion:2,doc:env({version:3,baseVersion:2,content:'N'}),
    ownerEditsHouse:false,ownerIsPlayer:false};
  const ok=applyDriveRecord(args);
  assert.equal(ok.applied,true);assert.equal(ok.record.version,3);assert.equal(ok.record.content,'N');
  assert.equal(ok.record.updatedBy,'adm');assert.equal(ok.record.syncState,'pending');
  for(const o of [{mapped:false},{confirmerIsAdmin:false},{siteVersion:1},{record:null},{record:rec({visibility:'gm'})},
    {doc:env({version:4,baseVersion:2})},{doc:env({version:3,baseVersion:1})},{doc:env({version:3,baseVersion:2,houseId:'h2'})},
    {doc:env({version:3,baseVersion:2,playerId:U2})},{binding:{...hb,enabled:false}},{binding:{...hb,scope:'master'}}])
    assert.equal(applyDriveRecord({...args,...o}).applied,false);
  const player={...args,binding:pb,record:rec({visibility:'player',playerId:U2}),
    doc:env({visibility:'player',playerId:U2,version:3,baseVersion:2}),ownerEditsHouse:true,ownerIsPlayer:true};
  assert.equal(applyDriveRecord(player).applied,true);
  assert.equal(applyDriveRecord({...player,ownerEditsHouse:false}).applied,false);
  assert.equal(applyDriveRecord({...player,ownerIsPlayer:false}).applied,false);
});
test('resolve_drive_import: choices, scope, stale site version, creation, replies, letters',()=>{
  const inbox=(o={})=>({state:'conflict',folderSnapshot:env({version:3,baseVersion:2,content:'FOLDER'}),
    siteSnapshot:env(),...o});
  const base={actorUid:'adm',inbox:inbox(),binding:hb,record:rec(),choice:'folder'};
  const f=resolveDriveImport(base);
  assert.equal(f.record.content,'FOLDER');assert.equal(f.record.version,3);assert.equal(f.inboxState,'applied');assert.equal(f.requeueRecordId,U1);
  assert.equal(resolveDriveImport({...base,choice:'merge',content:'MIX'}).record.content,'MIX');
  assert.equal(code(()=>resolveDriveImport({...base,choice:'merge'})),'invalid');
  const site=resolveDriveImport({...base,choice:'site'});
  assert.equal(site.record,null);assert.equal(site.requeueRecordId,U1);
  assert.equal(resolveDriveImport({...base,choice:'reject'}).inboxState,'rejected');
  assert.equal(code(()=>resolveDriveImport({...base,choice:'x'})),'invalid');
  assert.equal(code(()=>resolveDriveImport({...base,inbox:inbox({state:'applied'})})),'conflict');
  assert.equal(code(()=>resolveDriveImport({...base,binding:{...hb,enabled:false}})),'denied');
  assert.equal(code(()=>resolveDriveImport({...base,record:rec({visibility:'gm'})})),'denied');
  assert.equal(code(()=>resolveDriveImport({...base,record:rec({houseId:'h2'})})),'denied');
  assert.equal(code(()=>resolveDriveImport({...base,record:rec({version:5})})),'conflict');
  const created=resolveDriveImport({...base,record:null,inbox:inbox({siteSnapshot:null})});
  assert.equal(created.insert,true);assert.equal(created.record.visibility,'house');assert.equal(created.record.houseId,'h1');
  assert.equal(created.record.createdBy,'adm');
  assert.equal(code(()=>resolveDriveImport({...base,record:null,choice:'site'})),'denied');
  assert.equal(code(()=>resolveDriveImport({...base,record:null,binding:{...hb,scope:'master'}})),'denied');
  const reply={folderSnapshot:env({entityType:'reply',letterId:U2})};
  assert.equal(resolveDriveImport({...base,inbox:{state:'review',...reply},choice:'site'}).inboxState,'applied');
  assert.equal(code(()=>resolveDriveImport({...base,inbox:{state:'review',...reply},choice:'folder'})),'invalid');
  assert.equal(code(()=>resolveDriveImport({...base,inbox:{state:'review',folderSnapshot:env({entityType:'letter'})}})),'invalid');
});
test('lease availability',()=>{
  const at=new Date('2026-01-01T00:00:00Z');
  assert.equal(leaseFree({},at),true);
  assert.equal(leaseFree({leaseUntil:'2025-12-31T23:59:00Z'},at),true);
  assert.equal(leaseFree({leaseUntil:'2026-01-01T00:01:00Z'},at),false);
});
