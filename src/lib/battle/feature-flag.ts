/** Fase B: liberação expressa do Narrador, limitada ao armazenamento tático.
 * Kill-switches de build: VITE_ENABLE_BATTLE_MODULE=false e VITE_ENABLE_BATTLE_PERSISTENCE=false.
 * A API do servidor mantém uma verificação independente de papel e outro kill-switch.
 */
export const BATTLE_MODULE_ENABLED = import.meta.env['VITE_ENABLE_BATTLE_MODULE'] !== 'false';
export const BATTLE_PERSISTENCE_UI_ENABLED =
 BATTLE_MODULE_ENABLED && import.meta.env['VITE_ENABLE_BATTLE_PERSISTENCE'] !== 'false';
export const BATTLE_RULES_VERSION = 'PTE-2.0' as const;
