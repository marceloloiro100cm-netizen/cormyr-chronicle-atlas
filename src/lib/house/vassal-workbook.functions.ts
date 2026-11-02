import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';

/** A approved vassal link permits the Ashkar reader to inspect this particular
 * imported Qazir workbook. It never grants membership of Qazir itself. */
export const loadQazirVassalWorkbook=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({
  parentHouseId:z.literal('ashkar'),
  vassalHouseId:z.literal('qazir'),
 }))
 .handler(async({data,context})=>{
  const db=context.supabase;
  const checkAccess=async()=>{
   const [admin,member]=await Promise.all([
    db.rpc('is_campaign_admin'),
    db.rpc('in_campaign_house',{h:data.parentHouseId,edit_required:false}),
   ]);
   if(admin.error||member.error||(!admin.data&&!member.data))
    throw new Error('A ficha importada da vassala não está autorizada para este acesso.');
   return Boolean(admin.data);
  };
  const wasAdmin=await checkAccess();
  // Only the current approved link in the authoritative parent sheet counts.
  const row=await db.from('noble_house_sheets')
   .select('state').eq('house_id',data.parentHouseId).maybeSingle();
  if(row.error||!row.data)
   throw new Error('Não foi possível conferir o vínculo de vassalagem.');
  const state=row.data.state as {vassals?:Array<{houseId?:string;status?:string}>};
  const approved=Array.isArray(state?.vassals)&&state.vassals.some(v=>
   v.houseId===data.vassalHouseId&&v.status==='approved');
  if(!approved)
   throw new Error('Vínculo Qazir–Ashkar ausente ou não aprovado.');
  const isAdminNow=await checkAccess();
  if(wasAdmin&&!isAdminNow)
   throw new Error('Permissão de Narrador alterada durante a consulta.');
  // Never import this module in a browser component: source stays on server.
  const {QAZIR_WORKBOOK}=await import('@/server/qazir-workbook');
  return QAZIR_WORKBOOK;
 });
