import {beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
 session:true,denied:false,
 calls:[] as {name:string;args:Record<string,unknown>}[],
 result:null as unknown,
}));
vi.mock('@/integrations/supabase/client',()=>({
 supabase:{
  auth:{getSession:async()=>({error:null,
   data:{session:state.session?{access_token:'isolated-test-token'}:null}})},
  rpc(this:{rest?:boolean},name:string,args:Record<string,unknown>){
   if(!this.rest)throw new Error('RPC receiver lost');
   state.calls.push({name,args});
   return Promise.resolve({data:state.result,error:state.denied?{message:'permission denied'}:null});
  },
  rest:true,
 },
}));
import {readSpyNarratorOperationsBrowser,
 readSpyHouseCounterintelligenceBrowser} from '@/lib/espionage/spy-operations-browser';

beforeEach(()=>{state.session=true;state.denied=false;state.calls.length=0;state.result=[];});
describe('Espionagem P2 · contratos de acesso das RPCs',()=>{
 it('não consulta operações da campanha sem uma sessão',async()=>{
  state.session=false;
  await expect(readSpyNarratorOperationsBrowser()).rejects.toThrow('Sessão expirada');
  expect(state.calls).toHaveLength(0);
 });
 it('consulta apenas a RPC protegida e respeita a autorização do banco',async()=>{
  state.denied=true;
  await expect(readSpyNarratorOperationsBrowser()).rejects.toThrow('não autorizada');
  expect(state.calls).toEqual([{name:'spy_narrator_operations_dashboard',args:{}}]);
 });
 it('lista operações vazias em homologação e preserva o receptor do Supabase',async()=>{
  await expect(readSpyNarratorOperationsBrowser()).resolves.toEqual([]);
  expect(state.calls).toEqual([{name:'spy_narrator_operations_dashboard',args:{}}]);
 });
 it('exige Casa e só retorna a estrutura anônima do contraespião',async()=>{
  await expect(readSpyHouseCounterintelligenceBrowser('')).rejects.toThrow('Casa inválida');
  state.result={totalDetections:1,alerts:[{dateKey:'1522-02-11',result:'captured'}]};
  await expect(readSpyHouseCounterintelligenceBrowser('ashkar')).resolves.toEqual(state.result);
  expect(state.calls).toEqual([{name:'spy_house_counterintelligence',args:{p_house:'ashkar'}}]);
 });
 it('rejeita qualquer ID, nome de atacante ou campo extra que apareça no alerta',async()=>{
  state.result={totalDetections:1,alerts:[{
   dateKey:'1522-02-11',result:'escaped',ownerHouseId:'goldfin',
  }]};
  await expect(readSpyHouseCounterintelligenceBrowser('ashkar')).rejects.toThrow();
 });
 it('rejeita operação com esquema inválido antes da apresentação',async()=>{
  state.result=[{operationId:'invalid',ownerHouseId:'ashkar'}];
  await expect(readSpyNarratorOperationsBrowser()).rejects.toThrow();
 });
 it('a negativa do banco bloqueia alertas de outra Casa',async()=>{
  state.denied=true;
  await expect(readSpyHouseCounterintelligenceBrowser('other-house'))
   .rejects.toThrow('não autorizada');
 });
});
