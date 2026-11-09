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
 agentRank:z.enum(['Verde','Treinada','Veterana','Elite']),
 agentCunning:z.number().int().min(3).max(6),
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
  const rpc=context.supabase.rpc.bind(context.supabase) as unknown as
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
  type GearRow={upgrade_code:string};
  type GearResponse={data:GearRow[]|null;error:{message:string}|null};
  type GearSelect={
   eq:(column:string,value:string)=>GearSelect&Promise<GearResponse>;
  };
  type GearTable={select:(columns:string)=>GearSelect};
  const db=context.supabase as unknown as {from:(table:string)=>GearTable};
  const perks=await db.from('spy_agent_upgrades')
   .select('upgrade_code').eq('owner_house_id',data.houseId).eq('agent_id',data.agentId);
  if(perks.error)throw new Error('Os equipamentos do agente não puderam ser verificados.');
  const codes=new Set((perks.data??[]).map(v=>v.upgrade_code));
  if([...codes].some(c=>!['forged_documents','ace_in_the_hole'].includes(c)))
   throw new Error('Equipamento inválido no cadastro da Casa.');
  const odds=spyMissionOdds(source.data.houseDefense,source.data.agentCunning);
  return {
   houseId:source.data.houseId,agentId:source.data.agentId,
   targetHouseId:source.data.targetHouseId,
   houseName:source.data.houseName,targetRegionId:regionId(source.data.targetRegionId),
   source:source.data.source,agentRank:source.data.agentRank,
   forgedDocuments:codes.has('forged_documents'),
   aceInTheHole:codes.has('ace_in_the_hole'),...odds,
  };
 });
