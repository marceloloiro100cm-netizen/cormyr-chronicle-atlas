import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {spyRegionalStrategySchema} from './region-turns';

type RpcResult={data:unknown;error:{message:string}|null};
type SpyRegionalRpc=(name:string,args:{p_house:string})=>Promise<RpcResult>;

/** Client-selected houseId is NOT a permission: the SQL verifies JWT membership
 * and obtains each agent's region from spy_assets.current_location_id.
 */
export const loadSpyRegionalStrategy=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({houseId:z.string().trim().min(1).max(100)}).strict())
 .handler(async({data,context})=>{
  const rpc=context.supabase.rpc.bind(context.supabase) as unknown as SpyRegionalRpc;
  const result=await rpc('spy_get_regional_strategy',{p_house:data.houseId});
  if(result.error)throw new Error('Movimentação regional ainda indisponível para esta Casa.');
  const parsed=spyRegionalStrategySchema.safeParse(result.data);
  if(!parsed.success||parsed.data.houseId!==data.houseId)
   throw new Error('Posição de agentes inválida; nenhum itinerário foi calculado.');
  return parsed.data;
 });
