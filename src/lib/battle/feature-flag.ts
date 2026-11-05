/** Implantação formal FASE A (apenas Narrador): simulador isolado sem banco.
 * Kill-switch no build: VITE_ENABLE_BATTLE_MODULE=false.
 * A persistência FASE B continua separadamente bloqueada.
 */
export const BATTLE_MODULE_ENABLED = import.meta.env['VITE_ENABLE_BATTLE_MODULE'] !== 'false';
/** Marco B só liga após migração isolada + autorização administrativa. */
export const BATTLE_PERSISTENCE_UI_ENABLED=import.meta.env['VITE_ENABLE_BATTLE_PERSISTENCE']==='true';
export const BATTLE_RULES_VERSION = 'PTE-2.0' as const;
