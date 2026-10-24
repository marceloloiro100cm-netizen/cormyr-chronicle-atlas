import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { docsText } from './drive-library.server';
import { isPublicArchiveFile, isPrincipalArchiveDocument } from './archive-policy';
type File={id:string;name:string;mimeType:string;modifiedTime:string;size?:string};
export async function updatePublicArchive(db:SupabaseClient<Database>) {
 const bearer=process.env['LOVABLE_API_KEY'],drive=process.env['GOOGLE_DRIVE_API_KEY'],docs=process.env['GOOGLE_DOCS_API_KEY'];if(!bearer||!drive||!docs)throw new Error('Conexão do acervo indisponível.');
 async function call(service:string,path:string){const response=await fetch(`https://connector-gateway.lovable.dev/${service}${path}`,{headers:{Authorization:`Bearer ${bearer}`,'X-Connection-Api-Key':service==='google_docs'?docs??'':drive??''},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Consulta do acervo falhou: ${response.status}`);return response;}
 const selected=await db.from('house_catalog').select('*').eq('public_reviewed',true).not('source_folder_id','is',null).order('updated_at',{ascending:true}).limit(8);if(selected.error)throw selected.error;
 let texts=0,images=0,failed=0;const errors:string[]=[];
 for(const house of selected.data){try{
  const q=new URLSearchParams({q:`'${house.source_folder_id}' in parents and trashed=false`,fields:'files(id,name,mimeType,modifiedTime,size),nextPageToken',pageSize:'1000'});const listing=await (await call('google_drive','/drive/v3/files?'+q)).json() as {files:File[];nextPageToken?:string};if(listing.nextPageToken)throw new Error('Pasta exige paginação adicional.');
  const gallery=Array.isArray(house.gallery)?house.gallery as {id:string;name:string;modified:string}[]:[];const nextGallery=[...gallery];
  for(const file of listing.files){if(!isPublicArchiveFile(file.name))continue;
   if(['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimeType)&&Number(file.size??0)<=5*1024*1024){const old=gallery.find(x=>x.id===file.id);if(old?.modified===file.modifiedTime)continue;const bytes=await (await call('google_drive',`/drive/v3/files/${file.id}?alt=media`)).blob();const path=`public-house/${house.id}/${file.id}-${file.modifiedTime.replace(/\D/g,'')}`;const upload=await db.storage.from('campaign-images').upload(path,bytes,{contentType:file.mimeType,upsert:true});if(upload.error)throw upload.error;const entry={id:file.id,name:file.name,modified:file.modifiedTime,path};const i=nextGallery.findIndex(x=>x.id===file.id);if(i>=0)nextGallery[i]=entry;else nextGallery.push(entry);images++;}
  }
  const candidates=listing.files.filter(f=>f.mimeType==='application/vnd.google-apps.document'&&isPrincipalArchiveDocument(f.name,house.name));
  if(candidates.length>1)throw new Error('Mais de um documento principal; revisão necessária.');
  const principal=candidates[0];let narrative=house.narrative_text,modified=house.source_modified_at;
  if(principal&&modified!==principal.modifiedTime){const content=docsText(await (await call('google_docs',`/v1/documents/${principal.id}?includeTabsContent=true`)).json());if(content.trim()){
   if(narrative&&narrative!==content){const review=await db.from('archive_source_review').upsert({house_id:house.id,source_file_id:principal.id,modified_at:principal.modifiedTime,remote_text:content,local_text:narrative,reason:'Fonte mudou; preservar versão local até revisão.'},{onConflict:'house_id,source_file_id,modified_at',ignoreDuplicates:true});if(review.error)throw review.error;errors.push(house.name+': nova versão preservada para revisão.');}
   else{narrative=content;modified=principal.modifiedTime;texts++;}
  }}
  const saved=await db.from('house_catalog').update({gallery:nextGallery as unknown as Json,narrative_text:narrative,source_modified_at:modified,updated_at:new Date().toISOString()}).eq('id',house.id);if(saved.error)throw saved.error;
 }catch(error){failed++;errors.push(house.name+': '+(error instanceof Error?error.message:'Falha na fonte'));}}
 return {texts,images,failed,errors,checked:selected.data.length,message:`${selected.data.length} casas consultadas; ${texts} textos atualizados; ${images} imagens incorporadas; ${failed} falhas. Execute novamente para continuar o acervo.`};
}