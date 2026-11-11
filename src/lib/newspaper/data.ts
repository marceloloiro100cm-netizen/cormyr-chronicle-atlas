import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '@/integrations/supabase/client';
import {
 PAPER_BUCKET,type NewspaperEdition,type NewspaperRead,type NewspaperState,
 type NewspaperTemplate,type NewspaperFont,type NewspaperBlock,
} from './model';

// Os direitos de acesso são sempre conferidos pelo PostgreSQL (RLS), jamais pela UI.
const db=supabase as unknown as SupabaseClient;
export async function getNewspaperEditions():Promise<NewspaperEdition[]>{
 const {data,error}=await db.from('campaign_newspapers').select('*')
  .order('edition_no',{ascending:false}).limit(300);
 if(error)throw error;
 return (data??[]) as NewspaperEdition[];
}
export async function getNewspaperReceipts():Promise<NewspaperRead[]>{
 const {data,error}=await db.from('campaign_newspaper_reads')
  .select('newspaper_id,user_id,read_version,read_at').limit(5000);
 if(error)throw error;
 return (data??[]) as NewspaperRead[];
}
export async function createNewspaperEdition(input:{
 campaign_date:string;title:string;subtitle?:string;template:NewspaperTemplate;blocks:NewspaperBlock[];
}):Promise<NewspaperEdition>{
 const {data,error}=await db.from('campaign_newspapers').insert({
  campaign_date:input.campaign_date,title:input.title,
  subtitle:input.subtitle??'',template:input.template,
  blocks:input.blocks,state:'draft',
 }).select('*').single();
 if(error)throw error;
 return data as NewspaperEdition;
}
export async function updateNewspaperEdition(current:NewspaperEdition,input:{
 campaign_date:string;title:string;subtitle:string;template:NewspaperTemplate;
 font_style:NewspaperFont;blocks:NewspaperBlock[];pdf_path:string|null;state:NewspaperState;
}):Promise<NewspaperEdition>{
 const {data,error}=await db.from('campaign_newspapers').update(input)
  .eq('id',current.id).eq('version',current.version).select('*').maybeSingle();
 if(error)throw error;
 if(!data)throw new Error('Esta edição foi alterada por outro redator. Recarregue antes de salvar.');
 return data as NewspaperEdition;
}
export async function markNewspaperRead(id:string):Promise<void>{
 const {error}=await db.rpc('mark_campaign_newspaper_read',{p_newspaper:id});
 if(error)throw error;
}
export async function uploadNewspaperAsset(editionId:string,file:File,kind:'pdf'|'image'):Promise<string>{
 if(file.size>15*1024*1024)throw new Error('O arquivo deve ter no máximo 15 MB.');
 const types=kind==='pdf'?['application/pdf']:['image/png','image/jpeg','image/webp'];
 if(!types.includes(file.type))throw new Error(kind==='pdf'?'Envie um arquivo PDF.':'Envie PNG, JPG ou WebP.');
 const extension=kind==='pdf'?'.pdf':file.type==='image/png'?'.png':file.type==='image/webp'?'.webp':'.jpg';
 const path=`${editionId}/${crypto.randomUUID()}${extension}`;
 const {error}=await db.storage.from(PAPER_BUCKET).upload(path,file,{
  upsert:false,contentType:file.type,cacheControl:'3600',
 });
 if(error)throw error;
 return path;
}
export async function signedNewspaperAsset(path:string):Promise<string>{
 const {data,error}=await db.storage.from(PAPER_BUCKET).createSignedUrl(path,3600);
 if(error||!data?.signedUrl)throw error??new Error('Arquivo temporariamente indisponível.');
 return data.signedUrl;
}
