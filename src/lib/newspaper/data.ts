import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '@/integrations/supabase/client';
import {publicCampaignTimeProjection} from '@/lib/calendar/public-time';
import {
 isFirebaseNewspaperWorkspace,loadFirebaseNewspaperEditions,
 createFirebaseNewspaperEdition,updateFirebaseNewspaperEdition,
 loadFirebaseNewspaperReceipts,markFirebaseNewspaperRead,
} from './firebase-editorial-bridge';
import {workspaceRequest} from '@/lib/firebase-workspace/client';
import {firebasePilotAuth} from '@/lib/auth/firebase-pilot-session';
import {mediaFileBase64} from '@/lib/firebase-workspace/private-media-client';
import {
 PAPER_BUCKET,COMMISSION_BUCKET,STAFF_BUCKET,ENGRAVINGS_BUCKET,NEWSPAPER_ENGRAVINGS,type NewspaperEngraving,safeNewspaperSettings,type NewspaperSettings,safeNewspaperBlocks,type StoryModel,type NewspaperStaffMember,type NewspaperCommission,type NewspaperRevision,type NewspaperEdition,type NewspaperRead,type NewspaperState,
 type NewspaperTemplate,type NewspaperFont,type NewspaperBlock,
} from './model';

// Os direitos de acesso são sempre conferidos pelo PostgreSQL (RLS), jamais pela UI.
const db=supabase as unknown as SupabaseClient;
export async function getNewspaperEditions():Promise<NewspaperEdition[]>{
 if(!isFirebaseNewspaperWorkspace()){
  // Legacy route is unavailable in Firebase but remains unchanged for preview.
  try{await db.rpc('publish_due_campaign_newspapers');}catch{/* read continues */}
 }
 const {data,error}=await db.from('campaign_newspapers').select('*')
  .order('edition_no',{ascending:false}).limit(300);
 if(error)throw error;
 const archived=(data??[]) as NewspaperEdition[];
 return isFirebaseNewspaperWorkspace()?loadFirebaseNewspaperEditions(archived):archived;
}
export async function getNewspaperReceipts():Promise<NewspaperRead[]>{
 const {data,error}=await db.from('campaign_newspaper_reads')
  .select('newspaper_id,user_id,read_version,read_at').limit(5000);
 if(error)throw error;
 const imported=(data??[]) as NewspaperRead[];
 if(!isFirebaseNewspaperWorkspace())return imported;
 const live=await loadFirebaseNewspaperReceipts();
 const byKey=new Map(imported.map(row=>[row.newspaper_id+'|'+row.user_id,row]));
 for(const row of live){
  const key=row.newspaper_id+'|'+row.user_id;
  const current=byKey.get(key);
  if(!current||row.read_version>=current.read_version)byKey.set(key,row);
 }
 return [...byKey.values()];
}
export async function createNewspaperEdition(input:{
 campaign_date:string;title:string;subtitle?:string;template:NewspaperTemplate;blocks:NewspaperBlock[];
 font_style?:NewspaperFont;
}):Promise<NewspaperEdition>{
 if(isFirebaseNewspaperWorkspace())return createFirebaseNewspaperEdition(input);
 const {data,error}=await db.from('campaign_newspapers').insert({
  campaign_date:input.campaign_date,title:input.title,
  subtitle:input.subtitle??'',template:input.template,
  ...(input.font_style?{font_style:input.font_style}:{}),
  blocks:input.blocks,state:'draft',
 }).select('*').single();
 if(error)throw error;
 return data as NewspaperEdition;
}
export async function updateNewspaperEdition(current:NewspaperEdition,input:{
 campaign_date:string;title:string;subtitle:string;template:NewspaperTemplate;
 font_style:NewspaperFont;blocks:NewspaperBlock[];pdf_path:string|null;state:NewspaperState;
 publish_on?:string|null;
}):Promise<NewspaperEdition>{
 if(isFirebaseNewspaperWorkspace())return updateFirebaseNewspaperEdition(current,input);
 const {data,error}=await db.from('campaign_newspapers').update(input)
  .eq('id',current.id).eq('version',current.version).select('*').maybeSingle();
 if(error)throw error;
 if(!data)throw new Error('Esta edição foi alterada por outro redator. Recarregue antes de salvar.');
 return data as NewspaperEdition;
}
export async function markNewspaperRead(id:string):Promise<void>{
 if(isFirebaseNewspaperWorkspace())return markFirebaseNewspaperRead(id,true);
 const {error}=await db.rpc('mark_campaign_newspaper_read',{p_newspaper:id});
 if(error)throw error;
}
/** O leitor devolve a edição a "não lida": apaga só o próprio recibo, e o aviso volta. */
export async function markNewspaperUnread(id:string):Promise<void>{
 if(isFirebaseNewspaperWorkspace())return markFirebaseNewspaperRead(id,false);
 const {error}=await db.rpc('mark_campaign_newspaper_unread',{p_newspaper:id});
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
 // O fluxo de comissões Firebase ainda não aceita imagem vinculada à
 // despesa. Nunca usar o bucket legado nem cobrar Riqueza por um anexo órfão.
 if(isFirebaseNewspaperWorkspace())
  throw new Error('Imagens de encomendas ainda aguardam homologação no Firebase. Envie somente o texto.');
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
 if(isFirebaseNewspaperWorkspace())
  throw new Error('Imagem histórica de encomenda não reconciliada com o Firebase Storage.');
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
 return copyBucketImageToEdition(COMMISSION_BUCKET,editionId,commissionPath);
}
export async function copyBucketImageToEdition(bucket:string,editionId:string,commissionPath:string):Promise<string>{
 // Não copiar entre buckets antigos quando a Redação usa Firebase.
 if(isFirebaseNewspaperWorkspace())
  throw new Error('Cópia de imagens editoriais ainda não aprovada no Firebase Storage.');
 const {data,error}=await db.storage.from(bucket).download(commissionPath);
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

// ---- Redação (corpo de funcionários) ----
export async function getNewspaperStaff():Promise<NewspaperStaffMember[]>{
 const {data,error}=await db.from('campaign_newspaper_staff').select('*')
  .order('sort_order',{ascending:true}).order('name',{ascending:true}).limit(200);
 if(error)throw error;
 return (data??[]) as NewspaperStaffMember[];
}
export async function uploadStaffPhoto(file:File):Promise<string>{
 // No Firebase, fotos novas da Redação aguardam o Storage homologado.
 if(isFirebaseNewspaperWorkspace())
  throw new Error('Fotos novas da Redação ainda aguardam o armazenamento homologado no Firebase. Salve sem foto por enquanto.');
 if(file.size>5*1024*1024)throw new Error('A foto deve ter no máximo 5 MB.');
 const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[file.type];
 if(!ext)throw new Error('Envie PNG, JPG ou WebP.');
 const path=`${crypto.randomUUID()}${ext}`;
 const {error}=await db.storage.from(STAFF_BUCKET).upload(path,file,{
  upsert:false,contentType:file.type,cacheControl:'3600',
 });
 if(error)throw error;
 return path;
}
/** Fotografia da Redação: a API valida Editor-Chefe/Narrador e liga o
 * arquivo à ficha na mesma operação, sem bucket legado ou URL fornecida pelo browser. */
export async function saveNewspaperStaffWithPhoto(input:{
 id?:string;requestId:string;name:string;specialty:string;bio:string;sortOrder?:number;
},file:File):Promise<void>{
 if(!isFirebaseNewspaperWorkspace())throw Error('Área editorial Firebase indisponível.');
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||
    file.size<1||file.size>5*1024*1024)
  throw Error('Escolha uma foto PNG, JPG ou WebP de até 5 MB.');
 const dataBase64=await mediaFileBase64(file);
 const auth=firebasePilotAuth(),before=auth?.current()?.uid,token=await auth?.getToken();
 const uid=auth?.current()?.uid;
 if(!uid||!token||(before&&before!==uid))throw Error('Sessão do Editor-Chefe expirada.');
 const response=await fetch('/api/firebase-newspaper-staff-photo',{
  method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action:'saveStaffPhoto',...input,contentType:file.type,dataBase64}),
 });
 if(auth?.current()?.uid!==uid)throw Error('Sessão alterada durante o envio da foto.');
 if(!response.ok)throw Error(response.status===413||response.status===415?
  'A foto é inválida ou ultrapassa 5 MB. Envie PNG, JPG ou WebP.':
  response.status===403?'Sua conta não tem permissão para fotos da Redação.':
  response.status===409?'O cadastro mudou durante o envio. Reabra a ficha e tente novamente.':
  response.status===503?'O armazenamento de fotos da Redação não está disponível no Firebase.':
  'Não foi possível salvar a fotografia no Firebase.');
 const body:unknown=await response.json();
 if(!body||typeof body!=='object'||!('result' in body)||
    typeof body.result!=='object'||!body.result||
    typeof (body.result as {id?:unknown}).id!=='string')
  throw Error('O Firebase não confirmou a fotografia do funcionário.');
}
export async function signedStaffPhoto(path:string):Promise<string>{
 const {data,error}=await db.storage.from(STAFF_BUCKET).createSignedUrl(path,3600);
 if(error||!data?.signedUrl)throw error??new Error('Foto temporariamente indisponível.');
 return data.signedUrl;
}
export async function saveNewspaperStaff(input:{
 id?:string;name:string;specialty:string;bio:string;photoPath:string|null;sortOrder?:number;
}):Promise<void>{
 if(isFirebaseNewspaperWorkspace()){
  await workspaceRequest({kind:'rpc',name:'newspaper_staff_save',args:{
   p_id:input.id??null,p_name:input.name,p_specialty:input.specialty,p_bio:input.bio,
   p_photo_path:input.photoPath,p_sort_order:input.sortOrder??null}});
  return;
 }
 const row={name:input.name.trim(),specialty:input.specialty.trim(),bio:input.bio.trim(),
  photo_path:input.photoPath,updated_at:new Date().toISOString()};
 const result=input.id?await db.from('campaign_newspaper_staff').update(row).eq('id',input.id)
  :await db.from('campaign_newspaper_staff').insert({...row,sort_order:input.sortOrder??0});
 if(result.error)throw result.error;
}
/** Grava a nova ordem da equipe: a posição na lista vira o sort_order de cada funcionário. */
export async function reorderNewspaperStaff(ids:readonly string[]):Promise<void>{
 // Firebase: uma única gravação transacional com a ordem inteira.
 if(isFirebaseNewspaperWorkspace()){
  await workspaceRequest({kind:'rpc',name:'newspaper_staff_reorder',args:{p_ids:[...ids]}});
  return;
 }
 const results=await Promise.all(ids.map((id,index)=>
  db.from('campaign_newspaper_staff').update({sort_order:index}).eq('id',id)));
 const failed=results.find(r=>r.error);
 if(failed?.error)throw failed.error;
}
export async function deleteNewspaperStaff(id:string,photoPath:string|null):Promise<void>{
 if(isFirebaseNewspaperWorkspace()){
  await workspaceRequest({kind:'rpc',name:'newspaper_staff_delete',args:{p_id:id}});
  return;
 }
 const {error}=await db.from('campaign_newspaper_staff').delete().eq('id',id);
 if(error)throw error;
 if(photoPath)await db.storage.from(STAFF_BUCKET).remove([photoPath]);
}
// ---- Calendário público para pautas ----
/** Eventos que o Narrador já publicou para o mês; nunca missivas nem dados de Casas. */
export async function getPublishedScheduleEvents(year:number,month:number):Promise<{id:string;date:string;title:string;description?:string;kind:'kingdom'}[]>{
 const {data,error}=await db.rpc('get_newspaper_calendar_events',{p_year:year,p_month:month});
 if(error)throw error;
 return (data??[]) as {id:string;date:string;title:string;description?:string;kind:'kingdom'}[];
}

