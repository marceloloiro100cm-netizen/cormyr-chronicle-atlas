import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {VassalWorkbook} from './vassal-workbook';

// The membership AND the approved vassal link are checked before accessing the
// private workbook. The underlying table has no browser-side SELECT grant.
const allowedPair=z.union([
 z.object({parentHouseId:z.literal('ashkar'),vassalHouseId:z.literal('qazir')}),
 z.object({parentHouseId:z.literal('everlost'),vassalHouseId:z.literal('everet')}),
]);
export const loadVassalWorkbook=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(allowedPair)
 .handler(async({data,context}):Promise<VassalWorkbook>=>{
  const db=context.supabase;
  const checkAccess=async()=>{
   const [admin,member]=await Promise.all([
    db.rpc('is_campaign_admin'),
    db.rpc('in_campaign_house',{h:data.parentHouseId,edit_required:false}),
   ]);
   if(admin.error||member.error||(!admin.data&&!member.data))
    throw new Error('A ficha importada da vassala não está autorizada para este acesso.');
  };
  await checkAccess();
  const row=await db.from('noble_house_sheets')
   .select('state').eq('house_id',data.parentHouseId).maybeSingle();
  if(row.error||!row.data)
   throw new Error('Não foi possível conferir o vínculo de vassalagem.');
  const state=row.data.state as {vassals?:Array<{houseId?:string;status?:string}>};
  const approved=Array.isArray(state?.vassals)&&state.vassals.some(v=>
   v.houseId===data.vassalHouseId&&v.status==='approved');
  if(!approved)
   throw new Error('O vínculo de vassalagem está ausente ou não foi aprovado.');
  await checkAccess();

  // This import remains server-side. Database SELECT is granted only to the
  // service role, and only after the caller's live authorization checks.
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const privateDb=supabaseAdmin as unknown as SupabaseClient;
  const {data:privateRow,error:privateError}=await privateDb
   .from('campaign_private_vassal_workbooks')
   .select('payload')
   .eq('parent_house_id',data.parentHouseId)
   .eq('vassal_house_id',data.vassalHouseId)
   .maybeSingle();
  if(privateError||!privateRow?.payload)
   throw new Error('A ficha privada da vassala não está disponível.');
  await checkAccess();
  return privateRow.payload as VassalWorkbook;
 });
