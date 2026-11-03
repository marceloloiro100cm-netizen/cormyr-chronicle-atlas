import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';

/** Validated, whitelisted intelligence projection: never expose raw target sheets,
 * private target Law, unapproved facts, sealed reports or Narrator-only decisions.
 */
const fact=z.object({
 id:z.string().uuid().optional(),
 fieldCode:z.string().min(1),
 disclosedValue:z.union([z.string(),z.number(),z.boolean(),z.null()]),
 confidence:z.enum(['rumor','partial','confirmed','disputed']),
 observedDateKey:z.string().min(1),
 staleAtDateKey:z.string().nullable().optional(),
}).strict();
export const spyHouseDashboardSchema=z.object({
 houseId:z.string().min(1),
 agents:z.array(z.object({
  id:z.string().uuid(),codename:z.string(),kind:z.enum(['network_cell','contractor','local_contact']),
  status:z.string(),currentLocationId:z.string().uuid().nullable(),version:z.number().int(),
 }).strict()).max(2000),
 missions:z.array(z.object({
  id:z.string().uuid(),assetId:z.string().uuid(),missionKind:z.string(),
  targetType:z.enum(['house','region','person']),targetId:z.string(),
  requestedFields:z.array(z.string()),status:z.string(),version:z.number().int(),
 }).strict()).max(2000),
 reports:z.array(z.object({
  id:z.string().uuid(),code:z.string(),operationId:z.string().uuid(),
  state:z.enum(['released','archived']),observedDateKey:z.string(),
  releaseDateKey:z.string(),assetCodename:z.string(),locationLabel:z.string(),
  requestedFields:z.array(z.string()),facts:z.array(fact).max(200),
 }).strict()).max(2000),
 dossiers:z.array(z.object({
  id:z.string().uuid(),targetType:z.enum(['house','region','person']),targetId:z.string(),
  version:z.number().int(),facts:z.array(fact.omit({id:true}).extend({
   id:z.string().uuid().optional(),
  })).max(2000),
 }).strict()).max(2000),
}).strict();
export type SpyHouseDashboard=z.infer<typeof spyHouseDashboardSchema>;

type RpcResult={data:unknown;error:{message:string}|null};
type SpyRpc=(name:string,args:{p_house:string})=>Promise<RpcResult>;

/** Authenticated TanStack server function. The SQL uses SECURITY INVOKER AND
 * RLS; the client houseId is only a query filter, never a permission grant.
 */
export const loadSpyHouseDashboard=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({houseId:z.string().min(1).max(100)}))
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc as unknown as SpyRpc;
  const result=await rpc('spy_read_house_dashboard',{p_house:data.houseId});
  if(result.error)throw new Error('Registro operacional indisponível ou ainda não instalado.');
  const parsed=spyHouseDashboardSchema.safeParse(result.data);
  if(!parsed.success||parsed.data.houseId!==data.houseId)
   throw new Error('Resposta de espionagem inválida. Nenhum dado foi exibido.');
  return parsed.data;
 });
