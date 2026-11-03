import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {regionId} from '@/lib/house/regions';

const rowSchema=z.object({id:z.string().min(1).max(100),
 name:z.string().min(1).max(200),region:z.string().min(1).max(100)}).passthrough();
export const spyHouseTargetSchema=z.object({
 id:z.string().min(1).max(100),name:z.string().min(1).max(200),
 regionId:z.string().min(1),
}).strict();

/** Public target locator only: active House ID/name/region. Never expose
 * state, Law, construction bonuses, family data or member identities.
 */
export const listSpyHouseTargets=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({}).strict())
 .handler(async({context})=>{
  const active=await context.supabase.rpc('campaign_access_active');
  if(active.error||active.data!==true)throw new Error('Campanha indisponível para este acesso.');
  const response=await context.supabase.from('campaign_houses')
   .select('id,name,region')
   .eq('active',true).order('name').limit(500);
  if(response.error)throw new Error('Não foi possível consultar o cadastro público de Casas.');
  const targets: z.infer<typeof spyHouseTargetSchema>[]=[];
  for(const raw of response.data??[]){
   const parsed=rowSchema.safeParse(raw);
   if(!parsed.success)continue;
   const region=regionId(parsed.data.region);
   if(!region)continue;
   targets.push({id:parsed.data.id,name:parsed.data.name,regionId:region});
  }
  return z.array(spyHouseTargetSchema).max(500).parse(targets);
 });
