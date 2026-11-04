import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {resolveSpyPortraitImageUrl} from '@/lib/espionage/spy-portrait-manifest';
const input=z.object({houseId:z.string().trim().min(1).max(100)}).strict();
const status=z.enum(['available','assigned','traveling','operating','returning',
 'missing','captured','retired','lost','dead','pending_review']);
export const agentRowSchema=z.object({
 id:z.string().uuid(),codename:z.string().min(1).max(160),
 status,version:z.number().int().positive(),currentRegion:z.string().nullable(),
 missionSuccesses:z.number().int().nonnegative(),
 rank:z.enum(['Verde','Treinada','Veterana','Elite']),
 cunning:z.number().int().min(3).max(6),
 toNextRank:z.number().int().min(0).max(3),
 sourceHoldingId:z.string().nullable(),portraitId:z.string().nullable(),
 forgedDocuments:z.boolean(),
 aceInTheHole:z.boolean(),
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
 houseVersion:z.number().int().nonnegative(),
 portraits:z.array(z.object({
  id:z.string().min(1).max(80),label:z.string().min(1).max(100),
  imageUrl:z.string().url().startsWith('https://'),
  assignedAgentId:z.string().uuid().nullable(),
 }).strict()).max(1000),
}).strict();
export type SpyManagement=z.infer<typeof spyManagementSchema> & {
availableWealth:number|null;
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
  if(result.error){
   const denied=/não autorizado|nao autorizado|permission|unauthorized|JWT/i.test(result.error.message);
   throw new Error(denied
    ?'Seu acesso aos agentes desta Casa não está autorizado.'
    :'Não foi possível consultar os agentes. Atualize a tela e tente novamente.');
  }
  const parsed=spyManagementSchema.safeParse(result.data);
  if(!parsed.success||parsed.data.houseId!==data.houseId)
   throw new Error('Dados de espionagem inconsistentes para esta Casa.');

  const sheet=await context.supabase.from('noble_house_sheets')
   .select('state,version').eq('house_id',data.houseId).maybeSingle();
  // Wealth is supplementary: a sheet-RLS denial or pending migration must
  // never erase an already authorized agent roster. Protected SQL enforces
  // affordability at purchase time regardless of this UI estimate.
  let availableWealth:number|null=null;
  if(!sheet.error&&sheet.data?.state){
   try{
    const state=sheet.data.state as unknown as import('@/lib/house/types').HouseState;
    const {balances}=await import('@/lib/house/engine');
    const amount=balances(state).available.wealth;
    availableWealth=Number.isSafeInteger(amount)?amount:null;
   }catch{availableWealth=null;}
  }
  // Preserve RLS-scoped availability/assignments from PostgreSQL, but serve
  // official portrait images from the local website even while older database
  // rows still hold public Drive thumbnails. This changes no saved assignments.
  const portraits=parsed.data.portraits.map(p=>({
   ...p,imageUrl:resolveSpyPortraitImageUrl(p.id,p.imageUrl),
  }));
  return {...parsed.data,portraits,availableWealth};
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
