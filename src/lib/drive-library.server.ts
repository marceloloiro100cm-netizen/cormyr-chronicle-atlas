import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { imageToken } from './campaign-content';
import { read, utils } from 'xlsx';
type FileInfo={id:string;name:string;mimeType:string;modifiedTime:string;size?:string};
async function gateway(service:'google_drive'|'google_docs',path:string) {
  const key=process.env[service==='google_drive'?'GOOGLE_DRIVE_API_KEY':'GOOGLE_DOCS_API_KEY'],bearer=process.env['LOVABLE_API_KEY'];
  if(!key||!bearer)throw new Error('Conexão '+service+' indisponível.');
  const response=await fetch(`https://connector-gateway.lovable.dev/${service}${path}`,{headers:{Authorization:`Bearer ${bearer}`,'X-Connection-Api-Key':key},signal:AbortSignal.timeout(15000)});
  if(!response.ok){const body=await response.text();console.error(`Drive library [${response.status}]: ${body}`);throw new Error(`Google respondeu ${response.status}: ${body}`);}return response;
}
export function docsText(value:unknown):string {
  if(Array.isArray(value))return value.map(docsText).join('');
  if(!value||typeof value!=='object')return '';
  const item=value as Record<string,unknown>;
  if(item['textRun'])return docsText(item['textRun']);
  if(typeof item['content']==='string')return item['content'];
  return Object.entries(item).filter(([key])=>['body','content','paragraph','elements','table','tableRows','tableCells','tabs','documentTab','childTabs'].includes(key)).map(([,v])=>docsText(v)).join('');
}
export async function importPlayerLibrary(db:SupabaseClient<Database>,binding:Database['public']['Tables']['drive_sync_bindings']['Row']) {
  if(binding.scope!=='player'||!binding.player_id||!binding.enabled||!binding.privacy_reviewed||!binding.runtime_authorized)return {imported:0,conflicts:0,unsupported:0};
  const q=new URLSearchParams({q:`'${binding.folder_id}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,modifiedTime,size)',pageSize:'1000'});
  const listing=await (await gateway('google_drive','/drive/v3/files?'+q)).json() as {files:FileInfo[];nextPageToken?:string};
  if(listing.nextPageToken)throw new Error('Pasta com mais de 1000 arquivos; revisão necessária.');
  let imported=0,conflicts=0,unsupported=0;
  for(const file of listing.files) {
    // Correspondence and privacy come from the authorized parent, never an inferred house name.
    if(file.name.startsWith('cormyr-')||file.mimeType==='application/vnd.google-apps.folder')continue;
    const existing=await db.from('campaign_records').select('*').eq('source_file_id',file.id).eq('player_id',binding.player_id).maybeSingle();if(existing.error)throw existing.error;
    if(existing.data?.source_modified_at===file.modifiedTime)continue;
    if(existing.data&&existing.data.version>1){conflicts++;continue;}
    if(!file.mimeType.startsWith('application/vnd.google-apps.')&&Number(file.size??0)>5*1024*1024){unsupported++;continue;}
    let content='';
    if(file.mimeType==='application/vnd.google-apps.document') {
      const doc=await (await gateway('google_docs',`/v1/documents/${encodeURIComponent(file.id)}?includeTabsContent=true`)).json();content=docsText(doc);
    } else if(['image/png','image/jpeg','image/webp','image/gif'].includes(file.mimeType)) {
      const blob=await (await gateway('google_drive',`/drive/v3/files/${file.id}?alt=media`)).blob();if(blob.size>5*1024*1024){unsupported++;continue;}
      const path=`${binding.owner_user_id}/drive/${file.id}-${file.modifiedTime.replace(/[^0-9]/g,'')}`;
      const upload=await db.storage.from('campaign-images').upload(path,blob,{contentType:file.mimeType,upsert:true});if(upload.error)throw upload.error;content=imageToken(path,file.name);
    } else if(file.mimeType==='application/vnd.google-apps.spreadsheet'||file.mimeType==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const path=file.mimeType==='application/vnd.google-apps.spreadsheet'?`/drive/v3/files/${file.id}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`:`/drive/v3/files/${file.id}?alt=media`;
      const buffer=await (await gateway('google_drive',path)).arrayBuffer();if(buffer.byteLength>5*1024*1024){unsupported++;continue;}const book=read(buffer,{type:'array'});
      content=book.SheetNames.map(name=>{const sheet=book.Sheets[name];return sheet?name+'\n'+utils.sheet_to_csv(sheet,{FS:' · ',blankrows:false}):'';}).join('\n\n');
    } else if(['text/plain','text/markdown'].includes(file.mimeType))content=await (await gateway('google_drive',`/drive/v3/files/${file.id}?alt=media`)).text();
    else {unsupported++;continue;}
    if(!content.trim())continue;
    if(content.length>2_000_000){unsupported++;continue;}
    const kind=/ficha.*lorde|personage|fam[ií]lia|lady|kael|hektor|rowena/i.test(file.name)?'character':'details';
    if(existing.data) {
      const result=await db.rpc('save_imported_source',{p_id:existing.data.id,p_content:content,p_modified:file.modifiedTime});if(result.error)throw result.error;
    } else {
      const result=await db.from('campaign_records').insert({house_id:binding.house_id,player_id:binding.player_id,visibility:'player',kind,title:file.name,content,source_file_id:file.id,source_modified_at:file.modifiedTime,created_by:binding.confirmed_by,updated_by:binding.confirmed_by});if(result.error)throw result.error;
    }
    imported++;
  }
  return {imported,conflicts,unsupported};
}