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
    return { connected: true, message: 'Conexão com Google Drive verificada por leitura. Gravação bidirecional ainda não validada; fila preservada, sem marcar registros como sincronizados.' };
  });