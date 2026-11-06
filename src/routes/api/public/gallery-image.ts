import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import {resolvePublicSupabase} from '@/integrations/supabase/public-config';
import type { Database } from '@/integrations/supabase/types';
export const Route=createFileRoute('/api/public/gallery-image')({server:{handlers:{GET:async({request})=>{
 const query=new URL(request.url).searchParams,path=query.get('path')??'';
 if(!/^public-house\/[a-z0-9-]+\/[a-zA-Z0-9_-]+$/.test(path))return new Response('Imagem indisponível',{status:404});
 const {url,key}=resolvePublicSupabase(process.env['SUPABASE_URL'],
  process.env['SUPABASE_PUBLISHABLE_KEY']);if(!url||!key)return new Response('Indisponível',{status:503});
 const db=createClient<Database>(url,key,{auth:{persistSession:false},global:{fetch:(i,n)=>{const h=new Headers(n?.headers);if(key.startsWith('sb_')&&h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');h.set('apikey',key);return fetch(i,{...n,headers:h});}}});
 const allowed=await db.rpc('can_read_public_gallery_image',{p_path:path});if(allowed.error||!allowed.data)return new Response('Imagem indisponível',{status:404});
 const image=await db.storage.from('campaign-images').download(path);if(image.error)return new Response('Imagem indisponível',{status:404});
 const headers=new Headers({'Content-Type':image.data.type,'Cache-Control':'public, max-age=86400'});if(query.has('download'))headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent((query.get('name')??'imagem').replace(/[\r\n]/g,''))}`);
 return new Response(image.data,{headers});
}}}});