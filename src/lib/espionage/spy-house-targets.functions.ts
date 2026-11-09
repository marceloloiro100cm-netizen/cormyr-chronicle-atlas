import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {regionId} from '@/lib/house/regions';

const rowSchema=z.object({id:z.string().min(1).max(100),
 name:z.string().min(1).max(200),region:z.string().min(1).max(100)}).strict();
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
  // All 172 reviewed houses are listed; 170 carry imported official stats. Its
  // raw archival JSON is private: this SECURITY DEFINER RPC returns ONLY
  // id/name/region for all 172 reviewed Houses, and checks active JWT.
  type RpcResult={data:unknown;error:{message:string}|null};
  const rpc=context.supabase.rpc.bind(context.supabase) as unknown as
   (name:string,args?:Record<string,never>)=>Promise<RpcResult>;
  const response=await rpc('spy_public_noble_targets');
  if(response.error)throw new Error('Catálogo público de Casas ainda não homologado para espionagem.');
  const safeRows=z.array(rowSchema).max(500).safeParse(response.data);
  if(!safeRows.success)throw new Error('Catálogo de Casas retornou dados inesperados.');
  const targets: z.infer<typeof spyHouseTargetSchema>[]=[];
  for(const raw of safeRows.data){
   const parsed=rowSchema.safeParse(raw);
   if(!parsed.success)continue;
   const region=parsed.data.region.trim().toLowerCase()==='crownland'
    ?'crownlands':regionId(parsed.data.region);
   if(!region)continue;
   targets.push({id:parsed.data.id,name:parsed.data.name,regionId:region});
  }
  return z.array(spyHouseTargetSchema).max(500).parse(targets);
 });
