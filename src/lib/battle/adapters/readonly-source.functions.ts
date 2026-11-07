import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {HouseState} from '@/lib/house/types';
import {battleHouseDirectory} from './house-directory';
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
async function readState(db:Context['supabase'],houseId:string):Promise<{state:HouseState;version:number}|null>{
 const query=await db.from('noble_house_sheets')
  .select('state,version').eq('house_id',houseId).maybeSingle();
 if(query.error)throw new Error('Não foi possível consultar a ficha militar.');
 if(!query.data)return null;
 if(!query.data.state)throw new Error('Ficha militar registrada sem dados.');
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
  const [catalog,campaign]=await Promise.all([
   db.from('house_catalog').select('id,name,region')
    .eq('public_reviewed',true).order('name').limit(500),
   db.from('campaign_houses').select('id,name,region')
    .eq('active',true).eq('season',2).order('name').limit(500),
  ]);
  if(catalog.error||campaign.error)
   throw new Error('O catálogo regional de casas está indisponível.');
  await requireNarrator(db);
  const safe=(data:unknown)=>{
   if(!Array.isArray(data))return [];
   return data.filter((row):row is {id:string;name:string;region:string|null}=>{
    return row!==null&&typeof row==='object'&&
     typeof row.id==='string'&&typeof row.name==='string'&&
     (row.region===null||typeof row.region==='string');
   }).map(row=>({id:row.id,name:row.name,region:row.region??''}));
  };
  return battleHouseDirectory(safe(catalog.data),safe(campaign.data));
 });
export const listBattleSourceUnits=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(sourceQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const record=await readState(db,data.houseId);
  if(!record){
   await requireNarrator(db);
   return {houseId:data.houseId,sourceVersion:null,sourceStatus:'no-military-sheet' as const,units:[]};
  }
  const {state,version}=record;
  const roster=state.units.map(unit=>({
   id:unit.id,name:unit.name,types:unit.types,training:unit.training,
   strength:unit.strength,casualties:unit.casualties,destroyed:Boolean(unit.destroyed),
  }));
  await requireNarrator(db);
  return {houseId:data.houseId,sourceVersion:version,
   sourceStatus:roster.length?'recorded' as const:'empty' as const,units:roster};
 });
/** O cliente envia IDs e decisão, JAMAIS um HouseState. A conversão acontece no servidor. */
export const previewBattleSourceStack=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth]).inputValidator(importQuery)
 .handler(async({data,context})=>{
  const db=context.supabase as unknown as Context['supabase'];
  await requireNarrator(db);
  const source=await readState(db,data.houseId);
  if(!source)throw new Error('Esta casa ainda não possui ficha militar registrada no site.');
  const {state,version}=source;
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
