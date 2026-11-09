import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
 logged:true,denied:false,rows:[] as unknown[],
 calls:[] as Array<{name:string;args:Record<string,unknown>}>,
}));
vi.mock('@tanstack/react-start',()=>({
 createServerFn:()=>{const f={middleware:()=>f,inputValidator:()=>f,handler:(h:unknown)=>h};return f;},
}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{
  rest:{current:true},
  auth:{getSession:async()=>({
   data:{session:state.logged?{access_token:'test-jwt'}:null},error:null,
  })},
  rpc(this:{rest?:{current:boolean}},name:string,args:Record<string,unknown>){
   if(!this.rest?.current)throw Error('RPC receiver lost');
   state.calls.push({name,args});
   return Promise.resolve({
    data:state.denied?null:state.rows,
    error:state.denied?{message:'access denied'}:null,
   });
  },
 },
}));
import {readSpyDossiersBrowser} from '@/lib/espionage/spy-dossier.functions';

const dossier=()=>({
 id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 ownerHouseId:'ashkar',targetHouseId:'harcourt',
 ownerHouseName:'Ashkar',targetHouseName:'Harcourt',
 targetRegion:'horselands',updatedAt:'2026-11-09T19:00:00Z',
 findings:[],history:[],adminHistory:[],
});
const event=()=>({
 id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 objective:'house_resources',key:'law',action:'refreshed',
 dateKey:'1522-01-21',oldSnapshot:null,newSnapshot:{},
});
beforeEach(()=>{
 state.logged=true;state.denied=false;state.rows=[];
 state.calls.length=0;
});
describe('R5 Lote 3 · isolamento de dossiê por Casa, defesa em profundidade',()=>{
 it('recusa chamadas sem sessão autenticada',async()=>{
  state.logged=false;
  await expect(readSpyDossiersBrowser('ashkar')).rejects.toThrow('Sessão expirada');
  expect(state.calls).toHaveLength(0);
 });
 it('jogador recebe apenas seus dossiês com snapshots privados bloqueados',async()=>{
  state.rows=[{...dossier(),history:[event()]}];
  await expect(readSpyDossiersBrowser('ashkar')).resolves.toHaveLength(1);
  expect(state.calls).toEqual([{name:'spy_intelligence_read',args:{p_house:'ashkar'}}]);
 });
 it('não entrega dossiê de Casa diferente, mesmo se a RPC regredir',async()=>{
  state.rows=[{...dossier(),ownerHouseId:'goldfin'}];
  await expect(readSpyDossiersBrowser('ashkar'))
   .rejects.toThrow('Resposta de inteligência incompatível');
 });
 it('bloqueia auditoria administrativa vazada em resposta de jogador',async()=>{
  state.rows=[{...dossier(),adminHistory:[{
   id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   objective:'army',key:'unit:guard',action:'reveal',
   dateKey:'1522-01-21',reason:'Justificativa confidencial',
  }]}];
  await expect(readSpyDossiersBrowser('ashkar'))
   .rejects.toThrow('dados reservados');
 });
 it('bloqueia antigos snapshots e informações revogadas na resposta do jogador',async()=>{
  for(const changed of [
   {...event(),oldSnapshot:{value:20}},
   {...event(),newSnapshot:{value:42}},
  ]){
   state.rows=[{...dossier(),history:[changed]}];
   await expect(readSpyDossiersBrowser('ashkar'))
    .rejects.toThrow('dados reservados');
  }
 });
 it('narrador usa a RPC protegida e pode ler seu histórico de auditoria',async()=>{
  state.rows=[{...dossier(),history:[{...event(),oldSnapshot:{value:20}}],
   adminHistory:[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    objective:'house_resources',key:'law',action:'revalidate',
    dateKey:'1522-01-21',reason:'Fonte oficial revisada.'}]}];
  await expect(readSpyDossiersBrowser(null)).resolves.toHaveLength(1);
  expect(state.calls).toEqual([{name:'spy_intelligence_read',args:{p_house:null}}]);
 });
 it('negativa de autorização no banco continua recusando mesmo com sessão',async()=>{
  state.denied=true;
  await expect(readSpyDossiersBrowser('ashkar')).rejects.toThrow('Não foi possível consultar');
 });
});
