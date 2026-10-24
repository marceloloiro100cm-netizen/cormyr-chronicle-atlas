import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
export const Route=createFileRoute('/api/public/catalog')({server:{handlers:{GET:async()=>{
  const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_PUBLISHABLE_KEY'];
  if(!url||!key)return Response.json({error:'Catálogo temporariamente indisponível'},{status:503});
  const db=createClient<Database>(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>{const headers=new Headers(init?.headers);if(key.startsWith('sb_')&&headers.get('Authorization')===`Bearer ${key}`)headers.delete('Authorization');headers.set('apikey',key);return fetch(input,{...init,headers});}}});
  const [catalog,players]=await Promise.all([db.from('house_catalog').select('id,name,region,classification,archive_data,updated_at,gallery,narrative_text'),db.rpc('public_player_houses')]);
  if(catalog.error||players.error)return Response.json({error:'Não foi possível atualizar o catálogo'},{status:503});
  return Response.json({houses:catalog.data,playerHouses:players.data},{headers:{'Cache-Control':'no-store'}});
}}}});