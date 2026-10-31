import {createServerFn} from '@tanstack/react-start';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {balances,maxHouseStatus} from './engine';
import type {HouseState} from './types';

const onlyAdmin=async(db:SupabaseClient<Database>)=>{
 const r=await db.rpc('is_campaign_admin');
 if(r.error||!r.data)throw new Error('Somente o Narrador pode consultar este painel.');
};
const houseInput=z.object({houseId:z.string().min(1).max(100)});
export const readHouseGmNotes=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator(houseInput).handler(async({data,context})=>{
  await onlyAdmin(context.supabase);
  const r=await context.supabase.from('noble_house_gm_notes').select('notes,secret_state,updated_at').eq('house_id',data.houseId).maybeSingle();
  if(r.error)throw new Error('Notas privadas indisponíveis.');
  return r.data??{notes:'',secret_state:{},updated_at:null};
 });
export const saveHouseGmNotes=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator(houseInput.extend({notes:z.string().max(60000)}))
 .handler(async({data,context})=>{
  await onlyAdmin(context.supabase);
  const exists=await context.supabase.from('campaign_houses').select('id').eq('id',data.houseId).maybeSingle();
  if(exists.error||!exists.data)throw new Error('Casa não encontrada.');
  const r=await context.supabase.from('noble_house_gm_notes').upsert({house_id:data.houseId,notes:data.notes,updated_at:new Date().toISOString()},{onConflict:'house_id'});
  if(r.error)throw new Error('Não foi possível atualizar as notas privadas.');
  return {saved:true};
 });
export const loadKingdomHouseOverview=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .handler(async({context})=>{
  await onlyAdmin(context.supabase);
  const [houses,sheets]=await Promise.all([
   context.supabase.from('campaign_houses').select('id,name,region,active').order('name'),
   context.supabase.from('noble_house_sheets').select('house_id,state,version,updated_at')
  ]);
  if(houses.error||sheets.error)throw new Error('Quadro do Reino indisponível.');
  const byHouse=new Map((sheets.data??[]).map(row=>[row.house_id,row]));
  return (houses.data??[]).map(house=>{
   const sheet=byHouse.get(house.id),state=sheet?.state as unknown as HouseState|undefined;
   const totals=state?balances(state):null;
   return {id:house.id,name:house.name,region:house.region??'',active:house.active,
     phase:state?.phase??'not_configured',version:sheet?.version??0,
     month:state?.month??null,influence:totals?.total.influence??null,
     status:totals?maxHouseStatus(totals.total.influence):null,
     available:totals?.available??null,
     units:state?.units.filter(u=>!u.destroyed).length??0,
     holdings:state?.holdings.filter(h=>h.status==='active').length??0,
     pending:state?.pending.length??0
   };
  });
 });
