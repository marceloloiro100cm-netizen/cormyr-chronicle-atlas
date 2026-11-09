import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';

const state=vi.hoisted(()=>({
 calls:[] as {name:string;args:Record<string,unknown>}[],
 validSession:true,
 unauthorized:false,
 rows:[] as unknown[],
}));

vi.mock('@tanstack/react-start',()=>({
 createServerFn:()=>{const chain={
  middleware:()=>chain,inputValidator:()=>chain,handler:(fn:unknown)=>fn,
 };return chain;},
}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/integrations/supabase/client',()=>{
 const client={
  auth:{getSession:async()=>({
   data:{session:state.validSession?{access_token:'test-session'}:null},error:null,
  })},
  rest:{ready:true},
  rpc(this:{rest?:{ready:boolean}},name:string,args:Record<string,unknown>){
   if(!this?.rest?.ready)throw new Error('SupabaseClient.rpc lost its receiver');
   state.calls.push({name,args});
   return Promise.resolve({
    data:state.unauthorized?null:state.rows,
    error:state.unauthorized?{message:'not authorized'}:null,
   });
  },
 };
 return {supabase:client};
});

import {readSpyDossiersBrowser,readSpyIntelligencePendingBrowser,
 readSpyIntelligenceOptionsBrowser} from '@/lib/espionage/spy-dossier.functions';

beforeEach(()=>{state.calls.length=0;state.validSession=true;state.unauthorized=false;state.rows=[];});

describe('Dossiês de Espionagem · RPC autenticada com receptor preservado',()=>{
 it('narrador consulta dossiês vazios sem erro de JavaScript',async()=>{
  await expect(readSpyDossiersBrowser(null)).resolves.toEqual([]);
  expect(state.calls).toEqual([{name:'spy_intelligence_read',args:{p_house:null}}]);
 });
 it('jogador solicita apenas os relatórios de sua Casa',async()=>{
  await expect(readSpyDossiersBrowser('goldfin')).resolves.toEqual([]);
  expect(state.calls).toEqual([{
   name:'spy_intelligence_read',args:{p_house:'goldfin'},
  }]);
 });
 it('consulta as outras RPCs de inteligência sem perder o contexto Supabase',async()=>{
  await expect(readSpyIntelligencePendingBrowser()).resolves.toEqual([]);
  await expect(readSpyIntelligenceOptionsBrowser(
   '22222222-2222-4222-8222-222222222222')).resolves.toEqual([]);
  expect(state.calls.map(c=>c.name)).toEqual([
   'spy_intelligence_admin_pending','spy_intelligence_admin_options',
  ]);
 });
 it('sem sessão válida não consulta dados privados',async()=>{
  state.validSession=false;
  await expect(readSpyDossiersBrowser(null)).rejects.toThrow('Sessão expirada');
  expect(state.calls).toEqual([]);
 });
 it('uma negativa real de autorização continua bloqueando a consulta',async()=>{
  state.unauthorized=true;
  await expect(readSpyDossiersBrowser(null)).rejects.toThrow('Não foi possível consultar');
  expect(state.calls).toHaveLength(1);
 });
 it('rejeita dados de outra Casa mesmo se um provedor devolver resposta incorreta',async()=>{
  state.rows=[{
   id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   ownerHouseId:'ashkar',targetHouseId:'harcourt',
   ownerHouseName:'Ashkar',targetHouseName:'Harcourt',
   targetRegion:'horselands',updatedAt:'2026-11-09T12:00:00Z',
   findings:[],history:[],adminHistory:[],
  }];
  await expect(readSpyDossiersBrowser('goldfin'))
   .rejects.toThrow('Resposta de inteligência incompatível com esta Casa');
  expect(state.calls).toEqual([{name:'spy_intelligence_read',args:{p_house:'goldfin'}}]);
 });
 it('evita regressão de método RPC desassociado do SupabaseClient',()=>{
  const src=readFileSync('src/lib/espionage/spy-dossier.functions.ts','utf8');
  expect(src).toContain('supabase.rpc.bind(supabase)');
  expect(src).not.toContain('const rpc=supabase.rpc as unknown as Rpc');
 });
});
