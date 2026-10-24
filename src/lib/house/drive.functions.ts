import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const exportHouseToDrive = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ houseId: z.string().min(1).max(100) })).handler(async ({ data, context }) => {
  const [admin, membership] = await Promise.all([context.supabase.rpc('is_campaign_admin'), context.supabase.rpc('in_campaign_house', { h: data.houseId, edit_required: true })]);
  if (admin.error || membership.error || (!admin.data && !membership.data)) throw new Error('Casa não autorizada.');
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const bindings = await db.from('drive_sync_bindings').select('id,owner_user_id,technical_folder_id').eq('house_id', data.houseId).eq('enabled', true).eq('privacy_reviewed', true).eq('runtime_authorized', true);
  if (bindings.error) throw new Error('Pastas indisponíveis.');
  const allowed = (bindings.data ?? []).filter(b => b.technical_folder_id && (admin.data || b.owner_user_id === context.userId));
  if (!allowed.length) throw new Error('Nenhuma pasta técnica existente autorizada para este acesso.');
  const { exportBindingHouse } = await import('./drive-export.server');
  const messages: string[] = [];
  for (const b of allowed) {
    const token = crypto.randomUUID();
    const lease = await db.rpc('claim_drive_binding', { p_id: b.id, p_token: token });
    if (lease.error || !lease.data) { messages.push('Pasta ocupada por outra sincronização; tente novamente.'); continue; }
    try { messages.push((await exportBindingHouse(db, b.id)).message); }
    finally { await db.from('drive_sync_bindings').update({ lease_token: null, lease_until: null }).eq('id', b.id).eq('lease_token', token); }
  }
  return { message: messages.join(' ') };
});