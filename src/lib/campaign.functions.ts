import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const registerPlayer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().min(1).max(160), userId: z.string().uuid().nullable(), houseId: z.string().min(1), folderId: z.string().max(200).nullable(), canEdit: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('is_campaign_admin');
    if (!admin) throw new Error('Acesso restrito ao administrador.');
    const { data: player, error } = await context.supabase.from('campaign_players').insert({ name: data.name, user_id: data.userId, folder_id: data.folderId, roster_house_id: data.houseId }).select().single();
    if (error || !player) throw new Error(error?.message ?? 'Não foi possível cadastrar.');
    if (!data.userId) return player;
    const { error: linkError } = await context.supabase.from('house_memberships').insert({ player_id: player.id, house_id: data.houseId, can_edit: data.canEdit, authorized_by: context.userId });
    if (linkError) throw new Error(`Jogador cadastrado, mas vínculo pendente: ${linkError.message}`);
    return player;
  });

export const retryFolderSync = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc('is_campaign_admin');
    if (!admin) throw new Error('Acesso restrito ao administrador.');
    const key = process.env['GOOGLE_DRIVE_API_KEY'];
    const bearer = process.env['LOVABLE_API_KEY'];
    if (!key || !bearer) return { connected: false, message: 'Credenciais do Google Drive indisponíveis. A fila permanece preservada.' };
    const response = await fetch('https://connector-gateway.lovable.dev/google_drive/drive/v3/about?fields=storageQuota(limit,usage)', { headers: { Authorization: `Bearer ${bearer}`, 'X-Connection-Api-Key': key } });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Drive verification failed [${response.status}]: ${body}`);
      return { connected: false, message: `Google Drive respondeu com erro ${response.status}: ${body}` };
    }
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { runDriveSync } = await import('@/lib/drive-executor.server');
    const result = await runDriveSync(supabaseAdmin);
    return { connected: true, ...result };
  });

export const configureDriveBinding = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({folderId:z.string().regex(/^[a-zA-Z0-9_-]+$/),scope:z.enum(['house','player','master']),houseId:z.string().nullable(),playerId:z.string().uuid().nullable(),ownerUserId:z.string().uuid(),privacyReviewed:z.boolean(),runtimeAuthorized:z.boolean(),enabled:z.boolean()}))
  .handler(async ({data,context})=>{
    const {data:admin}=await context.supabase.rpc('is_campaign_admin');
    if(!admin)throw new Error('Acesso restrito ao administrador.');
    if(data.enabled&&(!data.privacyReviewed||!data.runtimeAuthorized))throw new Error('Confirme privacidade e autorização runtime antes de ativar.');
    const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
    const {error}=await supabaseAdmin.from('drive_sync_bindings').upsert({folder_id:data.folderId,scope:data.scope,house_id:data.houseId,player_id:data.playerId,owner_user_id:data.ownerUserId,confirmed_by:context.userId,privacy_reviewed:data.privacyReviewed,runtime_authorized:data.runtimeAuthorized,enabled:data.enabled},{onConflict:'folder_id'});
    if(error)throw new Error(error.message);
    return {message:'Mapeamento salvo. A ativação não concede permissão aos jogadores.'};
  });

export const organizeDriveFiles=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const role=await context.supabase.rpc('is_campaign_admin');if(role.error||!role.data)throw new Error('Acesso restrito ao Narrador.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {organizeTechnicalFolders}=await import('./drive-organization.server');
  return organizeTechnicalFolders(supabaseAdmin,context.userId);
});