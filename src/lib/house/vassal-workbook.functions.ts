import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import type {VassalWorkbook} from './vassal-workbook';

/** A vassal's imported workbook may be viewed through its specifically
 * approved parent link, but that link never grants access to a private sheet.
 * Pairing is checked both here and in the source selector. */
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
   return Boolean(admin.data);
  };
  const wasAdmin=await checkAccess();
  const row=await db.from('noble_house_sheets')
   .select('state').eq('house_id',data.parentHouseId).maybeSingle();
  if(row.error||!row.data)
   throw new Error('Não foi possível conferir o vínculo de vassalagem.');
  const state=row.data.state as {vassals?:Array<{houseId?:string;status?:string}>};
  const approved=Array.isArray(state?.vassals)&&state.vassals.some(v=>
   v.houseId===data.vassalHouseId&&v.status==='approved');
  if(!approved)
   throw new Error('O vínculo de vassalagem está ausente ou não foi aprovado.');
  const isAdminNow=await checkAccess();
  if(wasAdmin&&!isAdminNow)
   throw new Error('Permissão de Narrador alterada durante a consulta.');
  if(data.parentHouseId==='ashkar'&&data.vassalHouseId==='qazir'){
   const {QAZIR_WORKBOOK}=await import('@/server/qazir-workbook');
   return QAZIR_WORKBOOK;
  }
  if(data.parentHouseId==='everlost'&&data.vassalHouseId==='everet'){
   const {EVERET_WORKBOOK}=await import('@/server/everet-workbook');
   return EVERET_WORKBOOK;
  }
  throw new Error('Vínculo de vassalagem não suportado.');
 });
