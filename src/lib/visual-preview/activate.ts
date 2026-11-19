import {createMockSupabase} from './mock-supabase';
import {buildVisualDb} from './fixtures';
import {registerVisualServerFixtures} from './server-fixtures';
import {clearVisualServerFns} from './server-fn';
import {setVisualPreviewClient, type VisualPreviewProfile} from './state';

let activeKey: string | null = null;
let pendingStop: ReturnType<typeof setTimeout> | null = null;

/** Liga a prévia visual para o perfil Firebase autenticado (idempotente). */
export function activateVisualPreview(profile: VisualPreviewProfile, memberHouseIds: readonly string[]) {
  if (pendingStop) { clearTimeout(pendingStop); pendingStop = null; }
  const key = profile + '|' + memberHouseIds.join(',');
  if (activeKey === key) return;
  const {db, context} = buildVisualDb(profile, memberHouseIds);
  registerVisualServerFixtures(context);
  setVisualPreviewClient(createMockSupabase(db), profile);
  activeKey = key;
}

export function deactivateVisualPreview() {
  setVisualPreviewClient(null, null);
  clearVisualServerFns();
  activeKey = null;
}

/**
 * Desliga depois que todos os componentes filhos concluírem a limpeza (por
 * exemplo, removeChannel do Realtime), para que nenhuma limpeza caia no
 * cliente Supabase legado. Uma nova ativação cancela o desligamento.
 */
export function deactivateVisualPreviewSoon() {
  if (pendingStop) clearTimeout(pendingStop);
  pendingStop = setTimeout(() => { pendingStop = null; deactivateVisualPreview(); }, 0);
}