// ---- Modelos de matéria e exclusão do Arquivo ----
export async function getStoryModels():Promise<StoryModel[]>{
 const {data,error}=await db.from('campaign_newspaper_story_models').select('*')
  .order('created_at',{ascending:true}).limit(100);
 if(error)throw error;
 return ((data??[]) as {id:string;name:string;description:string;blocks:unknown}[]).map(r=>({
  id:r.id,name:r.name,description:r.description,builtin:false,blocks:safeNewspaperBlocks(r.blocks),
 }));
}
export async function saveStoryModel(input:{id?:string;name:string;description:string;blocks:NewspaperBlock[]}):Promise<void>{
 const row={name:input.name.trim(),description:input.description.trim(),blocks:input.blocks,
  updated_at:new Date().toISOString()};
 const result=input.id?await db.from('campaign_newspaper_story_models').update(row).eq('id',input.id)
  :await db.from('campaign_newspaper_story_models').insert(row);
 if(result.error)throw result.error;
}
export async function deleteStoryModel(id:string):Promise<void>{
 const {error}=await db.from('campaign_newspaper_story_models').delete().eq('id',id);
 if(error)throw error;
}
/** Exclui qualquer edição do Arquivo; o número volta a ficar livre para a próxima. */
export async function deleteNewspaperEdition(id:string):Promise<void>{
 const {error}=await db.rpc('delete_campaign_newspaper',{p_newspaper:id});
 if(error)throw error;
}

