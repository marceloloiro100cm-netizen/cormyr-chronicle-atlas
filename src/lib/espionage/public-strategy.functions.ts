import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {publicSpyGraphSchema} from './public-strategy';

const rawLocation=z.object({id:z.string().uuid(),kind:z.string(),
 ref_id:z.string(),name:z.string()});
const rawEdge=z.object({
 id:z.string().uuid(),from_location_id:z.string().uuid(),to_location_id:z.string().uuid(),
 mode:z.string(),base_days:z.number().int(),bidirectional:z.boolean(),version:z.number().int(),
});
type PublicSelect={data:unknown;error:{message:string}|null};
type SpyPublicTable={select:(fields:string)=>{eq:(column:string,value:string|boolean)=>{
 eq:(column:string,value:string|boolean)=>{limit:(count:number)=>Promise<PublicSelect>}
}}};
const publicKinds=new Set(['region','house_seat','domain','settlement','waypoint']);
const publicModes=new Set(['foot','horse','caravan','ship']);

/** Authenticated read of *only* RLS-approved geography. Raw source/notes,
 * narrator-only endpoints, blocked or unpublished edges are never returned.
 */
export const loadPublicSpyRoutes=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(z.object({}).strict())
 .handler(async({context})=>{
  // Spy tables are intentionally not yet present in generated Supabase types:
  // do not widen the entire client, just the two bounded read-only queries.
  const db=context.supabase as unknown as {from:(table:string)=>SpyPublicTable};
  const [locationResult,edgeResult]=await Promise.all([
   db.from('spy_locations').select('id,kind,ref_id,name')
    .eq('approved',true).eq('visibility','public').limit(3000),
   db.from('spy_travel_edges').select('id,from_location_id,to_location_id,mode,base_days,bidirectional,version')
    .eq('approved',true).eq('blocked',false).limit(10000),
  ]);
  if(locationResult.error||edgeResult.error)
   throw new Error('Rotas públicas ainda não disponíveis para consulta.');
  const rawLocations=z.array(rawLocation).max(3000).parse(locationResult.data??[]);
  const rawEdges=z.array(rawEdge).max(10000).parse(edgeResult.data??[]);
  const locations=rawLocations.filter(l=>publicKinds.has(l.kind)).map(l=>({
   id:l.id,kind:l.kind as 'region'|'house_seat'|'domain'|'settlement'|'waypoint',
   refId:l.ref_id,name:l.name,
  }));
  const visibleIds=new Set(locations.map(l=>l.id));
  const edges=rawEdges.filter(e=>publicModes.has(e.mode)&&
   visibleIds.has(e.from_location_id)&&visibleIds.has(e.to_location_id)).map(e=>({
    id:e.id,fromLocationId:e.from_location_id,toLocationId:e.to_location_id,
    mode:e.mode as 'foot'|'horse'|'caravan'|'ship',
    baseDays:e.base_days,bidirectional:e.bidirectional,version:e.version,
   }));
  return publicSpyGraphSchema.parse({locations,edges});
 });
