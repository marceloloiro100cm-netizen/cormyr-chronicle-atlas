import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';

/** Fetch the full export audit only on explicit request. The regular house hub remains limited. */
export const loadFullHouseLedger=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({houseId:z.string().min(1).max(100)}))
 .handler(async({data,context})=>{
  const [admin,member]=await Promise.all([
    context.supabase.rpc('is_campaign_admin'),
    context.supabase.rpc('in_campaign_house',{h:data.houseId,edit_required:false})
  ]);
  if(admin.error||member.error||(!admin.data&&!member.data))throw new Error('Histórico desta Casa indisponível.');
  const rows:{id:string;action:string;explanation:string;rule:string;created_at:string;campaign_month:number;actor:string;version:number}[]=[];
  for(let from=0;from<10000;from+=500){
   const page=await context.supabase.from('noble_house_ledger')
    .select('id,action,explanation,rule,campaign_month,created_at,actor,version')
    .eq('house_id',data.houseId).order('version',{ascending:true}).range(from,from+499);
   if(page.error)throw new Error('Não foi possível consultar todo o histórico da Casa.');
   rows.push(...(page.data??[]));
   if((page.data?.length??0)<500)return rows;
  }
  throw new Error('Histórico acima de dez mil operações; exportação interrompida em vez de truncada.');
 });
