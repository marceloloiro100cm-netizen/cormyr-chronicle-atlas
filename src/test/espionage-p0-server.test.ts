import {describe,expect,it,vi} from 'vitest';

vi.mock('@tanstack/react-start',()=>({
 createServerFn:()=>{const chain={
  middleware:()=>chain,inputValidator:()=>chain,handler:(fn:unknown)=>fn,
 };return chain;},
}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:null},error:null})},
}}));
import {finishSpyIntelligence} from '@/lib/espionage/spy-dossier.functions';

const operationId='22222222-2222-4222-8222-222222222222';
const mkDb=(state:'complete'|'waiting_catalog'|'missing_award'|'pending_resolution'|'no_success_award',
 pending=true)=>{
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const db={
  rpc:vi.fn(async(name:string,args:Record<string,unknown>)=>{
   calls.push({name,args});
   if(name==='is_campaign_admin')return {data:true,error:null};
   if(name==='spy_intelligence_operation_status')
    return {data:{status:state},error:null};
   if(name==='spy_intelligence_admin_pending')
    return {data:pending?[{
     operationId,objective:'army',ownerHouseId:'goldfin',
     targetHouseId:'harcourt',dateKey:'1522-01-11',capacity:3,
    }]:[],error:null};
   if(name==='spy_intelligence_finalize')
    return {data:{status:'complete',revealed:3,refreshed:0},error:null};
   return {data:null,error:{message:'unexpected RPC'}};
  }),
 };
 return {db:db as unknown as Parameters<typeof finishSpyIntelligence>[0],calls};
};

describe('Espionagem P0 · resolução e persistência dos dossiês',()=>{
 it('não reprocessa missões com dossiê já completo',async()=>{
  const {db,calls}=mkDb('complete');
  await expect(finishSpyIntelligence(db,operationId)).resolves.toBe('complete');
  expect(calls.map(x=>x.name)).toEqual([
   'is_campaign_admin','spy_intelligence_operation_status',
  ]);
 });
 it('falha de forma explícita se missão bem-sucedida perdeu seu prêmio',async()=>{
  const {db,calls}=mkDb('missing_award');
  await expect(finishSpyIntelligence(db,operationId))
   .rejects.toThrow('Missão concluída com sucesso sem prêmio');
  expect(calls.some(x=>x.name==='spy_intelligence_finalize')).toBe(false);
 });
 it('não revela informações antes da homologação',async()=>{
  const {db}=mkDb('pending_resolution');
  await expect(finishSpyIntelligence(db,operationId))
   .rejects.toThrow('ainda não foi homologada');
 });
 it('retoma uma pendência e finaliza somente uma vez',async()=>{
  const {db,calls}=mkDb('waiting_catalog');
  await expect(finishSpyIntelligence(db,operationId)).resolves.toBe('complete');
  const writes=calls.filter(x=>x.name==='spy_intelligence_finalize');
  expect(writes).toHaveLength(1);
  expect(writes[0]?.args).toEqual({p_operation:operationId,p_resources:null});
 });
 it('não interpreta fila vazia como descoberta já entregue',async()=>{
  const {db,calls}=mkDb('waiting_catalog',false);
  await expect(finishSpyIntelligence(db,operationId))
   .rejects.toThrow('sem entrada na fila');
  expect(calls.some(x=>x.name==='spy_intelligence_finalize')).toBe(false);
 });
 it('preserva a ausência de prêmio para missão fracassada',async()=>{
  const {db,calls}=mkDb('no_success_award');
  await expect(finishSpyIntelligence(db,operationId))
   .resolves.toBe('no_success_award');
  expect(calls.some(x=>x.name==='spy_intelligence_finalize')).toBe(false);
 });
});
