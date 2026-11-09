import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';

const input=z.object({houseId:z.string().trim().min(1).max(100)}).strict();
export const spyRecruitmentOptionsSchema=z.object({
 houseId:z.string().min(1),
 recruitment:z.array(z.object({
  sourceHoldingId:z.string().min(1),
  name:z.string().min(1),
  capacity:z.number().int().nonnegative(),
  occupied:z.number().int().nonnegative(),
  vacancies:z.number().int().nonnegative(),
 }).strict()).max(100),
 portraits:z.array(z.object({
  id:z.string().min(1).max(80),label:z.string().min(1).max(100),
  imageUrl:z.string().url().startsWith('https://'),
  assignedAgentId:z.string().uuid().nullable(),
  // Optional during staged deployment: PostgreSQL returns a global occupancy
  // flag without leaking the agent ID or identity of other Houses.
  occupied:z.boolean().optional(),
 }).strict()).max(1000),
}).strict();
export type SpyRecruitmentOptions=z.infer<typeof spyRecruitmentOptionsSchema>;
type RpcResponse={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<RpcResponse>;

/** Query only the vacancy catalogue needed by the form. The SQL function
 * verifies ownership/permission independently; no full agent-roster read is
 * needed. If unavailable, show an error rather than 'no vacancies'.
 */
export const loadSpyRecruitmentOptions=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(input)
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc.bind(context.supabase) as unknown as Rpc;
  const result=await rpc('spy_recruitment_options',{p_house:data.houseId});
  if(result.error){
   const denied=/não autorizad|nao autorizad|permission|unauthorized|JWT/i.test(result.error.message);
   throw new Error(denied
    ?'Você não possui autorização para recrutar agentes desta Casa.'
    :'Não foi possível consultar as vagas. Atualize o formulário.');
  }
  const parsed=spyRecruitmentOptionsSchema.safeParse(result.data);
  if(!parsed.success||parsed.data.houseId!==data.houseId)
   throw new Error('O cadastro de vagas está inconsistente. Atualize o formulário.');
  return parsed.data;
 });
