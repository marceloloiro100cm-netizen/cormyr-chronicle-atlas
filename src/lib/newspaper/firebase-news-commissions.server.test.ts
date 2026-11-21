import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {newHouseState} from '../house/types';
import {constructionStateHash} from '../house/firebase-construction-transaction';
import {createFirebaseCommissions,readFirebaseCommissions}
 from './firebase-news-commissions.server';
import type {Scope} from '../firebase-workspace/service';

const snapshot='a'.repeat(64),key='22222222-2222-4222-8222-222222222222';
const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
const player:Scope={uid:'alice',profile:'jogador',playerId:'p1',
 memberHouseIds:['house-a'],editHouseIds:['house-a']};
const editor:Scope={uid:'editor',profile:'editor',playerId:null,
 memberHouseIds:[],editHouseIds:[]};
function fixture(){
 const original=newHouseState('house-a','Ferlin',1522*12);
 original.phase='active';original.method='import';original.base.wealth=10;
 const docs=new Map<string,any>();
 const root=(x:string)=>x+'/'+snapshot;
 for(const n of ['migrationDomainStage','migrationAuthStage','migrationNobleHouseStage'])
  docs.set(root(n),{status:'complete',private:true});
 docs.set(root('migrationDomainStage')+'/access/alice',{
  userId:'alice',profile:'jogador',admin:false,active:true,playerId:'p1',
  requirePasswordChange:false,memberHouseIds:['house-a'],editHouseIds:['house-a'],
 });
 docs.set(root('migrationDomainStage')+'/access/editor',{
  userId:'editor',profile:'editor',admin:false,active:true,playerId:null,
  requirePasswordChange:false,memberHouseIds:[],editHouseIds:[],
 });
 docs.set(root('migrationDomainStage')+'/houses/'+sha('house:house-a'),
  {sourceId:'house-a',active:true,season:2});
 const sheet=root('migrationNobleHouseStage')+'/sheets/'+sha('noble-sheet:house-a');
 docs.set(sheet,{houseId:'house-a',version:2,state:structuredClone(original)});
 const stateHash=constructionStateHash(original);
 const economy=root('campaignCloudRuntime')+'/houseEconomies/'+sha('house:house-a');
 docs.set(economy,{houseId:'house-a',status:'active',private:true,
  sourceSnapshotId:snapshot,sourceReconciled:true,seedVerified:true,
  sourceSheetVersion:2,sourceStateHash:stateHash,stateHash,
  version:0,state:structuredClone(original)});
 docs.set(root('campaignCloudRuntime'),{status:'active',private:true,
  sourceSnapshotId:snapshot,sourceSnapshotReconciled:true,applicationEnabled:true,
  newspaperWriteApproved:true,newspaperCommissionsReadApproved:true,
  newspaperCommissionsWriteApproved:true,
 });
 const ref=(path:string,query?:{field?:string;value?:unknown;max:number}):any=>({
  path,
  collection:(k:string)=>ref(path+'/'+k),
  doc:(id:string)=>ref(path+'/'+id),
  where:(field:string,_op:string,value:unknown)=>({
   limit:(max:number)=>ref(path,{field,value,max}),
  }),
  limit:(max:number)=>ref(path,{max}),
  async get(){
   if(query){
    const entries=[...docs.entries()].filter(([p,v])=>{
     if(!p.startsWith(path+'/')||p.slice(path.length+1).includes('/'))return false;
     return !query.field||v?.[query.field]===query.value;
    }).slice(0,query.max);
    return {docs:entries.map(([p,v])=>({id:p.slice(path.length+1),
     data:()=>structuredClone(v)}))};
   }
   return {exists:docs.has(path),data:()=>structuredClone(docs.get(path))};
  },
 });
 const db={collection:(name:string)=>ref(name),
  runTransaction:async<T,>(work:(tx:any)=>Promise<T>):Promise<T>=>{
   const writes:Array<{op:string;ref:any;value?:any}>=[];
   const tx={
    get:(r:any)=>r.get(),
    create:(r:any,value:any)=>writes.push({op:'create',ref:r,value}),
    update:(r:any,value:any)=>writes.push({op:'update',ref:r,value}),
   };
   const result=await work(tx);
   for(const w of writes){
    if(w.op==='create'&&docs.has(w.ref.path))throw Error('duplicate');
    docs.set(w.ref.path,w.op==='create'?structuredClone(w.value):
     {...docs.get(w.ref.path),...structuredClone(w.value)});
   }
   return result;
  },
 };
 const story=()=>createFirebaseCommissions({db,snapshotId:snapshot,actor:player});
 const editorCommands=()=>createFirebaseCommissions({db,snapshotId:snapshot,actor:editor});
 return {db,docs,economy,sheet,story,editorCommands};
}
beforeEach(()=>{vi.stubEnv('CORMYR_FIREBASE_NEWSPAPER_COMMISSIONS_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());
const order={p_house:'house-a',p_title:'Notícia da Casa',
 p_body:'Matéria contratada com mais de dez caracteres.',
 p_image_path:null,p_key:key};

describe('Item 10, encomendas de notícias com Riqueza real',()=>{
 it('cobra uma vez, guarda transação e livro-razão sem alterar acervo',async()=>{
  const f=fixture(),source=structuredClone(f.docs.get(f.sheet));
  const first=await f.story().commission(order,[]);
  expect(first).toMatchObject({alreadyApplied:false,houseVersion:1});
  expect(f.docs.get(f.economy).state.permanent.wealth).toBe(-1);
  expect(f.docs.get(f.economy).stateHash)
   .toBe(constructionStateHash(f.docs.get(f.economy).state));
  expect((await f.story().commission(order,[])).alreadyApplied).toBe(true);
  expect(f.docs.get(f.economy).version).toBe(1);
  expect(f.docs.get(f.sheet)).toEqual(source);
  const list=await readFirebaseCommissions(f.db,snapshot,player);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({state:'pending',house_id:'house-a'});
  expect([...f.docs.keys()].filter(x=>x.includes('/newspaperCommissionAudits/')))
   .toHaveLength(1);
 });
 it('Editor-Chefe rejeita com estorno apenas uma vez; Casa reconhece a resposta',async()=>{
  const f=fixture();
  const first=await f.story().commission(order,[]);
  const id=first.commissionId;
  expect(await f.editorCommands().reject({
   p_commission:id,p_note:'O assunto não cabe nesta edição.',
  })).toMatchObject({refunded:1});
  expect(f.docs.get(f.economy).state.permanent.wealth).toBe(0);
  expect((await f.editorCommands().reject({
   p_commission:id,p_note:'O assunto não cabe nesta edição.',
  })).duplicate).toBe(true);
  expect(f.docs.get(f.economy).version).toBe(2);
  expect(await f.story().markSeen({p_house:'house-a'})).toBe(1);
  expect(await f.story().markSeen({p_house:'house-a'})).toBe(0);
  expect((await readFirebaseCommissions(f.db,snapshot,player))[0]?.seen_at)
   .toBeTruthy();
 });
 it('outra Casa, editor na contratação e imagens sem Storage não são aceitos',async()=>{
  const f=fixture();
  await expect(f.story().commission({...order,p_house:'house-b'},[]))
   .rejects.toThrow();
  await expect(f.editorCommands().commission(order,[])).rejects.toThrow();
  await expect(f.story().commission({...order,p_image_path:'house-a/image.png'},[]))
   .rejects.toThrow('newspaper_image_invalid');
  // A URL com sintaxe Firebase mas sem registro de objeto também falha
  // antes de debitar Riqueza: nenhuma imagem pode ser inventada no cliente.
  const missing='newspaper-media/'+snapshot+
   '/commission/00000000-0000-4000-8000-000000000001.png';
  await expect(f.story().commission({...order,p_image_path:missing},[]))
   .rejects.toThrow('newspaper_image_not_authorized');
  expect(f.docs.get(f.economy).version).toBe(0);
 });
 it('ausência da aprovação de escrita bloqueia débito e não afeta leitura histórica',async()=>{
  const f=fixture(),runtime='campaignCloudRuntime/'+snapshot;
  f.docs.set(runtime,{...f.docs.get(runtime),
   newspaperCommissionsWriteApproved:false});
  await expect(f.story().commission(order,[]))
   .rejects.toThrow('newspaper_commissions_not_approved');
  expect(f.docs.get(f.economy).version).toBe(0);
 });
 it('pedidos já pagos continuam legíveis quando a escrita editorial é suspensa',async()=>{
  const f=fixture();
  await f.story().commission(order,[]);
  const runtime='campaignCloudRuntime/'+snapshot;
  f.docs.set(runtime,{...f.docs.get(runtime),
   newspaperWriteApproved:false,newspaperCommissionsWriteApproved:false});
  const list=await readFirebaseCommissions(f.db,snapshot,player);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({state:'pending',house_id:'house-a'});
  await expect(f.story().commission({...order,p_key:'33333333-3333-4333-8333-333333333333'},[]))
   .rejects.toThrow('newspaper_commissions_not_approved');
  expect(f.docs.get(f.economy).version).toBe(1);
 });
 it('sem aprovação de leitura nenhuma encomenda operacional é exposta',async()=>{
  const f=fixture(),runtime='campaignCloudRuntime/'+snapshot;
  await f.story().commission(order,[]);
  f.docs.set(runtime,{...f.docs.get(runtime),
   newspaperCommissionsReadApproved:false});
  await expect(readFirebaseCommissions(f.db,snapshot,player))
   .rejects.toThrow('newspaper_commissions_not_approved');
 });

});
