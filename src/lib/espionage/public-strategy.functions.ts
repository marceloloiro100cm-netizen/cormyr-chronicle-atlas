import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {publicSpyGraphSchema} from './public-strategy';

/** Read only public, RLS-approved travel topology. Narrator-only source,
 * rationale, private endpoints and blocked links NEVER leave the server.
 */
export const loadPublicSpyRoutes=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({}).strict())
 .handler(async({context})=>{
  const [locationResult,edgeResult]=await Promise.all([
   context.supabase.from('spy_locations').select('id,kind,ref_id,name')
    .eq('approved',true).eq('visibility','public').limit(3000),
   context.supabase.from('spy_travel_edges').select('id,from_location_id,to_location_id,mode,base_days,bidirectional,version')
    .eq('approved',true).eq('blocked',false).limit(10000),
  ]);
  if(locationResult.error||edgeResult.error)
   throw new Error('Rotas públicas ainda não disponíveis para consulta.');
  const locations=(locationResult.data??[]).map(l=>({
   id:l.id,kind:l.kind,refId:l.ref_id,name:l.name,
  }));
  const visibleIds=new Set(locations.map(l=>l.id));
  const edges=(edgeResult.data??[]).filter(e=>visibleIds.has(e.from_location_id)&&visibleIds.has(e.to_location_id))
   .map(e=>({
    id:e.id,fromLocationId:e.from_location_id,toLocationId:e.to_location_id,
    mode:e.mode,baseDays:e.base_days,bidirectional:e.bidirectional,version:e.version,
   }));
  return publicSpyGraphSchema.parse({locations,edges});
 });
