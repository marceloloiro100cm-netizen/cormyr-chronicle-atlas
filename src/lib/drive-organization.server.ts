import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createDriveAdapter } from './drive-adapter.server';
import { envelopeSchema } from './drive-sync';
export async function organizeTechnicalFolders(db:SupabaseClient<Database>,actor:string) {
 const key=process.env['GOOGLE_DRIVE_API_KEY'],bearer=process.env['LOVABLE_API_KEY'];if(!key||!bearer)throw new Error('Conexão do Drive indisponível.');
 async function call(path:string,init:RequestInit={}){const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${bearer}`);headers.set('X-Connection-Api-Key',key??'');const response=await fetch('https://connector-gateway.lovable.dev/google_drive/drive/v3'+path,{...init,headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Drive não confirmou a organização: '+response.status);return response;}
 const result=await db.from('drive_sync_bindings').select('*').eq('scope','player').eq('enabled',true).eq('privacy_reviewed',true).eq('runtime_authorized',true);if(result.error)throw result.error;
 const adapter=createDriveAdapter();let moved=0,folders=0;
 for(const binding of result.data){
  const token=crypto.randomUUID();const lease=await db.rpc('claim_drive_binding',{p_id:binding.id,p_token:token});if(lease.error)throw lease.error;if(!lease.data)continue;
  try{
   let folder=binding.technical_folder_id;
   if(!folder){const q=new URLSearchParams({q:`'${binding.folder_id}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='Gestão do Site - Não Mexer'`,fields:'files(id,name)',pageSize:'10'});const listing=await (await call('/files?'+q)).json() as {files:{id:string}[]};if(listing.files.length>1)throw new Error('Subpastas duplicadas exigem revisão.');folder=listing.files[0]?.id??null;
    if(!folder){const created=await (await call('/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Gestão do Site - Não Mexer',mimeType:'application/vnd.google-apps.folder',parents:[binding.folder_id]})})).json() as {id:string};folder=created.id;folders++;}
    const saved=await db.from('drive_sync_bindings').update({technical_folder_id:folder}).eq('id',binding.id).eq('lease_token',token);if(saved.error)throw saved.error;
   }
   const mappings=await db.from('drive_sync_files').select('*').eq('binding_id',binding.id);if(mappings.error)throw mappings.error;
   for(const mapping of mappings.data){
    const renewed=await db.from('drive_sync_bindings').update({lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',binding.id).eq('lease_token',token).select('id');if(renewed.error||!renewed.data?.length)throw new Error('Organização perdeu a autorização temporária.');
    const source=envelopeSchema.parse(mapping.base_snapshot),remote=await adapter.read(mapping.file_id);if(remote.envelope.id!==source.id||remote.envelope.entityType!==source.entityType)throw new Error('Vínculo técnico divergente; arquivo não movido.');
    const meta=await (await call('/files/'+mapping.file_id+'?fields=id,parents,name')).json() as {parents?:string[];name:string};if(meta.parents?.includes(folder))continue;if(!meta.parents?.includes(binding.folder_id)||!/^cormyr-(record|letter|reply)-/.test(meta.name))continue;
    await call('/files/'+mapping.file_id+'?addParents='+encodeURIComponent(folder)+'&removeParents='+encodeURIComponent(binding.folder_id)+'&fields=id,parents',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
    const verified=await (await call('/files/'+mapping.file_id+'?fields=id,parents')).json() as {id:string;parents?:string[]};if(verified.id!==mapping.file_id||!verified.parents?.includes(folder)||verified.parents.includes(binding.folder_id))throw new Error('O Drive não confirmou o destino; execute novamente para reconciliar.');moved++;
   }
   await db.from('campaign_admin_audit').insert({actor,action:'technical_folder_organization',target_player:binding.player_id,details:{bindingId:binding.id}});
  }finally{await db.from('drive_sync_bindings').update({lease_token:null,lease_until:null}).eq('id',binding.id).eq('lease_token',token);}
 }
 return {moved,folders,message:`${folders} subpastas criadas; ${moved} arquivos técnicos confirmados e movidos.`};
}