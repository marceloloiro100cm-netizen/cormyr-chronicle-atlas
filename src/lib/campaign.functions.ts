import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const registerPlayer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().min(1).max(160), userId: z.string().uuid().nullable(), houseId: z.string().min(1), folderId: z.string().max(200).nullable(), canEdit: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('is_campaign_admin');
    if (!admin) throw new Error('Acesso restrito ao administrador.');
    const { data: player, error } = await context.supabase.from('campaign_players').insert({ name: data.name, user_id: data.userId, folder_id: data.folderId }).select().single();
    if (error || !player) throw new Error(error?.message ?? 'Não foi possível cadastrar.');
    const { error: linkError } = await context.supabase.from('house_memberships').insert({ player_id: player.id, house_id: data.houseId, can_edit: data.canEdit, authorized_by: context.userId });
    if (linkError) throw new Error(`Jogador cadastrado, mas vínculo pendente: ${linkError.message}`);
    return player;
  });

export const retryFolderSync = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc('is_campaign_admin');
    if (!admin) throw new Error('Acesso restrito ao administrador.');
    // No provider connection has been linked. Never mark queued records as synced.
    return { connected: false, message: 'Google Drive não conectado. A fila permanece preservada; conecte a conta e autorize as pastas antes de ativar o processamento.' };
  });