import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {V3_COMMANDERS} from './commanders';
import {MODEL_HOUSES} from './model-houses';
import {SCENARIOS} from '../geometry/map-fixtures';

const uuid=z.string().uuid();
const commanderId=z.enum(V3_COMMANDERS.map(c=>c.id) as [string,...string[]]);
const modelId=z.enum(MODEL_HOUSES.map(h=>h.id) as [string,...string[]]);
const scenarioId=z.enum(Object.keys(SCENARIOS) as [string,...string[]]);
const inviteData=z.object({
 title:z.string().trim().min(5).max(120),
 houseId:z.string().trim().min(1).max(100),
 scenario:scenarioId,
 attackerHouseId:modelId,defenderHouseId:modelId,
 attackerCommander:commanderId,defenderCommander:commanderId,
}).strict();
const deleteData=z.object({id:uuid}).strict();
type Db={rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;from:(table:string)=>any};
export type BattleV3Invitation=Readonly<{
 id:string;title:string;target_house_id:string;scenario:string;
 attacker_model_id:string;defender_model_id:string;
 attacker_commander:string;defender_commander:string;
 created_at:string;status:'open'|'closed';
}>;
async function requireAccess(db:Db){
 const active=await db.rpc('campaign_access_active');
 if(active.error||active.data!==true)
  throw new Error('O acesso à campanha não está ativo.');
}
async function requireNarrator(db:Db){
 const [role,access]=await Promise.all([db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(role.error||access.error||role.data!==true||access.data!==true)
  throw new Error('Convocação exclusiva do Narrador.');
}
/** RLS em battle_v3_invitations garante que o jogador veja apenas sua casa.
 * Este endpoint não consulta nenhuma ficha de exército e não oferece gravações táticas.
 */
export const listV3Invitations=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const db=context.supabase as unknown as Db;
  await requireAccess(db);
  const found=await db.from('battle_v3_invitations')
   .select('id,title,target_house_id,scenario,attacker_model_id,defender_model_id,attacker_commander,defender_commander,created_at,status')
   .eq('status','open').order('created_at',{ascending:false}).limit(30);
  if(found.error)throw new Error('Convocações de batalha indisponíveis neste momento.');
  await requireAccess(db);
  return (found.data??[]) as BattleV3Invitation[];
 });
export const createV3Invitation=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(inviteData)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Db;
  await requireNarrator(db);
  const house=await db.from('campaign_houses').select('id')
   .eq('id',data.houseId).eq('active',true).eq('season',2).maybeSingle();
  if(house.error||!house.data?.id)throw new Error('Casa de destino não está ativa nesta temporada.');
  await requireNarrator(db);
  const result=await db.from('battle_v3_invitations').insert({
   title:data.title,target_house_id:data.houseId,created_by:context.userId,
   scenario:data.scenario,attacker_model_id:data.attackerHouseId,
   defender_model_id:data.defenderHouseId,attacker_commander:data.attackerCommander,
   defender_commander:data.defenderCommander,status:'open',
  }).select('id').single();
  if(result.error||!result.data?.id)throw new Error('Não foi possível convocar esta batalha.');
  return {id:String(result.data.id)};
 });
export const closeV3Invitation=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(deleteData)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Db;
  await requireNarrator(db);
  const result=await db.from('battle_v3_invitations').update({status:'closed'}).eq('id',data.id)
   .select('id').maybeSingle();
  if(result.error||!result.data?.id)throw new Error('Convocação não encontrada ou não autorizada.');
  return {closed:true as const};
 });
