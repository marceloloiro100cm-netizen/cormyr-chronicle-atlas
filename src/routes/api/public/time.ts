import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { publicCampaignTimeProjection } from '@/lib/calendar/public-time';

const NO_STORE={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'};

/** Público por decisão explícita: apenas dia/mês/ano/festival/versão já publicados.
 * Não ler a tabela diretamente, não usar service-role e não encaminhar JWT/cookies.
 */
export const Route=createFileRoute('/api/public/time')({
 server:{handlers:{GET:async()=>{
  const url=process.env['SUPABASE_URL'];
  const key=process.env['SUPABASE_PUBLISHABLE_KEY'];
  if(!url||!key)return Response.json({error:'Calendário público indisponível'},{status:503,headers:NO_STORE});
  const db=createClient<Database>(url,key,{
   auth:{persistSession:false,autoRefreshToken:false},
   global:{fetch:(input,init)=>{
    const headers=new Headers(init?.headers);
    if(key.startsWith('sb_')&&headers.get('Authorization')===`Bearer ${key}`)headers.delete('Authorization');
    headers.set('apikey',key);
    return fetch(input,{...init,headers,cache:'no-store'});
   }}
  });
  try{
   const {data,error}=await db.rpc('get_public_campaign_time');
   if(error||!data)return Response.json({error:'Calendário público indisponível'},{status:503,headers:NO_STORE});
   return Response.json(publicCampaignTimeProjection(data),{headers:NO_STORE});
  }catch{
   return Response.json({error:'Calendário público indisponível'},{status:503,headers:NO_STORE});
  }
 }}}});
