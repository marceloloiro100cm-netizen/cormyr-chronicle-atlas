import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {spyRegionLinkInput} from './region-review-schema';

type Result={data:unknown;error:{message:string}|null};
type Rpc=(procedure:string,args:Record<string,unknown>)=>Promise<Result>;

/** Only genuine narrator JWT can authorize a route. The production SQL RPC
 * independently checks auth.uid(), active access and is_campaign_admin().
 * Never accept a client-side "isAdmin" bit as sufficient authorization.
 */
export const approveSpyRegionLink=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(spyRegionLinkInput)
 .handler(async({data,context})=>{
  const auth=await context.supabase.rpc('is_campaign_admin');
  if(auth.error||auth.data!==true)
   throw new Error('Somente o Narrador pode homologar rotas.');
  const rpc=context.supabase.rpc.bind(context.supabase) as unknown as Rpc;
  const result=await rpc('spy_review_region_link',{
   p_id:data.id,p_from:data.fromRegion,p_to:data.toRegion,
   p_passage:data.passage,p_bidirectional:data.bidirectional,
   p_approved:data.approved,p_blocked:data.blocked,
   p_visibility:data.visibility,p_source:data.source,
   p_expected_version:0,p_request_key:data.requestKey,p_reason:data.reason,
  });
  if(result.error)throw new Error('Não foi possível homologar a conexão; confira a origem, o motivo e as permissões.');
  return {approved:true as const,routeId:data.id};
 });
