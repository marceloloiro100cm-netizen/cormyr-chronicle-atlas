import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { HouseState } from './types';
import { buildHouseExport, exportHouseVersion, type HouseExportAdapter } from './drive-export';
import { createHouseExportAdapter } from './drive-adapter.server';
type DB = SupabaseClient<Database>;
function check<T extends { error: unknown }>(r: T): T { if (r.error) throw r.error; return r; }

export async function exportBindingHouse(db: DB, bindingId: string, adapter: HouseExportAdapter = createHouseExportAdapter()) {
  const b = check(await db.from('drive_sync_bindings').select('*').eq('id', bindingId).single()).data;
  if (!b || !b.house_id || !b.technical_folder_id || !b.enabled || !b.privacy_reviewed || !b.runtime_authorized || !['player', 'house'].includes(b.scope)) throw new Error('Pasta técnica não autorizada para a Ficha.');
  const admin = check(await db.from('user_roles').select('user_id').eq('user_id', b.confirmed_by).eq('role', 'admin')).data;
  if (!admin?.length) throw new Error('Revisão administrativa da pasta inválida.');
  if (b.scope === 'player') {
    const player = check(await db.from('campaign_players').select('user_id,active,require_password_change').eq('id', b.player_id ?? '').maybeSingle()).data;
    const membership = check(await db.from('house_memberships').select('player_id').eq('house_id', b.house_id).eq('player_id', b.player_id ?? '').maybeSingle()).data;
    if (!player?.active || player.require_password_change || player.user_id !== b.owner_user_id || !membership) throw new Error('Leitor da pasta sem acesso autorizado à casa.');
  }
  const sheet = check(await db.from('noble_house_sheets').select('state,version,updated_at').eq('house_id', b.house_id).maybeSingle()).data;
  if (!sheet) return { message: 'Nenhuma Ficha estruturada salva; nada foi criado no Drive.', synced: false };
  const ledger = check(await db.from('noble_house_ledger').select('id,action,explanation,rule,campaign_month,version,created_at').eq('house_id', b.house_id).lte('version', sheet.version).order('version').limit(10001)).data ?? [];
  if (ledger.length > 10000) throw new Error('Histórico excede o lote; exportação interrompida, sem truncar compras.');
  const document = buildHouseExport(b.house_id, sheet.version, sheet.updated_at, sheet.state as unknown as HouseState, ledger);
  const mapped = check(await db.from('noble_house_drive_exports').select('*').eq('binding_id', b.id).maybeSingle()).data;
  try {
    const result = await exportHouseVersion(adapter, b.technical_folder_id, document, mapped?.file_id && mapped.content_hash ? { fileId: mapped.file_id, hash: mapped.content_hash, version: mapped.exported_version } : undefined);
    const current = check(await db.from('noble_house_sheets').select('version').eq('house_id', b.house_id).single()).data;
    const synced = current?.version === sheet.version;
    check(await db.from('noble_house_drive_exports').upsert({ binding_id: b.id, house_id: b.house_id, file_id: result.fileId, provider_etag: result.etag, content_hash: result.hash, exported_version: sheet.version, status: synced ? 'synced' : 'pending', error: null, last_synced_at: new Date().toISOString() }));
    return { message: synced ? `Ficha v${sheet.version} confirmada no Drive; compras preservadas.` : 'Versão exportada; há compras mais recentes aguardando exportação.', synced };
  } catch (err) {
    check(await db.from('noble_house_drive_exports').upsert({ binding_id: b.id, house_id: b.house_id, status: 'error', error: err instanceof Error ? err.message : 'Falha no Drive' }));
    throw err;
  }
}