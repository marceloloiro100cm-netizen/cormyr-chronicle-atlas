import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {regionId} from '@/lib/house/regions';
import {spyMissionOdds} from './spy-mission-probability';

const input=z.object({
 houseId:z.string().trim().min(1).max(100),
 agentId:z.string().uuid(),
 targetHouseId:z.string().trim().min(1).max(100),
}).strict();
const previewSource=z.object({
 houseId:z.string(),agentId:z.string().uuid(),targetHouseId:z.string(),
 houseName:z.string().min(1),targetRegionId:z.string().min(1),
 houseDefense:z.number().int().min(0).max(100000),
 source:z.enum(['operational_sheet','official_spreadsheet','regional_fallback']),
 provisional:z.literal(true),
}).strict();

/** Client never receives HouseState, source Law, Holdings, member identity or
 * unpublished notes. PostgreSQL checks real JWT membership and agent ownership
 * for every single target. The number returned is explicitly a PREVIEW.
 */
export const previewSpyMissionOdds=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(input)
 .handler(async({data,context})=>{
  type RpcResult={data:unknown;error:{message:string}|null};
  const rpc=context.supabase.rpc as unknown as
   (name:string,args:Record<string,unknown>)=>Promise<RpcResult>;
  const result=await rpc('spy_player_mission_preview',{
   p_house:data.houseId,p_agent:data.agentId,p_target:data.targetHouseId,
  });
  if(result.error)throw new Error('A prévia da missão não está disponível para este agente e alvo.');
  const source=previewSource.safeParse(result.data);
  if(!source.success||source.data.houseId!==data.houseId||
   source.data.agentId!==data.agentId||source.data.targetHouseId!==data.targetHouseId||
   !regionId(source.data.targetRegionId))
   throw new Error('Resposta de espionagem inconsistente; nenhum percentual foi calculado.');
  const odds=spyMissionOdds(source.data.houseDefense);
  return {
   houseId:source.data.houseId,agentId:source.data.agentId,
   targetHouseId:source.data.targetHouseId,
   houseName:source.data.houseName,targetRegionId:regionId(source.data.targetRegionId),
   source:source.data.source,...odds,
  };
 });
