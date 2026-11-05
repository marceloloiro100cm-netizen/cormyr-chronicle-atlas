/** Implantação formal FASE A (apenas Narrador): simulador isolado sem banco.
 * Kill-switch no build: VITE_ENABLE_BATTLE_MODULE=false.
 * A persistência FASE B continua separadamente bloqueada.
 */
export const BATTLE_MODULE_ENABLED = import.meta.env['VITE_ENABLE_BATTLE_MODULE'] !== 'false';
/** Liberação operacional da fase B: tabelas e RPCs de batalha homologadas em produção.
 * A visibilidade continua exclusiva do Narrador (data.admin).
 * Kill-switch de emergência: VITE_ENABLE_BATTLE_PERSISTENCE=false (novo build).
 */
export const BATTLE_PERSISTENCE_UI_ENABLED=import.meta.env['VITE_ENABLE_BATTLE_PERSISTENCE']!=='false';
export const BATTLE_RULES_VERSION = 'PTE-2.0' as const;
