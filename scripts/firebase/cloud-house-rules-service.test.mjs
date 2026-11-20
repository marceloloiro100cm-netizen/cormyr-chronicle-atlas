import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirebaseHouseRulesService,readOperationalHouseRules}
 from './cloud-house-rules-service.mjs';

const SNAP='a'.repeat(64),h=s=>createHash('sha256').update(s).digest('hex');
const root='campaignCloudRuntime/'+SNAP;
function fixture(){
 const data=new Map([
  ['migrationDomainStage/'+SNAP,{status:'complete',private:true}],
  ['migrationAuthStage/'+SNAP,{status:'complete',private:true}],
  [root,{status:'active',private:true,applicationEnabled:true,
   sourceSnapshotId:SNAP,sourceSnapshotReconciled:true,
   houseRulesWriteApproved:true}],
  ['migrationDomainStage/'+SNAP+'/access/gm',{userId:'gm',profile:'narrador',
   admin:true,active:true,requirePasswordChange:false,
   memberHouseIds:[],editHouseIds:[]}],
  ['migrationDomainStage/'+SNAP+'/access/alice',{userId:'alice',
   profile:'jogador',admin:false,active:true,requirePasswordChange:false,
   memberHouseIds:['house-a'],editHouseIds:['house-a']}],
  ['migrationDomainStage/'+SNAP+'/houses/'+h('house:house-a'),
   {sourceId:'house-a',season:2,active:true}],
 ]);
 const ref=path=>({
  id:path.split('/').at(-1),path,
  collection:n=>ref(path+'/'+n),doc:n=>ref(path+'/'+n),
  limit(){return this;},
  async get(){
   if(data.has(path))return {exists:true,id:path.split('/').at(-1),
    data:()=>data.get(path)};
   const docs=[...data].filter(([p])=>p.startsWith(path+'/')&&
     p.slice(path.length+1).split('/').length===1)
     .map(([p,value])=>({id:p.split('/').at(-1),data:()=>value}));
   return {exists:false,size:docs.length,docs,data:()=>undefined};
  },
 });
 const db={
  collection:n=>ref(n),
  async runTransaction(callback){
   return callback({get:r=>r.get(),set:(r,v)=>data.set(r.path,v),
    create:(r,v)=>{if(data.has(r.path))throw Error('duplicated');data.set(r.path,v);}});
  },
 };
 const auth={
  verifyIdToken:async token=>({uid:token.includes('alice')?'alice':'gm'}),
  getUser:async uid=>({uid,disabled:false}),
 };
 const service=createFirebaseHouseRulesService({
  db,auth,snapshotId:SNAP,projectId:'cormyr',enabled:true,env:{},
 });
 return {db,service,data};
}
const definition={id:'rule-a',name:'Regra A',custom:true,
 category:'fortification',description:'Regra fictícia de teste'};
const request={houseId:'house-a',requestKey:'rule-request-0001',
 expectedVersion:0,definition};
test('somente Narrador altera regra operacional e não toca no histórico',async()=>{
 const {db,service,data}=fixture();
 await assert.rejects(()=>service.save('token-alice-123',request),
  e=>e.code==='narrator_required');
 const saved=await service.save('token-narrator-123',request);
 assert.equal(saved.version,1);
 const [override]=await readOperationalHouseRules(db,SNAP,'house-a');
 assert.equal(override.definition.name,'Regra A');
 assert.equal(override.version,1);
 assert.equal([...data.keys()].some(x=>x.includes('migrationDomainStage')&&
  x.includes('ruleOverrides')),false);
 const repeated=await service.save('token-narrator-123',request);
 assert.equal(repeated.duplicate,true);
 await assert.rejects(()=>service.save('token-narrator-123',
  {...request,definition:{...definition,name:'Outra Regra'}}),
  e=>e.code==='request_key_conflict');
});
test('versão antiga não altera regra nem cria auditoria adicional',async()=>{
 const {db,service,data}=fixture();
 await service.save('token-narrator-123',request);
 await assert.rejects(()=>service.save('token-narrator-123',
  {...request,requestKey:'another-key-0001',definition:{...definition,name:'Nova'}}),
  e=>e.code==='version_conflict');
 const rules=await readOperationalHouseRules(db,SNAP,'house-a');
 assert.equal(rules[0].definition.name,'Regra A');
 assert.equal([...data.keys()].filter(x=>x.includes('/houseRuleAudits/')).length,1);
});
test('bloqueia Casa inexistente e runtime sem autorização explícita',async()=>{
 const {db,service,data}=fixture();
 await assert.rejects(()=>service.save('token-narrator-123',{
  ...request,houseId:'house-b'
 }),e=>e.code==='house_not_found');
 data.set(root,{...data.get(root),houseRulesWriteApproved:false});
 await assert.rejects(()=>service.save('token-narrator-123',request),
  e=>e.code==='house_rules_not_approved');
});

test('leitura do catálogo recusa regra vinculada a outro snapshot',async()=>{
 const f=fixture();
 await f.service.save('token-narrator-123',request);
 const docPath=root+'/houseRuleSets/'+h('house:house-a')+'/rules/'+h('rule:rule-a');
 const rule=f.data.get(docPath);
 assert.ok(rule);
 f.data.set(docPath,{...rule,sourceSnapshotId:'b'.repeat(64)});
 await assert.rejects(()=>readOperationalHouseRules(f.db,SNAP,'house-a'),
  error=>error.code==='house_rules_integrity_failed');
});
test('catálogo operacional é somente leitura, independente da permissão de gravação',async()=>{
 const f=fixture();
 await f.service.save('token-narrator-123',request);
 f.data.set(root,{...f.data.get(root),houseRulesWriteApproved:false});
 const before=structuredClone(f.data);
 const rules=await readOperationalHouseRules(f.db,SNAP,'house-a');
 assert.equal(rules.length,1);
 assert.equal(rules[0].version,1);
 assert.deepEqual(f.data,before);
 await assert.rejects(()=>f.service.save('token-narrator-123',{
  ...request,requestKey:'another-rule-key-22',expectedVersion:1,
 }),e=>e.code==='house_rules_not_approved');
});
