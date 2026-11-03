import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';

const base=z.object({houseId:z.string().min(1).max(100),
 agentId:z.string().uuid(),expectedAgentVersion:z.number().int().positive(),
 requestKey:z.string().uuid()}).strict();
const purchaseInput=base.extend({
 code:z.enum(['forged_documents','ace_in_the_hole']),
 expectedHouseVersion:z.number().int().nonnegative(),
}).strict();
const recruitInput=z.object({
 houseId:z.string().min(1).max(100),sourceHoldingId:z.string().min(1).max(160),
 codename:z.string().trim().min(2).max(80),
 requestKey:z.string().uuid(),
}).strict();
const purchaseResult=z.object({
 agentId:z.string().uuid(),upgrade:z.enum(['forged_documents','ace_in_the_hole']),
 alreadyApplied:z.boolean(),agentVersion:z.number().int().positive(),
 houseVersion:z.number().int().positive(),remainingWealthEstimate:z.number().optional(),
}).strict();
const recruitResult=z.object({
 id:z.string().uuid(),codename:z.string().min(2),
 status:z.literal('available'),rank:z.literal('Verde'),
 cunning:z.literal(3),missionSuccesses:z.literal(0),
}).strict();
type RpcResult={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResult>;

export const buySpyAgentUpgrade=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(purchaseInput)
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc as unknown as Rpc;
  const result=await rpc('spy_buy_agent_upgrade',{
   p_house:data.houseId,p_agent:data.agentId,p_code:data.code,
   p_expected_agent_version:data.expectedAgentVersion,
   p_expected_house_version:data.expectedHouseVersion,p_key:data.requestKey,
  });
  if(result.error)throw new Error('Compra não concluída. Confira a Riqueza e as permissões da Casa.');
  const parsed=purchaseResult.safeParse(result.data);
  if(!parsed.success||parsed.data.agentId!==data.agentId||parsed.data.upgrade!==data.code)
   throw new Error('Resposta inválida da compra de equipamento do agente.');
  return parsed.data;
 });

export const recruitSpyAgent=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(recruitInput)
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc as unknown as Rpc;
  const result=await rpc('spy_recruit_agent',{
   p_house:data.houseId,p_source_holding:data.sourceHoldingId,
   p_codename:data.codename,p_request_key:data.requestKey,
  });
  if(result.error)throw new Error('Recrutamento não autorizado: confira a vaga e o domínio ativo da Rede.');
  const parsed=recruitResult.safeParse(result.data);
  if(!parsed.success)throw new Error('Novo agente não pôde ser confirmado.');
  return parsed.data;
 });

const resolveInput=z.object({
 operationId:z.string().uuid(),
 roll:z.number().int().min(3).max(36),
 modifier:z.number().int().min(-9).max(9),
 discovered:z.boolean(),
 guardOverride:z.boolean().nullable(),
 prisonOverride:z.boolean().nullable(),
 expectedAgentVersion:z.number().int().positive(),
 requestKey:z.string().uuid(),reason:z.string().max(1200),
}).strict();
const resolveResult=z.object({
 operationId:z.string().uuid(),agentId:z.string().uuid(),
 alreadyApplied:z.boolean(),outcome:z.string().optional(),
 status:z.string(),rank:z.enum(['Verde','Treinada','Veterana','Elite']),
 cunning:z.number().int().min(3).max(6),
 missionSuccesses:z.number().int().nonnegative(),
 promoted:z.boolean().optional(),
 dateKey:z.string().optional(),targetName:z.string().optional(),
 failureDegrees:z.number().int().optional(),
 effectiveFailureDegrees:z.number().int().optional(),
 difficulty:z.number().int().optional(),
 forgedDocuments:z.boolean().optional(),aceInTheHole:z.boolean().optional(),
}).strict();
/** Only a real, pending adjudication may change an agent. SQL authenticates
 * the narrator independently and validates active mission + version + arrival.
 */
export const resolveSpyAgentMission=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(resolveInput)
 .handler(async({data,context})=>{
  const admin=await context.supabase.rpc('is_campaign_admin');
  if(admin.error||admin.data!==true)throw new Error('Somente o Narrador resolve missões.');
  const rpc=context.supabase.rpc as unknown as Rpc;
  const result=await rpc('spy_resolve_agent_mission',{
   p_operation:data.operationId,p_roll:data.roll,p_modifier:data.modifier,
   p_discovered:data.discovered,p_guard_override:data.guardOverride,
   p_prison_override:data.prisonOverride,
   p_expected_version:data.expectedAgentVersion,
   p_request_key:data.requestKey,p_reason:data.reason,
  });
  if(result.error)throw new Error('Resolução não aplicada. Verifique viagem, autorização e versão da missão.');
  const parsed=resolveResult.safeParse(result.data);
  if(!parsed.success||parsed.data.operationId!==data.operationId)
   throw new Error('Resultado de missão inconsistente.');
  return parsed.data;
 });
