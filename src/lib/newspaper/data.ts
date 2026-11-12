import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '@/integrations/supabase/client';
import {
 PAPER_BUCKET,COMMISSION_BUCKET,type NewspaperCommission,type NewspaperRevision,type NewspaperEdition,type NewspaperRead,type NewspaperState,
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

// ---- Notícias contratadas pelas Casas (1 Riqueza) ----
export async function getNewspaperCommissions():Promise<NewspaperCommission[]>{
 const {data,error}=await db.from('campaign_newspaper_commissions').select('*')
  .order('created_at',{ascending:false}).limit(300);
 if(error)throw error;
 return (data??[]) as NewspaperCommission[];
}
export async function uploadCommissionImage(houseId:string,file:File):Promise<string>{
 if(file.size>5*1024*1024)throw new Error('A imagem deve ter no máximo 5 MB.');
 const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[file.type];
 if(!ext)throw new Error('Envie PNG, JPG ou WebP.');
 const path=`${houseId}/${crypto.randomUUID()}${ext}`;
 const {error}=await db.storage.from(COMMISSION_BUCKET).upload(path,file,{
  upsert:false,contentType:file.type,cacheControl:'3600',
 });
 if(error)throw error;
 return path;
}
export async function signedCommissionImage(path:string):Promise<string>{
 const {data,error}=await db.storage.from(COMMISSION_BUCKET).createSignedUrl(path,3600);
 if(error||!data?.signedUrl)throw error??new Error('Imagem temporariamente indisponível.');
 return data.signedUrl;
}
/** Débito de 1 Riqueza + registro do pedido em uma única transação no banco. */
export async function commissionNewspaperStory(input:{
 houseId:string;title:string;body:string;imagePath:string|null;requestKey:string;
}):Promise<{commissionId:string;alreadyApplied:boolean}>{
 const {data,error}=await db.rpc('newspaper_commission_story',{
  p_house:input.houseId,p_title:input.title.trim(),p_body:input.body.trim(),
  p_image_path:input.imagePath,p_key:input.requestKey,
 });
 if(error)throw error;
 return data as {commissionId:string;alreadyApplied:boolean};
}
/** O Editor-Chefe copia a imagem do pedido para a pasta da edição, onde os leitores têm acesso. */
export async function copyCommissionImageToEdition(editionId:string,commissionPath:string):Promise<string>{
 const {data,error}=await db.storage.from(COMMISSION_BUCKET).download(commissionPath);
 if(error||!data)throw error??new Error('Não foi possível ler a imagem do pedido.');
 const extension=commissionPath.slice(commissionPath.lastIndexOf('.'));
 const path=`${editionId}/${crypto.randomUUID()}${extension}`;
 const {error:uploadError}=await db.storage.from(PAPER_BUCKET).upload(path,data,{
  upsert:false,...(data.type?{contentType:data.type}:{}),cacheControl:'3600',
 });
 if(uploadError)throw uploadError;
 return path;
}
export async function getHouseNames():Promise<Map<string,string>>{
 const {data,error}=await db.from('campaign_houses').select('id,name').limit(200);
 if(error)throw error;
 return new Map(((data??[]) as {id:string;name:string}[]).map(h=>[h.id,h.name]));
}
/** Recusa com nota: o banco devolve a Riqueza e lança no livro-caixa em uma transação. */
export async function rejectNewspaperCommission(id:string,note:string):Promise<void>{
 const {error}=await db.rpc('newspaper_reject_commission',{p_commission:id,p_note:note.trim()});
 if(error)throw error;
}
/** Exclui um rascunho (somente rascunhos). Pedidos contratados nele voltam às pendências. */
export async function deleteNewspaperDraft(id:string):Promise<void>{
 const {error}=await db.rpc('delete_campaign_newspaper_draft',{p_newspaper:id});
 if(error)throw error;
}
/** Histórico de versões salvas desta edição (mais recentes primeiro). */
export async function getNewspaperRevisions(id:string):Promise<NewspaperRevision[]>{
 const {data,error}=await db.from('campaign_newspaper_revisions')
  .select('id,newspaper_id,previous_version,changed_at,snapshot')
  .eq('newspaper_id',id).order('previous_version',{ascending:false}).limit(40);
 if(error)throw error;
 return (data??[]) as NewspaperRevision[];
}
/** A Casa confirma que viu a resposta (publicação ou recusa) dos seus pedidos. */
export async function markCommissionsSeen(houseId:string):Promise<void>{
 const {error}=await db.rpc('mark_newspaper_commissions_seen',{p_house:houseId});
 if(error)throw error;
}
