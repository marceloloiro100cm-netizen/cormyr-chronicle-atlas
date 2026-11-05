/** Módulo de batalha PTE-2.0 exclusivo do Narrador. Sem alteração de fichas oficiais.
 * Kill-switch de produção do laboratório: VITE_ENABLE_BATTLE_MODULE=false.
 */
export const BATTLE_MODULE_ENABLED = import.meta.env['VITE_ENABLE_BATTLE_MODULE'] !== 'false';
/** Release autorizado. A disponibilidade real ainda é decidida por autenticação,
 * permissão atual do Narrador, conexão service_role e leitura do banco no servidor.
 * Kill-switch de interface: VITE_ENABLE_BATTLE_PERSISTENCE=false no build.
 */
export const BATTLE_PERSISTENCE_UI_ENABLED=import.meta.env['VITE_ENABLE_BATTLE_PERSISTENCE']!=='false';
export const BATTLE_RULES_VERSION = 'PTE-2.0' as const;

/** Dueloss sincronizados entre dois jogadores exigem migração V3.4 e aceite com JWT real. */
export const BATTLE_V34_SYNC_UI_ENABLED=import.meta.env['VITE_ENABLE_BATTLE_V34_SYNC']==='true';
