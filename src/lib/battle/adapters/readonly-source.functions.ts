import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {HouseState,Unit} from '@/lib/house/types';
import {adaptOfficialUnit} from './unit-readonly';

const sourceQuery=z.object({houseId:z.string().min(1).max(100)}).strict();
const importQuery=sourceQuery.extend({
 unitId:z.string().min(1).max(90),
 side:z.enum(['attacker','defender']),
 position:z.object({q:z.number().int().safe(),r:z.number().int().safe()}).strict(),
 primaryTypeId:z.string().min(1).max(60),
 profileDecisionReason:z.string().trim().max(500).optional(),
}).strict();
type Context={supabase:{
 rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;
 from:(table:string)=>any;
}};
async function requireNarrator(db:Context['supabase']):Promise<void>{
 const [role,active]=await Promise.all([db.rpc('is_campaign_admin'),db.rpc('campaign_access_active')]);
 if(role.error||active.error||role.data!==true||active.data!==true)
  throw new Error('Consulta restrita ao Narrador autorizado.');
}
async function readState(db:Context['supabase'],houseId:string):Promise<{state:HouseState;version:number}>{
 const query=await db.from('noble_house_sheets')
  .select('state,version').eq('house_id',houseId).maybeSingle();
 if(query.error||!query.data?.state)throw new Error('Ficha militar oficial indisponível.');
 const state=query.data.state as HouseState;
 if(state.houseId!==houseId||!Array.isArray(state.units))
  throw new Error('Fonte militar inconsistente.');
 const version=Number(query.data.version);
 if(!Number.isInteger(version)||version<0)throw new Error('Versão oficial inválida.');
 return {state,version};
}
/** Não retorna HouseState nem atributos privados; somente casas sob sessão administrativa. */
export const listBattleSourceHouses=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const response=await db.from('campaign_houses').select('id,name').order('name').limit(400);
  if(response.error)throw new Error('Casas não disponíveis.');
  await requireNarrator(db);
  return ((response.data??[]) as {id:string;name:string}[])
   .filter(h=>typeof h.id==='string'&&typeof h.name==='string')
   .map(h=>({id:h.id,name:h.name}));
 });
export const listBattleSourceUnits=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(sourceQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const {state,version}=await readState(db,data.houseId);
  const roster=state.units.map(unit=>({
   id:unit.id,name:unit.name,types:unit.types,training:unit.training,
   strength:unit.strength,casualties:unit.casualties,destroyed:Boolean(unit.destroyed),
  }));
  await requireNarrator(db);
  return {houseId:data.houseId,sourceVersion:version,units:roster};
 });
/** O cliente envia IDs e decisão, JAMAIS um HouseState. A conversão acontece no servidor. */
export const previewBattleSourceStack=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(importQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const {state,version}=await readState(db,data.houseId);
  const unit=state.units.find(u=>u.id===data.unitId);
  if(!unit)throw new Error('Unidade de origem indisponível.');
  const stack=adaptOfficialUnit(state,unit,{
   houseId:data.houseId,unitId:data.unitId,side:data.side,
   position:data.position,primaryTypeId:data.primaryTypeId,
   ...(data.profileDecisionReason?{profileDecisionReason:data.profileDecisionReason}:{}),
   sourceVersion:version,capturedAt:new Date().toISOString(),
  });
  await requireNarrator(db);
  return stack;
 });
