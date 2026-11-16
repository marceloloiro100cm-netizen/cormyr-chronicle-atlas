import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CloudTreasuryAuditError,createFirebaseTreasuryAudit}
  from './cloud-treasury-audit-service.mjs';

const snapshot='d'.repeat(64),token='firebase-synthetic-audit-token';
const digest=s=>createHash('sha256').update(s).digest('hex');
const join=(...segments)=>segments.join('/');
const doc=(value,id='')=>({id,exists:value!==undefined,data:()=>value});
function fixture(profile='narrador'){
  const data=new Map();
  for(const root of ['migrationDomainStage','migrationAuthStage',
    'migrationNobleHouseStage'])
    data.set(join(root,snapshot),{private:true,status:'complete'});
  const access=join('migrationDomainStage',snapshot,'access','actor-1');
  data.set(access,{userId:'actor-1',profile,active:true,
    requirePasswordChange:false,admin:profile==='narrador',
    memberHouseIds:profile==='jogador'?['house-a']:[],
    editHouseIds:profile==='jogador'?['house-a']:[]});
  const runtime=join('campaignCloudRuntime',snapshot);
  data.set(runtime,{status:'active',private:true,
    sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,
    treasurySeededVerified:true,applicationEnabled:false,
    treasuryWriteApproved:false});
  const house=id=>join('migrationDomainStage',snapshot,'houses',
    digest('house:'+id));
  const sheet=id=>join('migrationNobleHouseStage',snapshot,'sheets',
    digest('noble-sheet:'+id));
  const ledger=id=>join(runtime,'houseTreasuryAudits',id);
  const treasury=id=>join(runtime,'houseTreasuries',digest('house:'+id));
  for(const id of ['house-a','house-b']){
    data.set(house(id),{sourceId:id,active:true,season:2});
    data.set(sheet(id),{houseId:id,version:3,
      state:{houseId:id,treasury:120}});
    data.set(treasury(id),{houseId:id,status:'active',private:true,
      sourceSnapshotId:snapshot,sourceReconciled:true,
      sourceSheetVersion:3,balance:120,version:0});
  }
  const audit=(id,changes={})=>{
    const id64=digest('audit:'+id);
    const row={
      id:id64,action:'adjust',sourceSnapshotId:snapshot,
      actorUid:'narrator-actor',houseId:'house-a',
      version:1,expectedVersion:0,before:120,after:125,delta:5,
      reason:'Reforço de arrecadação',campaignDate:'1522-01-10',
      createdAt:'2026-11-16T15:00:00.000Z',...changes,
    };
    data.set(ledger(id64),row);
    return id64;
  };
  function reference(path='',where=null,maximum=null){
    return {
      path,
      collection:name=>reference(path?join(path,name):name),
      doc:id=>reference(join(path,id)),
      where(field,op,value){
        assert.equal(op,'==');
        return reference(path,{field,value},maximum);
      },
      limit:n=>reference(path,where,n),
      async get(){
        if(where){
          const entries=[...data].filter(([p,v])=>
            p.startsWith(path+'/')&&!p.slice(path.length+1).includes('/')&&
            v?.[where.field]===where.value)
            .slice(0,maximum??Infinity);
          return {size:entries.length,docs:entries.map(([p,v])=>
            doc(v,p.split('/').at(-1)))};
        }
        return doc(data.get(path),path.split('/').at(-1));
      },
    };
  }
  let calls=0;
  const db={
    collection:name=>reference(name),
    async runTransaction(fn){
      calls++;
      return fn({get:ref=>ref.get()});
    },
  };
  const auth={
    async verifyIdToken(value,revoked){
      assert.equal(revoked,true);
      if(value!==token)throw Error('revoked');
      return {uid:'actor-1'};
    },
    async getUser(uid){return {uid,disabled:false};},
  };
  const service=(opts={})=>createFirebaseTreasuryAudit({
    db,auth,projectId:'cormyr',snapshotId:snapshot,enabled:true,
    env:{},...opts,
  });
  return {data,access,runtime,house,sheet,ledger,treasury,audit,
    auth,db,service,calls:()=>calls};
}
const denied=async(fn,code,status=403)=>{
  await assert.rejects(fn,e=>e instanceof CloudTreasuryAuditError&&
    e.code===code&&e.status===status);
};
function sampleLedger(f){
  const one=f.audit('one');
  const two=f.audit('two',{
    version:2,expectedVersion:1,before:125,after:115,delta:-10,
    reason:'Reparos de fortaleza',
  });
  f.data.set(f.treasury('house-a'),{
    ...f.data.get(f.treasury('house-a')),version:2,balance:115,
  });
  return {one,two};
}
test('audit service requires explicit server-only Cloud flag',()=>{
  const f=fixture();
  const x={db:f.db,auth:f.auth,snapshotId:snapshot,projectId:'cormyr',env:{}};
  assert.throws(()=>createFirebaseTreasuryAudit(x),
    /firebase_treasury_audit_disabled/);
  assert.throws(()=>createFirebaseTreasuryAudit({...x,enabled:true,
    projectId:'demo-cormyr'}),/firebase_treasury_audit_disabled/);
  assert.throws(()=>createFirebaseTreasuryAudit({...x,enabled:true,
    env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}}),
  /firebase_treasury_audit_disabled/);
});
test('Narrator reads all verified House transactions without modifying data',async()=>{
  const f=fixture();sampleLedger(f);
  const before=structuredClone([...f.data]);
  const result=await f.service().list(token,'house-a');
  assert.equal(result.balance,115);
  assert.equal(result.version,2);
  assert.equal(result.total,2);
  assert.equal(result.verifiedChain,true);
  assert.equal(result.readOnly,true);
  assert.deepEqual(result.items.map(x=>x.version),[2,1]);
  assert.deepEqual(result.items.map(x=>x.delta),[-10,5]);
  assert.equal(result.items[0].reason,'Reparos de fortaleza');
  assert.equal(result.items[0].actorUid,'narrator-actor');
  assert.equal(result.truncated,false);
  assert.deepEqual([...f.data],before);
  assert.equal(f.calls(),1);
});
test('Player reads own House amounts but never sees narrator identity or reason',async()=>{
  const f=fixture('jogador');sampleLedger(f);
  const h=f.audit('other-house',{
    houseId:'house-b',reason:'SEGREDO_ALHEIO',actorUid:'narrator-secret'});
  const own=await f.service().list(token,'house-a');
  assert.equal(own.total,2);
  assert.ok(own.items.every(row=>!('actorUid' in row)&&!('reason' in row)));
  assert.ok(!JSON.stringify(own).includes('SEGREDO_ALHEIO'));
  await denied(()=>f.service().list(token,'house-b'),'access_denied');
  const editor=fixture('editor');
  await denied(()=>editor.service().list(token,'house-a'),'access_denied');
  assert.equal(f.data.has(f.ledger(h)),true);
});
test('Audit works while operational writes are frozen, but never on unreconciled root',async()=>{
  const f=fixture();sampleLedger(f);
  assert.equal(f.data.get(f.runtime).applicationEnabled,false);
  assert.equal((await f.service().list(token,'house-a')).total,2);
  f.data.set(f.runtime,{...f.data.get(f.runtime),
    sourceSnapshotReconciled:false});
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unavailable',503);
});
test('Tampered, missing, duplicate or reordered versions fail closed',async()=>{
  const f=fixture();const {one,two}=sampleLedger(f);
  f.data.delete(f.ledger(one));
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unverified',503);
  f.audit('one');
  f.data.set(f.ledger(two),{...f.data.get(f.ledger(two)),before:124});
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unverified',503);
  f.data.set(f.ledger(two),{...f.data.get(f.ledger(two)),
    before:125,version:1,expectedVersion:0});
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unverified',503);
});
test('Audit requires final balance to agree with the latest ledger entry',async()=>{
  const f=fixture();sampleLedger(f);
  f.data.set(f.treasury('house-a'),{
    ...f.data.get(f.treasury('house-a')),balance:999,
  });
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unverified',503);
});
test('Initial empty verified Treasury must match immutable imported source',async()=>{
  const f=fixture();
  const x=await f.service().list(token,'house-a');
  assert.deepEqual(x.items,[]);
  assert.equal(x.balance,120);
  f.data.set(f.treasury('house-a'),{
    ...f.data.get(f.treasury('house-a')),balance:121,
  });
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unverified',503);
});
test('Disabled user, revoked ID token and malicious House IDs are denied',async()=>{
  const f=fixture();sampleLedger(f);
  await denied(()=>f.service().list('bad-token','house-a'),
    'authentication_required',401);
  f.auth.getUser=async uid=>({uid,disabled:true});
  await denied(()=>f.service().list(token,'house-a'),
    'authentication_required',401);
  f.auth.getUser=async uid=>({uid,disabled:false});
  await denied(()=>f.service().list(token,'../house-b'),'invalid_house',400);
  f.data.set(f.access,{...f.data.get(f.access),active:false});
  await denied(()=>f.service().list(token,'house-a'),'access_denied');
});
test('Missing root, House, ledger or mismatched snapshot fails safely',async()=>{
  const f=fixture();sampleLedger(f);
  f.data.set('migrationNobleHouseStage/'+snapshot,{status:'incomplete',private:true});
  await denied(()=>f.service().list(token,'house-a'),
    'migration_stage_not_ready',503);
  f.data.set('migrationNobleHouseStage/'+snapshot,{status:'complete',private:true});
  f.data.delete(f.house('house-a'));
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unavailable',503);
  f.data.set(f.house('house-a'),{sourceId:'house-a',active:true,season:2});
  f.data.set(f.treasury('house-a'),{
    ...f.data.get(f.treasury('house-a')),
    sourceSnapshotId:'e'.repeat(64),
  });
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_unverified',503);
});
test('Large ledger fails closed instead of silently truncating the source',async()=>{
  const f=fixture();
  for(let i=0;i<501;i++)f.audit(String(i),{
    version:i+1,expectedVersion:i,before:120+i,
    after:121+i,delta:1,
  });
  await denied(()=>f.service().list(token,'house-a'),
    'treasury_audit_requires_pagination',503);
});
test('Shows at most fifty recent entries while verifying the entire chain',async()=>{
  const f=fixture();
  for(let i=0;i<55;i++)f.audit(String(i),{
    version:i+1,expectedVersion:i,
    before:120+i,after:121+i,delta:1,
  });
  f.data.set(f.treasury('house-a'),{
    ...f.data.get(f.treasury('house-a')),
    version:55,balance:175,
  });
  const x=await f.service().list(token,'house-a');
  assert.equal(x.total,55);
  assert.equal(x.items.length,50);
  assert.equal(x.items[0].version,55);
  assert.equal(x.items.at(-1).version,6);
  assert.equal(x.truncated,true);
});
