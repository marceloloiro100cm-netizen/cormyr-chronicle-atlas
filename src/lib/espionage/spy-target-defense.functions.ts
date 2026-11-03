import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {resourcesSchema} from '@/lib/house/schemas';
import type {HouseState} from '@/lib/house/types';
import {regionId} from '@/lib/house/regions';
import {resolveSpyHouseDefense} from './spy-house-target-defense';

type RpcResult={data:unknown;error:{message:string}|null};
type Rpc=(name:string,args?:Record<string,unknown>)=>Promise<RpcResult>;
const listing=z.array(z.object({
 id:z.string().min(1),name:z.string().min(1),region:z.string().min(1),
}).strict()).max(500);
const partialSheet=z.object({
 schemaVersion:z.literal(1),houseId:z.string().min(1),
 base:resourcesSchema,permanent:resourcesSchema,
 method:z.enum(['budget','roll','import']),regionalApplied:z.boolean(),
 identity:z.object({region:z.string()}).passthrough(),
 domains:z.array(z.unknown()),holdings:z.array(z.unknown()),
 units:z.array(z.unknown()),projects:z.array(z.unknown()),
 court:z.array(z.unknown()),month:z.number().int(),
 rolls:z.array(z.unknown()),phase:z.enum(['draft','review','active']),
}).passthrough();

/** Narrator-only defense inspection. It NEVER returns the target's HouseState,
 * Law or defensive investments to another player. A missing sheet is checked
 * through a narrator-authorized SELECT, not guessed from an RLS error.
 *
 * This server function is for review/planning. Real mission adjudication
 * still requires the separate sealed operational write path.
 */
export const reviewSpyTargetDefense=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({
  targetHouseId:z.string().trim().min(1).max(100),
  domainId:z.string().trim().min(1).max(120).optional(),
 }).strict())
 .handler(async({data,context})=>{
  const admin=await context.supabase.rpc('is_campaign_admin');
  if(admin.error||admin.data!==true)throw new Error('Defesa de Casas rivais é restrita ao Narrador.');
  const rpc=context.supabase.rpc as unknown as Rpc;
  const publicResult=await rpc('spy_public_house_targets');
  if(publicResult.error)throw new Error('O catálogo de Casas ainda não está homologado.');
  const parsed=listing.safeParse(publicResult.data);
  if(!parsed.success)throw new Error('Cadastro público de alvos inválido.');
  const target=parsed.data.find(h=>h.id===data.targetHouseId);
  if(!target||!regionId(target.region))throw new Error('Casa alvo sem região oficial homologada.');
  const existing=await context.supabase.from('noble_house_sheets')
   .select('house_id,state').eq('house_id',data.targetHouseId).maybeSingle();
  if(existing.error)throw new Error('Não foi possível confirmar a existência da ficha da Casa.');
  if(!existing.data){
   const defense=resolveSpyHouseDefense({kind:'without_sheet',region:target.region});
   return {houseId:target.id,houseName:target.name,region:target.region,...defense};
  }
  const sheet=partialSheet.safeParse(existing.data.state);
  if(!sheet.success||sheet.data.houseId!==data.targetHouseId)
   throw new Error('Ficha existente porém inconsistente: Narrador deve reconciliá-la, sem aplicar Lei NPC.');
  const defense=resolveSpyHouseDefense({
   kind:'with_sheet',region:target.region,state:sheet.data as HouseState,
   ...(data.domainId?{domainId:data.domainId}:{}),
  });
  return {houseId:target.id,houseName:target.name,region:target.region,...defense};
 });
