import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
const input=z.object({houseId:z.string().trim().min(1).max(100)}).strict();
const status=z.enum(['available','assigned','traveling','operating','returning',
 'missing','captured','retired','lost','dead','pending_review']);
const upgradeCode=z.enum(['forged_documents','ace_in_the_hole']);
export const agentRowSchema=z.object({
 id:z.string().uuid(),codename:z.string().min(1).max(160),
 status,version:z.number().int().positive(),currentRegion:z.string().nullable(),
 missionSuccesses:z.number().int().nonnegative(),
 rank:z.enum(['Verde','Treinada','Veterana','Elite']),
 cunning:z.number().int().min(3).max(6),
 toNextRank:z.number().int().min(0).max(3),
 sourceHoldingId:z.string().nullable(),
 forgedDocuments:z.boolean().default(false),
 aceInTheHole:z.boolean().default(false),
}).strict();
const operationRowSchema=z.object({
 id:z.string().uuid(),assetId:z.string().uuid(),missionKind:z.string().min(1),
 targetType:z.enum(['house','region','person']),targetId:z.string().min(1),
 status:z.enum(['draft','planned','traveling','operating','pending_narrator_review',
  'returning','completed','cancelled']),
 travelDays:z.number().int().nonnegative().nullable(),arrivalKey:z.string().nullable(),
 createdAt:z.string(),
}).strict();
const historySchema=z.object({
 id:z.string().uuid(),agentId:z.string().uuid(),
 eventType:z.enum(['recruited','mission_success','mission_failure','escaped',
  'captured','dead','promoted','upgrade_purchased']),
 dateKey:z.string().min(1),targetName:z.string().nullable(),
 targetRegion:z.string().nullable(),detail:z.string(),
 rank:z.enum(['Verde','Treinada','Veterana','Elite']),
 cunning:z.number().int().min(3).max(6),
 totalSuccesses:z.number().int().nonnegative(),
 failureDegrees:z.number().int().nullable(),operationId:z.string().uuid().nullable(),
}).strict();
const recruitmentSchema=z.object({
 sourceHoldingId:z.string().min(1),name:z.string().min(1),
 capacity:z.number().int().nonnegative(),
 occupied:z.number().int().nonnegative(),
 vacancies:z.number().int().nonnegative(),
}).strict();
export const spyManagementSchema=z.object({
 houseId:z.string().min(1),agents:z.array(agentRowSchema).max(2000),
 operations:z.array(operationRowSchema).max(5000),
 history:z.array(historySchema).max(15000),
 recruitment:z.array(recruitmentSchema).max(100),
}).strict();
export type SpyManagement=z.infer<typeof spyManagementSchema> & {
 houseVersion:number; availableWealth:number|null;
};
type RpcResult={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResult>;

/** Authenticated, house-scoped read; raw agent purchases are joined only
 * AFTER spy_house_management validates membership in PostgreSQL.
 */
export const loadSpyHouseManagement=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(input)
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc as unknown as Rpc;
  const result=await rpc('spy_house_management',{p_house:data.houseId});
  if(result.error)throw new Error('Gerenciamento de agentes indisponível ou não autorizado.');
  const parsed=spyManagementSchema.safeParse(result.data);
  if(!parsed.success||parsed.data.houseId!==data.houseId)
   throw new Error('Dados de espionagem inconsistentes para esta Casa.');

  const sheet=await context.supabase.from('noble_house_sheets')
   .select('state,version').eq('house_id',data.houseId).maybeSingle();
  if(sheet.error)throw new Error('Não foi possível conferir a Riqueza disponível da Casa.');
  let availableWealth:number|null=null;
  if(sheet.data?.state){
   const state=sheet.data.state as unknown as import('@/lib/house/types').HouseState;
   const {balances}=await import('@/lib/house/engine');
   const amount=balances(state).available.wealth;
   availableWealth=Number.isSafeInteger(amount)?amount:null;
  }
  const ids=parsed.data.agents.map(a=>a.id);
  const purchased=ids.length?await context.supabase.from('spy_agent_upgrades')
   .select('agent_id,upgrade_code').in('agent_id',ids):{data:[],error:null};
  if(purchased.error)throw new Error('Não foi possível consultar as compras dos agentes.');
  const upgradesByAgent=new Map<string,Set<string>>();
  for(const raw of purchased.data??[]){
   const item=z.object({agent_id:z.string().uuid(),upgrade_code}).safeParse(raw);
   if(!item.success||!ids.includes(item.data.agent_id))
    throw new Error('Equipamento retornou identidade de agente inválida.');
   const set=upgradesByAgent.get(item.data.agent_id)??new Set<string>();
   set.add(item.data.upgrade_code);upgradesByAgent.set(item.data.agent_id,set);
  }
  return {
   ...parsed.data,
   agents:parsed.data.agents.map(a=>({
    ...a,forgedDocuments:upgradesByAgent.get(a.id)?.has('forged_documents')??false,
    aceInTheHole:upgradesByAgent.get(a.id)?.has('ace_in_the_hole')??false,
   })),
   houseVersion:sheet.data?.version??0,availableWealth,
  };
 });
const renameSchema=input.extend({
 agentId:z.string().uuid(),expectedVersion:z.number().int().positive(),
 name:z.string().trim().min(2).max(80).refine(v=>!/[\x00-\x1F\x7F]/.test(v),'Nome inválido.'),
 requestKey:z.string().uuid(),
}).strict();
export const renameSpyAgent=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(renameSchema)
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc as unknown as Rpc;
  const result=await rpc('spy_rename_agent',{
   p_house:data.houseId,p_agent:data.agentId,
   p_name:data.name,p_expected_version:data.expectedVersion,
   p_request_key:data.requestKey,
  });
  if(result.error)throw new Error('Não foi possível salvar o nome. Verifique a autorização ou recarregue o agente.');
  const validated=z.object({
   id:z.string().uuid(),codename:z.string().min(2),version:z.number().int().positive(),
  }).strict().safeParse(result.data);
  if(!validated.success||validated.data.id!==data.agentId)
   throw new Error('Renomeação não pôde ser confirmada pelo banco.');
  return validated.data;
 });
