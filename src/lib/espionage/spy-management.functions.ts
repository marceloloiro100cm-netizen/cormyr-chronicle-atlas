import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
const input=z.object({houseId:z.string().trim().min(1).max(100)}).strict();
const status=z.enum(['available','assigned','traveling','operating','returning',
 'missing','captured','retired','lost','pending_review']);
export const agentRowSchema=z.object({
 id:z.string().uuid(),codename:z.string().min(1).max(160),
 status,version:z.number().int().positive(),currentRegion:z.string().nullable(),
}).strict();
const operationRowSchema=z.object({
 id:z.string().uuid(),assetId:z.string().uuid(),missionKind:z.string().min(1),
 targetType:z.enum(['house','region','person']),targetId:z.string().min(1),
 status:z.enum(['draft','planned','traveling','operating','pending_narrator_review',
  'returning','completed','cancelled']),
 travelDays:z.number().int().nonnegative().nullable(),arrivalKey:z.string().nullable(),
 createdAt:z.string(),
}).strict();
export const spyManagementSchema=z.object({
 houseId:z.string().min(1),agents:z.array(agentRowSchema).max(2000),
 operations:z.array(operationRowSchema).max(5000),
}).strict();
export type SpyManagement=z.infer<typeof spyManagementSchema>;
type RpcResult={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResult>;

/** Security boundary: the SQL verifies active authenticated membership, not
 * the houseId or a client admin prop. No direct table writes are exposed.
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
  return parsed.data;
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
