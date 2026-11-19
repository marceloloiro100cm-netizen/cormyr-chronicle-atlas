import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirebaseAccountService} from './cloud-account-service.mjs';
import {currentAccountAccess} from './operational-account-access.mjs';

const SNAP='a'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const root='campaignCloudRuntime/'+SNAP;
function fixture(){
 const documents=new Map([
  ['migrationDomainStage/'+SNAP,{status:'complete',private:true}],
  ['migrationAuthStage/'+SNAP,{status:'complete',private:true}],
  [root,{status:'active',private:true,applicationEnabled:true,
    sourceSnapshotId:SNAP,sourceSnapshotReconciled:true}],
  ['migrationDomainStage/'+SNAP+'/access/gm',{
   userId:'gm',profile:'narrador',admin:true,active:true,
   requirePasswordChange:false,playerId:null,memberHouseIds:[],editHouseIds:[],
  }],
  ['migrationDomainStage/'+SNAP+'/access/outsider',{
   userId:'outsider',profile:'jogador',admin:false,active:true,
   requirePasswordChange:false,playerId:'player-x',
   memberHouseIds:['house-a'],editHouseIds:[],
  }],
  ['migrationDomainStage/'+SNAP+'/houses/'+hash('house:house-a'),{
   sourceId:'house-a',active:true,season:2,
  }],
 ]);
 const ref=path=>({
  path,
  collection:name=>ref(path+'/'+name),
  doc:id=>ref(path+'/'+id),
  limit(){return this;},
  async get(){
   if(documents.has(path)){
    const v=documents.get(path);
    return {exists:true,id:path.split('/').at(-1),data:()=>v};
   }
   const entries=[...documents].filter(([p])=>
     p.startsWith(path+'/')&&p.slice(path.length+1).split('/').length===1);
   if(entries.length){
    const docs=entries.map(([p,v])=>({
      id:p.split('/').at(-1),exists:true,data:()=>v,
    }));
    return {docs,size:docs.length};
   }
   return {exists:false,size:0,docs:[],data:()=>undefined};
  },
 });
 const db={
  collection:name=>ref(name),
  async runTransaction(fn){
   const tx={
    get:r=>r.get(),
    set:(r,v)=>documents.set(r.path,v),
    create:(r,v)=>{
      if(documents.has(r.path))throw Error('exists');
      documents.set(r.path,v);
    },
   };
   return fn(tx);
  },
 };
 const users=new Map([
  ['gm',{uid:'gm',email:'gm@example.test',disabled:false}],
  ['outsider',{uid:'outsider',email:'outsider@example.test',disabled:false}],
 ]);
 let created=0;
 const auth={
  verifyIdToken:async token=>({uid:token.includes('outsider')?'outsider':
     token.includes('new-account')?'new-account':'gm'}),
  getUser:async uid=>{
    const user=users.get(uid);
    if(!user)throw Error('missing');
    return {...user};
  },
  getUserByEmail:async email=>{
    const user=[...users.values()].find(x=>x.email===email);
    if(!user)throw Object.assign(Error('not found'),{code:'auth/user-not-found'});
    return {...user};
  },
  createUser:async input=>{
    created++;
    const uid='new-account';
    const user={uid,email:input.email,disabled:input.disabled,
      displayName:input.displayName};
    users.set(uid,user);
    return {...user};
  },
  updateUser:async(uid,patch)=>{
    const existing=users.get(uid);
    if(!existing)throw Error('unknown user');
    const next={...existing,...patch};users.set(uid,next);
    return {...next};
  },
  listUsers:async()=>({users:[...users.values()]}),
  revokeRefreshTokens:async()=>undefined,
 };
 const service=createFirebaseAccountService({
  db,auth,snapshotId:SNAP,projectId:'cormyr',enabled:true,env:{},
 });
 return {db,auth,service,documents,users,created:()=>created};
}
const input={
 requestKey:'request-example-01',expectedVersion:0,
 name:'Jogador Exemplo',email:'jogador@example.test',
 password:'SenhaSeguraExemplo123',profile:'jogador',
 active:true,requireChange:true,memberHouseIds:['house-a'],
 editHouseIds:['house-a'],attrHouseIds:[],
};
test('somente Narrador cria contas, com escopo canônico e sem alterar histórico',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.service.submit('token-outsider',{...input,
   requestKey:'request-outsider-1'}),x=>x.code==='narrator_required');
 assert.equal(f.created(),0);
 const saved=await f.service.submit('token-narrator',{...input});
 assert.equal(saved.profile,'jogador');
 assert.equal(saved.requirePasswordChange,true);
 assert.equal(saved.active,true);
 assert.equal(f.users.get('new-account').disabled,false);
 assert.equal(f.documents.has('migrationDomainStage/'+SNAP+'/access/new-account'),false);
 const effective=await currentAccountAccess(f.db,SNAP,'new-account');
 assert.deepEqual(effective.memberHouseIds,['house-a']);
 assert.deepEqual(effective.editHouseIds,['house-a']);
 assert.equal(effective.admin,false);
 const repeated=await f.service.submit('token-narrator',{...input});
 assert.equal(repeated.duplicate,true);
 assert.equal(repeated.uid,saved.uid);
 assert.equal(f.created(),1);
 await assert.rejects(()=>f.service.submit('token-narrator',{
   ...input,name:'Outro jogador',
 }),x=>x.code==='request_key_conflict');
});
test('seleção de Casa sem fonte canônica recusa antes de criar Auth',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.service.submit('token-narrator',{
  ...input,memberHouseIds:['house-b'],editHouseIds:['house-b'],
 }),x=>x.code==='invalid_house_scope');
 assert.equal(f.created(),0);
});
test('troca obrigatória remove bloqueio só depois do Firebase Auth aceitar a senha',async()=>{
 const f=fixture();
 await f.service.submit('token-narrator',input);
 const pending=await f.service.status('token-new-account');
 assert.equal(pending.requirePasswordChange,true);
 const result=await f.service.completePassword('token-new-account',{
  password:'NovaSenhaSegura12345',requestKey:'password-change-0001',
 });
 assert.equal(result.loginRequired,true);
 const changed=await f.service.status('token-new-account');
 assert.equal(changed.requirePasswordChange,false);
 assert.equal(f.documents.has('migrationDomainStage/'+SNAP+'/access/new-account'),false);
});
