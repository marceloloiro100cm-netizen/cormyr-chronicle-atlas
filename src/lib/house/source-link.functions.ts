import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { confirmedSourceTotals, selectedSourceTotals, linkSourceTotals } from './source-link';
import { newHouseState, type HouseState } from './types';
import { reconciliationSources } from './reconciliation';

export const linkExistingHouseSources=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({key:z.string().uuid()})).handler(async({data,context})=>{
 const role=await context.supabase.rpc('is_campaign_admin');if(role.error||!role.data)throw new Error('Somente o Narrador pode vincular fichas.');
 const houses=await context.supabase.from('campaign_houses').select('id,name,region').eq('active',true).eq('season',2);
 const records=await context.supabase.from('campaign_records').select('id,house_id,title,content,version,source_file_id,source_modified_at').in('visibility',['house','player']);
 if(houses.error||records.error)throw new Error('Fontes indisponíveis.');
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const results:{house:string;status:string;message:string}[]=[];
 for(const h of houses.data??[]){
  const linked=await db.from('noble_house_source_links').select('house_id').eq('house_id',h.id).maybeSingle();
  if(linked.error)throw new Error('Vínculos indisponíveis.');if(linked.data){results.push({house:h.name,status:'linked',message:'Vínculo existente preservado.'});continue;}
  const sources=reconciliationSources(records.data??[]).filter(r=>r.house_id===h.id);
  if(sources.length!==1){results.push({house:h.name,status:'pending',message:'Fontes múltiplas ou ausentes; revisão necessária.'});continue;}
  const src=sources[0];if(!src)continue;
  try{
   const totals=confirmedSourceTotals(src,h.name);
   const current=await db.from('noble_house_sheets').select('state,version').eq('house_id',h.id).maybeSingle();if(current.error)throw new Error('Ficha indisponível.');
   const state=(current.data?.state??newHouseState(h.id,h.region??'')) as unknown as HouseState;
   const next=linkSourceTotals(state,totals,`record:${src.id}:v${src.version}`);
   const rpc=await db.rpc('commit_noble_house_source',{p_actor:context.userId,p_house:h.id,p_version:current.data?.version??0,p_key:data.key,p_record:src.id,p_source_version:src.version,p_source_hash:await sourceMd5(src.content),p_totals:totals,p_state:JSON.parse(JSON.stringify(next)),p_note:'Autorização do proprietário: vincular ficha existente e trazer totais conferidos; compras e originais preservados. Fonte '+src.title+' v'+src.version+'. Posses e tropas legadas pendentes.'});
   if(rpc.error)throw new Error(rpc.error.message);
   results.push({house:h.name,status:'linked',message:'Totais vinculados; compras preservadas.'});
  }catch(err){results.push({house:h.name,status:'pending',message:err instanceof Error?err.message:'Conciliação pendente.'});}
 }
 return results;
});
async function sourceMd5(content:string){
 // PostgreSQL compares the source in the same transaction. A portable hash avoids Node crypto in Workers.
 const {md5}=await import('./source-md5');return md5(content);
}
export const resolveHouseSource=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({houseId:z.string().min(1),recordId:z.string().uuid(),sourceVersion:z.number().int().positive(),origin:z.string().min(1),key:z.string().uuid()})).handler(async({data,context})=>{
 const role=await context.supabase.rpc('is_campaign_admin');if(role.error||!role.data)throw new Error('Somente o Narrador pode decidir a conciliação.');
 const house=await context.supabase.from('campaign_houses').select('id,name,region').eq('id',data.houseId).eq('active',true).eq('season',2).single();
 const source=await context.supabase.from('campaign_records').select('id,house_id,title,content,version,source_file_id,source_modified_at').eq('id',data.recordId).in('visibility',['house','player']).single();
 if(house.error||source.error)throw new Error('Casa ou fonte indisponível.');
 if(source.data.version!==data.sourceVersion)throw new Error('Fonte mudou; confira novamente os valores.');
 const totals=selectedSourceTotals(source.data,house.data.id,house.data.name,data.origin);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const current=await db.from('noble_house_sheets').select('state,version').eq('house_id',house.data.id).maybeSingle();if(current.error)throw new Error('Ficha indisponível.');
 const state=(current.data?.state??newHouseState(house.data.id,house.data.region??'')) as unknown as HouseState;
 const next=linkSourceTotals(state,totals,`record:${source.data.id}:v${source.data.version}`);
 const result=await db.rpc('commit_noble_house_source',{p_actor:context.userId,p_house:house.data.id,p_version:current.data?.version??0,p_key:data.key,p_record:source.data.id,p_source_version:source.data.version,p_source_hash:await sourceMd5(source.data.content),p_totals:totals,p_state:JSON.parse(JSON.stringify(next)),p_note:`Decisão explícita do Narrador: ${source.data.title} v${source.data.version}, ${data.origin}, bloco identificado ${house.data.name}. Totais ${JSON.stringify(totals)}. Outras fontes preservadas. Compras preservadas; nenhuma posse ou tropa legada importada.`});
 if(result.error)throw new Error(result.error.message);
 return {house:house.data.name,totals,message:'Conciliação aplicada; compras preservadas. Posses e tropas legadas não importadas.'};
});