// ---- Gravuras do Reino ----
export async function getEngravings():Promise<NewspaperEngraving[]>{
 const {data,error}=await db.from('campaign_newspaper_engravings').select('*')
  .order('created_at',{ascending:true}).limit(300);
 if(error)throw error;
 return (data??[]) as NewspaperEngraving[];
}
export async function uploadEngraving(file:File,name:string):Promise<void>{
 if(file.size>5*1024*1024)throw new Error('A gravura deve ter no máximo 5 MB.');
 const ext={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[file.type];
 if(!ext)throw new Error('Envie PNG, JPG ou WebP.');
 const path=`${crypto.randomUUID()}${ext}`;
 const {error}=await db.storage.from(ENGRAVINGS_BUCKET).upload(path,file,{
  upsert:false,contentType:file.type,cacheControl:'3600',
 });
 if(error)throw error;
 const label=name.trim()||file.name.replace(/\.[^.]+$/,'').slice(0,80)||'Gravura';
 const result=await db.from('campaign_newspaper_engravings').insert({name:label.slice(0,80),image_path:path});
 if(result.error){await db.storage.from(ENGRAVINGS_BUCKET).remove([path]);throw result.error;}
}
export async function signedEngravingImage(path:string):Promise<string>{
 const {data,error}=await db.storage.from(ENGRAVINGS_BUCKET).createSignedUrl(path,3600);
 if(error||!data?.signedUrl)throw error??new Error('Gravura temporariamente indisponível.');
 return data.signedUrl;
}
export async function setEngravingInCollection(id:string,inCollection:boolean):Promise<void>{
 const {error}=await db.from('campaign_newspaper_engravings').update({in_collection:inCollection}).eq('id',id);
 if(error)throw error;
}
export async function deleteEngraving(id:string,path:string|null):Promise<void>{
 const {error}=await db.from('campaign_newspaper_engravings').delete().eq('id',id);
 if(error)throw error;
 // Gravuras originais do site não têm arquivo no armazenamento; só as enviadas têm.
 if(path)await db.storage.from(ENGRAVINGS_BUCKET).remove([path]);
}
/** Devolve ao acervo as gravuras originais do site que o Editor-Chefe havia excluído. */
export async function restoreOriginalEngravings(existing:readonly NewspaperEngraving[]):Promise<number>{
 const have=new Set(existing.map(e=>e.public_src).filter((v):v is string=>Boolean(v)));
 const missing=NEWSPAPER_ENGRAVINGS.filter(e=>!have.has(e.src));
 if(missing.length===0)return 0;
 const {error}=await db.from('campaign_newspaper_engravings')
  .insert(missing.map(e=>({name:e.label,public_src:e.src,in_collection:true})));
 if(error)throw error;
 return missing.length;
}

// ---- Configurações do jornal e data pública do HUB ----
/** Configurações salvas; sem linha no banco devolve null (a tela usa o padrão). */
export async function getNewspaperSettings():Promise<NewspaperSettings|null>{
 const {data,error}=await db.from('campaign_newspaper_settings').select('title,subtitle,template,font_style').maybeSingle();
 if(error)throw error;
 return data?safeNewspaperSettings(data):null;
}
export async function saveNewspaperSettings(input:NewspaperSettings):Promise<NewspaperSettings>{
 const {data,error}=await db.from('campaign_newspaper_settings').upsert({
  id:true,title:input.title.trim(),subtitle:input.subtitle,template:input.template,font_style:input.font_style,
  updated_at:new Date().toISOString(),
 },{onConflict:'id'}).select('title,subtitle,template,font_style').single();
 if(error)throw error;
 return safeNewspaperSettings(data);
}
/**
 * Data oficial já publicada do HUB Temporal, pela leitura pública.
 * O perfil do Editor-Chefe não é jogador nem Narrador, então a leitura privada do
 * calendário (campaign_access_active) devolve vazio para ele; esta leitura é a que vale na Redação.
 */
export async function getPublicHubDate():Promise<string>{
 const {data,error}=await db.rpc('get_public_campaign_time');
 if(error)throw error;
 return publicCampaignTimeProjection(data).date;
}

/** Leituras do site aberto (visitantes sem conta) por edição, para o Editor-Chefe. */
export async function getPublicNewspaperReadCounts():Promise<Map<string,number>>{
 if(!isFirebaseNewspaperWorkspace())return new Map();
 const rows:unknown=await workspaceRequest({kind:'rpc',name:'newspaper_public_read_counts',args:{}});
 const map=new Map<string,number>();
 if(Array.isArray(rows))for(const row of rows as {editionId?:unknown;count?:unknown}[]){
  if(typeof row?.editionId==='string'&&typeof row.count==='number'&&Number.isSafeInteger(row.count))
   map.set(row.editionId,row.count);
 }
 return map;
}
