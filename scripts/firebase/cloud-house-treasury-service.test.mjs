import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CloudTreasuryError,createFirebaseCloudTreasury}
  from './cloud-house-treasury-service.mjs';

const snapshot='c'.repeat(64);
const token='firebase-synthetic-treasury-token';
const hash=x=>createHash('sha256').update(x).digest('hex');
const path=(...items)=>items.join('/');
const doc=data=>({exists:data!==undefined,data:()=>data});
const req=(changes={})=>({
  requestKey:'treasury-request-001',houseId:'house-a',
  expectedVersion:0,delta:-12,reason:'Reparos aprovados pelo Narrador',
  ...changes,
});
function fixture(profile='narrador'){
  const records=new Map();
  for(const root of ['migrationDomainStage','migrationAuthStage',
    'migrationNobleHouseStage','migrationTimeEngineStage'])
    records.set(path(root,snapshot),{status:'complete',private:true});
  const calendar=path('migrationTimeEngineStage',snapshot,'calendar','current');
  records.set(calendar,{year:1522,month:0,day:10,festival:null,version:5});
  const runtime=path('campaignCloudRuntime',snapshot);
  records.set(runtime,{
    status:'active',private:true,sourceSnapshotId:snapshot,
    sourceSnapshotReconciled:true,applicationEnabled:true,
    treasuryWriteApproved:true,treasurySeededVerified:true,calendarVersion:5,
  });
  const access=path('migrationDomainStage',snapshot,'access','narrator-1');
  records.set(access,{
    userId:'narrator-1',profile,admin:profile==='narrador',active:true,
    requirePasswordChange:false,memberHouseIds:[],editHouseIds:[],
  });
  const house=(id)=>path('migrationDomainStage',snapshot,
    'houses',hash('house:'+id));
  const sheet=(id)=>path('migrationNobleHouseStage',snapshot,
    'sheets',hash('noble-sheet:'+id));
  const treasury=(id)=>path('campaignCloudRuntime',snapshot,
    'houseTreasuries',hash('house:'+id));
  for(const id of ['house-a','house-b']){
    records.set(house(id),{sourceId:id,active:true,season:2});
    records.set(sheet(id),{houseId:id,version:3,state:{houseId:id,treasury:120}});
    records.set(treasury(id),{
      houseId:id,status:'active',private:true,sourceSnapshotId:snapshot,
      sourceReconciled:true,sourceSheetVersion:3,balance:120,version:0,
    });
  }
  const ref=(p='')=>({
    path:p,
    collection(name){return ref(p?path(p,name):name);},
    doc(id){return ref(path(p,id));},
    async get(){return doc(records.get(p));},
  });
  let transactions=0;
  const db={
    collection(name){return ref(name);},
    async runTransaction(action){
      transactions++;
      const writes=[];
      const tx={
        get:r=>r.get(),
        create(r,data){writes.push({kind:'create',path:r.path,data});},
        update(r,data){writes.push({kind:'update',path:r.path,data});},
      };
      const result=await action(tx);
      for(const v of writes){
        if(v.kind==='create'&&records.has(v.path))throw Error('duplicate');
        if(v.kind==='update'&&!records.has(v.path))throw Error('missing');
      }
      for(const v of writes){
        records.set(v.path,v.kind==='create'?structuredClone(v.data):
          {...records.get(v.path),...structuredClone(v.data)});
      }
      return result;
    }
  };
  const auth={
    async verifyIdToken(v,revoked){
      assert.equal(revoked,true);
      if(v!==token)throw Error('revoked');
      return {uid:'narrator-1'};
    },
    async getUser(uid){return {uid,disabled:false};},
  };
  const service=(options={})=>createFirebaseCloudTreasury({
    db,auth,snapshotId:snapshot,projectId:'cormyr',enabled:true,
    env:{},clock:()=>'2026-11-16T15:00:00.000Z',...options,
  });
  return {records,db,auth,access,runtime,calendar,house,sheet,treasury,
    service,transactions:()=>transactions};
}
const denied=async(fn,code,status=403)=>{
  await assert.rejects(fn,e=>e instanceof CloudTreasuryError&&
    e.code===code&&e.status===status);
};

