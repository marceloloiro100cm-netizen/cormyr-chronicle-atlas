import {describe,expect,it,vi} from 'vitest';

vi.mock('@tanstack/react-start',()=>({
 createServerFn:()=>{
  const chain={middleware:()=>chain,inputValidator:()=>chain,handler:(fn:unknown)=>fn};
  return chain;
 },
}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
 auth:{getSession:async()=>({data:{session:null},error:null})},
}}));
import {createSpyAgent,resolveSpyAgentMission}
 from '@/lib/espionage/spy-agent-actions.functions';

const agentId='11111111-1111-4111-8111-111111111111';
const opId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';

/** A real SupabaseClient.rpc method relies on this.rest.
 * The fake deliberately rejects all unbound method calls.
 */
function createFakeDb(opts:{narrator?:boolean;completeAward?:boolean}={}){
 const calls:string[]=[];
 const db={
  rest:true,
  async rpc(this:{rest?:boolean},name:string){
   if(this?.rest!==true)throw new Error('Supabase RPC receiver lost');
   calls.push(name);
   if(name==='is_campaign_admin')
    return {data:opts.narrator!==false,error:null};
   if(name==='spy_create_agent')return {data:{
    id:agentId,codename:'O Corvo',rank:'Verde',cunning:3,
    status:'available',missionSuccesses:0,portraitId:null,
    version:1,upgrades:[],alreadyApplied:false,
   },error:null};
   if(name==='spy_resolve_agent_mission')return {data:{
    operationId:opId,agentId,alreadyApplied:false,
    outcome:'mission_success',status:'available',rank:'Verde',
    cunning:3,missionSuccesses:1,promoted:false,
   },error:null};
   if(name==='spy_intelligence_operation_status')
    return {data:{status:opts.completeAward===false?'missing_award':'complete'},error:null};
   return {data:null,error:{message:'unexpected RPC '+name}};
  },
 };
 return {db,calls};
}

describe('R4: transações autenticadas de verdade preservam o cliente Supabase',()=>{
 it('cria espião com resposta validada quando RPC depende do receiver',async()=>{
  const {db,calls}=createFakeDb();
  const input={data:{
   houseId:'ashkar',sourceHoldingId:'active-network',
   codename:'O Corvo',portraitId:null,upgrades:[],requestKey:requestId,
  },context:{supabase:db}};
  const result=await (createSpyAgent as unknown as
   (input:typeof input)=>Promise<{id:string;status:string}>)(input);
  expect(result.id).toBe(agentId);
  expect(result.status).toBe('available');
  expect(calls).toEqual(['spy_create_agent']);
 });
 it('homologa missão bem-sucedida e verifica prêmio após commit',async()=>{
  const {db,calls}=createFakeDb();
  const input={data:{
   operationId:opId,roll:12,modifier:0,discovered:false,
   guardOverride:null,prisonOverride:null,
   expectedAgentVersion:1,requestKey:requestId,reason:'',
  },context:{supabase:db}};
  const result=await (resolveSpyAgentMission as unknown as
   (input:typeof input)=>Promise<{outcome:string;intelligenceStatus:string}>)(input);
  expect(result.outcome).toBe('mission_success');
  expect(result.intelligenceStatus).toBe('complete');
  expect(calls).toEqual([
   'is_campaign_admin','spy_resolve_agent_mission',
   'is_campaign_admin','spy_intelligence_operation_status',
  ]);
 });
 it('jamais interpreta sucesso sem prêmio persistido como dossiê completo',async()=>{
  const {db}=createFakeDb({completeAward:false});
  const input={data:{
   operationId:opId,roll:12,modifier:0,discovered:false,
   guardOverride:null,prisonOverride:null,
   expectedAgentVersion:1,requestKey:requestId,reason:'',
  },context:{supabase:db}};
  const result=await (resolveSpyAgentMission as unknown as
   (input:typeof input)=>Promise<{outcome:string;intelligenceStatus:string}>)(input);
  expect(result.outcome).toBe('mission_success');
  expect(result.intelligenceStatus).toBe('retry_required');
 });
 it('recusa resolução se a sessão não tiver papel de Narrador',async()=>{
  const {db,calls}=createFakeDb({narrator:false});
  const input={data:{
   operationId:opId,roll:12,modifier:0,discovered:false,
   guardOverride:null,prisonOverride:null,
   expectedAgentVersion:1,requestKey:requestId,reason:'',
  },context:{supabase:db}};
  await expect((resolveSpyAgentMission as unknown as
   (input:typeof input)=>Promise<unknown>)(input)).rejects.toThrow('Somente o Narrador');
  expect(calls).toEqual(['is_campaign_admin']);
 });
});
