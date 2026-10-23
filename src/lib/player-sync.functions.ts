import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const syncPlayerFolder=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({houseId:z.string(),importFiles:z.boolean()})).handler(async({data,context})=>{
  const role=await context.supabase.rpc('is_campaign_admin');if(role.error)throw role.error;
  const player=await context.supabase.from('campaign_players').select('id').eq('user_id',context.userId).maybeSingle();if(player.error)throw player.error;
  if(!role.data) {
    if(!player.data)throw new Error('Jogador não vinculado.');
    const member=await context.supabase.from('house_memberships').select('player_id').eq('player_id',player.data.id).eq('house_id',data.houseId).maybeSingle();if(member.error)throw member.error;if(!member.data)throw new Error('Casa não autorizada.');
  }
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  let query=supabaseAdmin.from('drive_sync_bindings').select('*').eq('enabled',true).eq('privacy_reviewed',true).eq('runtime_authorized',true);
  if(data.houseId)query=query.eq('house_id',data.houseId);
  if(!role.data)query=query.eq('player_id',player.data?.id??'');
  const bindings=await query;if(bindings.error)throw bindings.error;
  if(!bindings.data?.length)return {message:'Salvo no site; pasta ainda não autorizada.',imported:0};
  let imported=0,conflicts=0,unsupported=0;
  if(data.importFiles){const {importPlayerLibrary}=await import('./drive-library.server');for(const b of bindings.data){const result=await importPlayerLibrary(supabaseAdmin,b);imported+=result.imported;conflicts+=result.conflicts;unsupported+=result.unsupported;}}
  const {runDriveSync}=await import('./drive-executor.server');const result=await runDriveSync(supabaseAdmin,undefined,bindings.data.map(b=>b.id));
  return {...result,imported,message:`${imported} arquivos importados. ${result.message}${conflicts?` ${conflicts} fontes mudaram após edição no site e foram preservadas para revisão.`:''}${unsupported?` ${unsupported} arquivos não compatíveis ou acima de 5 MB.`:''}`};
});