test('Treasury service is explicitly disabled without Cloud-only gate',()=>{
  const f=fixture();
  const base={db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',env:{}};
  assert.throws(()=>createFirebaseCloudTreasury(base),/firebase_cloud_treasury_disabled/);
  assert.throws(()=>createFirebaseCloudTreasury({...base,enabled:true,projectId:'test'}),
    /firebase_cloud_treasury_disabled/);
  assert.throws(()=>createFirebaseCloudTreasury({...base,enabled:true,snapshotId:'bad'}),
    /firebase_cloud_treasury_disabled/);
  assert.throws(()=>createFirebaseCloudTreasury({...base,enabled:true,
    env:{FIRESTORE_EMULATOR_HOST:'localhost:8080'}}),
    /firebase_cloud_treasury_disabled/);
});

test('Narrator changes reconciled Treasury atomically; duplicate request is safe',async()=>{
  const f=fixture(),s=f.service();
  const immutable=new Map([...f.records].filter(([p])=>p.startsWith('migration')));
  assert.deepEqual(await s.status(token,'house-a'),{
    enabled:true,canAdjust:true,readOnly:false,balance:120,version:0,
  });
  const first=await s.adjust(token,req());
  assert.equal(first.duplicate,false);
  assert.equal(first.balance,108);
  assert.equal(first.version,1);
  const second=await s.adjust(token,req());
  assert.deepEqual(second,{...first,duplicate:true});
  assert.equal(f.records.get(f.treasury('house-a')).balance,108);
  assert.equal(f.records.get(f.treasury('house-a')).version,1);
  const audits=[...f.records].filter(([p])=>p.includes('/houseTreasuryAudits/'));
  assert.equal(audits.length,1);
  assert.equal(audits[0][1].before,120);
  assert.equal(audits[0][1].after,108);
  assert.equal(audits[0][1].campaignDate,'1522-01-10');
  assert.equal(audits[0][1].reason,'Reparos aprovados pelo Narrador');
  for(const [p,v] of immutable)assert.deepEqual(f.records.get(p),v);
});

test('Optimistic version rejects stale independent write and preserves balance',async()=>{
  const f=fixture(),s=f.service();
  await s.adjust(token,req());
  await denied(()=>s.adjust(token,req({
    requestKey:'treasury-request-002',delta:25,
  })),'treasury_version_conflict',409);
  assert.equal(f.records.get(f.treasury('house-a')).balance,108);
  assert.equal([...f.records].filter(([p])=>p.includes('houseTreasuryAudits')).length,1);
  const next=await s.adjust(token,req({
    requestKey:'treasury-request-002',expectedVersion:1,delta:25,
  }));
  assert.equal(next.balance,133);
  assert.equal(next.version,2);
});

test('Narrator cannot overdraft treasury or create huge synthetic balance',async()=>{
  const f=fixture(),s=f.service();
  await denied(()=>s.adjust(token,req({delta:-121})),
    'treasury_out_of_bounds',409);
  await denied(()=>s.adjust(token,req({delta:0})),
    'invalid_treasury_request',400);
  await denied(()=>s.adjust(token,req({delta:10001})),
    'invalid_treasury_request',400);
  await denied(()=>s.adjust(token,req({delta:'12'})),
    'invalid_treasury_request',400);
  assert.equal(f.records.get(f.treasury('house-a')).balance,120);
});

test('Only verified active Narrator may access Treasury even for owned Houses',async()=>{
  for(const role of ['jogador','editor']){
    const f=fixture(role);
    await denied(()=>f.service().status(token,'house-a'),'narrator_only',403);
    await denied(()=>f.service().adjust(token,req()),'narrator_only',403);
  }
  const f=fixture();
  f.records.set(f.access,{...f.records.get(f.access),admin:false});
  await denied(()=>f.service().adjust(token,req()),'narrator_only',403);
  f.records.set(f.access,{...f.records.get(f.access),admin:true,active:false});
  await denied(()=>f.service().status(token,'house-a'),'narrator_only',403);
  f.auth.getUser=async uid=>({uid,disabled:true});
  await denied(()=>f.service().adjust(token,req()),'authentication_required',401);
});

test('Disabling a reconciliation/approval gate blocks all adjustments',async()=>{
  const f=fixture();
  const baseline=f.records.get(f.runtime);
  for(const flag of ['sourceSnapshotReconciled','applicationEnabled',
    'treasuryWriteApproved','treasurySeededVerified']){
    f.records.set(f.runtime,{...baseline,[flag]:false});
    await denied(()=>f.service().adjust(token,req()),
      'treasury_runtime_not_approved',503);
    assert.deepEqual(await f.service().status(token,'house-a'),{
      enabled:false,canAdjust:false,readOnly:true,balance:null,version:null,
    });
  }
  f.records.set(f.runtime,{...baseline,calendarVersion:4});
  await denied(()=>f.service().adjust(token,req()),'treasury_runtime_not_approved',503);
  f.records.set(f.runtime,baseline);
  f.records.set('migrationNobleHouseStage/'+snapshot,{status:'incomplete',private:true});
  await denied(()=>f.service().adjust(token,req()),'migration_stage_not_ready',503);
});

test('Treasury must be seeded out of band and match source sheet before first write',async()=>{
  const f=fixture(),record=f.records.get(f.treasury('house-a'));
  f.records.delete(f.treasury('house-a'));
  await denied(()=>f.service().adjust(token,req()),'treasury_source_not_reconciled',503);
  f.records.set(f.treasury('house-a'),{...record,balance:999});
  await denied(()=>f.service().adjust(token,req()),'treasury_source_not_reconciled',503);
  f.records.set(f.treasury('house-a'),{...record,sourceSheetVersion:2});
  await denied(()=>f.service().adjust(token,req()),'treasury_source_not_reconciled',503);
  f.records.set(f.treasury('house-a'),record);
  f.records.set(f.sheet('house-a'),{
    houseId:'house-a',version:3,state:{houseId:'house-a',treasury:'120'},
  });
  await denied(()=>f.service().adjust(token,req()),'house_sheet_unavailable',503);
  assert.equal([...f.records].filter(([p])=>p.includes('houseTreasuryAudits')).length,0);
});

test('House scope is sourced from live registered season-2 Houses',async()=>{
  const f=fixture();
  f.records.set(f.house('house-a'),{sourceId:'house-a',season:1,active:true});
  await denied(()=>f.service().adjust(token,req()),'house_unavailable',404);
  await denied(()=>f.service().adjust(token,req({houseId:'../admin'})),
    'invalid_treasury_request',400);
  await denied(()=>f.service().status(token,'../admin'),'invalid_house',400);
  assert.equal(f.records.get(f.treasury('house-b')).balance,120);
});

test('Client cannot spoof actor or source and request key cannot be reused',async()=>{
  const f=fixture(),s=f.service();
  await denied(()=>s.adjust(token,req({sourceSnapshotId:snapshot})),
    'invalid_treasury_request',400);
  await denied(()=>s.adjust(token,req({actorUid:'narrator-2'})),
    'invalid_treasury_request',400);
  await s.adjust(token,req());
  await denied(()=>s.adjust(token,req({reason:'Outro motivo'})),
    'request_key_conflict',409);
  await denied(()=>s.adjust(token,req({houseId:'house-b'})),
    'request_key_conflict',409);
  assert.equal(f.records.get(f.treasury('house-a')).balance,108);
  assert.equal(f.records.get(f.treasury('house-b')).balance,120);
});

test('Missing canonical calendar and compromised account stop writes',async()=>{
  const f=fixture();
  f.records.set(f.calendar,{year:1522,month:0,day:0,version:5});
  await denied(()=>f.service().adjust(token,req()),'calendar_unavailable',503);
  f.records.set(f.calendar,{year:1522,month:0,day:10,version:5});
  f.records.set(f.access,{...f.records.get(f.access),requirePasswordChange:true});
  await denied(()=>f.service().adjust(token,req()),'narrator_only',403);
});


test('Player sees only own reconciled Treasury, without mutation access',async()=>{
  const f=fixture('jogador');
  f.records.set(f.access,{
    ...f.records.get(f.access),playerId:'player-a',
    memberHouseIds:['house-a'],editHouseIds:['house-a'],
  });
  f.records.set(f.runtime,{
    ...f.records.get(f.runtime),treasuryReadApproved:true,
    treasuryWriteApproved:false,
  });
  const before=new Map([...f.records]);
  const own=await f.service().summary(token,'house-a');
  assert.deepEqual(own,{
    available:true,readOnly:true,balance:120,version:0,
  });
  await denied(()=>f.service().summary(token,'house-b'),'access_denied',403);
  await denied(()=>f.service().status(token,'house-a'),'narrator_only',403);
  await denied(()=>f.service().adjust(token,req()),'narrator_only',403);
  for(const [key,value] of before)assert.deepEqual(f.records.get(key),value);
  assert.equal([...f.records].filter(([k])=>k.includes('/houseTreasuryAudits/')).length,0);
});

test('Read-only approval is separate from Treasury writing approval',async()=>{
  const f=fixture();
  const runtime=f.records.get(f.runtime);
  f.records.set(f.runtime,{...runtime,treasuryReadApproved:false});
  assert.deepEqual(await f.service().summary(token,'house-a'),{
    available:false,readOnly:true,balance:null,version:null,
  });
  // Narrator writes remain governed by the independent write authorization.
  const allowed=await f.service().adjust(token,req());
  assert.equal(allowed.balance,108);
  f.records.set(f.runtime,{
    ...runtime,treasuryReadApproved:true,treasuryWriteApproved:false,
  });
  assert.deepEqual(await f.service().summary(token,'house-a'),{
    available:true,readOnly:true,balance:108,version:1,
  });
  await denied(()=>f.service().adjust(token,req({
    expectedVersion:1,requestKey:'treasury-request-002',
  })),'treasury_runtime_not_approved',503);
});

test('Player cannot list another House, claim narrator, or use malformed scope',async()=>{
  const f=fixture('jogador');
  const base=f.records.get(f.access);
  f.records.set(f.runtime,{
    ...f.records.get(f.runtime),treasuryReadApproved:true,
  });
  const allowed={...base,playerId:'player-a',
    memberHouseIds:['house-a'],editHouseIds:[]};
  for(const variant of [
    {...allowed,memberHouseIds:['house-b'],editHouseIds:['house-a']},
    {...allowed,memberHouseIds:'house-a'},
    {...allowed,memberHouseIds:['../admin']},
    {...allowed,playerId:null},
    {...allowed,admin:true},
    {...allowed,requirePasswordChange:true},
    {...allowed,active:false},
  ]){
    f.records.set(f.access,variant);
    await denied(()=>f.service().summary(token,'house-a'),'access_denied',403);
  }
  f.records.set(f.access,allowed);
  await denied(()=>f.service().summary(token,'house-b'),'access_denied',403);
  await denied(()=>f.service().summary(token,'../other'),'invalid_house',400);
  const editor=fixture('editor');
  editor.records.set(editor.runtime,{
    ...editor.records.get(editor.runtime),treasuryReadApproved:true,
  });
  await denied(()=>editor.service().summary(token,'house-a'),'access_denied',403);
});

test('Read summary is fail-closed until source is reconciled and owner account active',async()=>{
  const f=fixture('jogador');
  f.records.set(f.access,{
    ...f.records.get(f.access),playerId:'player-a',
    memberHouseIds:['house-a'],editHouseIds:[],
  });
  f.records.set(f.runtime,{
    ...f.records.get(f.runtime),treasuryReadApproved:true,
    treasurySeededVerified:false,
  });
  assert.deepEqual(await f.service().summary(token,'house-a'),{
    available:false,readOnly:true,balance:null,version:null,
  });
  f.records.set(f.runtime,{
    ...f.records.get(f.runtime),treasurySeededVerified:true,
  });
  f.records.delete(f.treasury('house-a'));
  assert.deepEqual(await f.service().summary(token,'house-a'),{
    available:false,readOnly:true,balance:null,version:null,
  });
  f.auth.getUser=async uid=>({uid,disabled:true});
  await denied(()=>f.service().summary(token,'house-a'),
    'authentication_required',401);
});

test('Treasury audit uses the explicitly published operational calendar',async()=>{
  const f=fixture();
  f.records.set(f.runtime,{...f.records.get(f.runtime),calendarSource:'operational',
    calendarVersion:6,calendar:{year:1522,month:1,day:20,festival:null,version:6}});
  await f.service().adjust(token,req());
  const audit=[...f.records].find(([p])=>p.includes('/houseTreasuryAudits/'))[1];
  assert.equal(audit.campaignDate,'1522-02-20');
  assert.equal(f.records.get(f.calendar).version,5);
});

