import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirebaseCloudReadonly,CloudAccessError} from './cloud-readonly-service.mjs';

const snapshot='a'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const d=value=>({exists:value!==undefined,data:()=>value});
const scope=(profile,extra={})=>({
  userId:'user-1',profile,active:true,admin:profile==='narrador',
  requirePasswordChange:false,memberHouseIds:profile==='jogador'?['house-a']:[],
  editHouseIds:[],...extra,
});

function fixture(profile='jogador',extra={}){
  const docs=new Map();
  const stage=name=>docs.set(name+'/'+snapshot,{status:'complete',private:true});
  for(const name of ['migrationDomainStage','migrationAuthStage',
    'migrationNobleHouseStage','migrationTimeEngineStage'])stage(name);
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
