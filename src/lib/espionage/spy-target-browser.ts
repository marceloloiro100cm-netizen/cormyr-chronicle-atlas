import {z} from 'zod';
import {supabase} from '@/integrations/supabase/client';
import {regionId} from '@/lib/house/regions';
import {spyMissionOdds} from './spy-mission-probability';
import {spyHouseTargetSchema} from './spy-house-targets.functions';

type RpcResponse={data:unknown;error:{message:string}|null};
type BrowserRpc=(name:string,args?:Record<string,unknown>)=>Promise<RpcResponse>;
const rpc=supabase.rpc as unknown as BrowserRpc;

const publicRow=z.object({
 id:z.string().min(1).max(100),
 name:z.string().min(1).max(200),
 region:z.string().min(1).max(100),
}).strict();

const targetPreview=z.object({
 houseId:z.string().min(1),agentId:z.string().uuid(),
 targetHouseId:z.string().min(1),houseName:z.string().min(1),
 targetRegionId:z.string().min(1),
 houseDefense:z.number().int().min(6).max(100000),
 agentRank:z.enum(['Verde','Treinada','Veterana','Elite']),
 agentCunning:z.number().int().min(3).max(6),
 source:z.enum(['operational_sheet','official_spreadsheet','regional_fallback']),
 provisional:z.literal(true),
}).strict();

async function ensureSession(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token)throw new Error('Entre novamente para consultar as Casas nobres.');
}

/** The source is the 172-house reviewed catalog, not only the eight
 * campaign_houses records. The DB exposes ID, name and region, never Law
 * or private attributes in the selector.
 *
 * Query with the same browser JWT used by the agent roster: TanStack server
 * function transport can lose the browser's auth context on this route.
 */
export async function readSpyNobleHouseTargetsBrowser(){
 await ensureSession();
 const response=await rpc('spy_public_noble_targets');
 if(response.error)throw new Error('A lista de Casas não pôde ser carregada. Atualize a sessão.');
 const parsed=z.array(publicRow).max(500).safeParse(response.data);
 if(!parsed.success)throw new Error('Formato inesperado da lista oficial de Casas.');

 const seen=new Set<string>();
 const result:z.infer<typeof spyHouseTargetSchema>[]=[];
 for(const row of parsed.data){
  const region=row.region.trim().toLowerCase()==='crownland'
   ?'crownlands':regionId(row.region);
  if(!region||seen.has(row.id))continue;
  seen.add(row.id);
  result.push({id:row.id,name:row.name,regionId:region});
 }
 return z.array(spyHouseTargetSchema).max(500).parse(result);
}

/** Per-target authorized preview. Never loads the other House's sheet into
 * the browser; SQL checks house membership, agent and reviewed target, and
 * returns only aggregated DC for an exact dice probability.
 */
export async function readSpyMissionOddsBrowser(input:{
 houseId:string;agentId:string;targetHouseId:string;
}){
 await ensureSession();
 const response=await rpc('spy_player_mission_preview',{
  p_house:input.houseId,p_agent:input.agentId,p_target:input.targetHouseId,
 });
 if(response.error)throw new Error('Não foi possível avaliar esta Casa. Confira o agente e o alvo.');
 const parsed=targetPreview.safeParse(response.data);
 if(!parsed.success||parsed.data.houseId!==input.houseId||
  parsed.data.agentId!==input.agentId||
  parsed.data.targetHouseId!==input.targetHouseId||
  !regionId(parsed.data.targetRegionId))
  throw new Error('Prévia de espionagem inconsistente.');

 type GearRow={upgrade_code:string};
 type GearResponse={data:GearRow[]|null;error:{message:string}|null};
 type GearQuery={eq:(column:string,value:string)=>GearQuery&Promise<GearResponse>};
 type GearTable={select:(fields:string)=>GearQuery};
 const db=supabase as unknown as {from:(name:string)=>GearTable};
 const gear=await db.from('spy_agent_upgrades').select('upgrade_code')
  .eq('owner_house_id',input.houseId).eq('agent_id',input.agentId);
 if(gear.error)throw new Error('Não foi possível validar os equipamentos do espião.');
 const upgrades=new Set((gear.data??[]).map(item=>item.upgrade_code));
 if([...upgrades].some(code=>!['forged_documents','ace_in_the_hole'].includes(code)))
  throw new Error('Equipamento desconhecido no cadastro.');

 const data=parsed.data;
 return {
  houseId:data.houseId,agentId:data.agentId,targetHouseId:data.targetHouseId,
  houseName:data.houseName,targetRegionId:regionId(data.targetRegionId),
  source:data.source,agentRank:data.agentRank,
  forgedDocuments:upgrades.has('forged_documents'),
  aceInTheHole:upgrades.has('ace_in_the_hole'),
  ...spyMissionOdds(data.houseDefense,data.agentCunning),
 };
}
