/** Marco A: desenvolvimento isolado. O menu e a rota permanecem ausentes até o lote 5. */
export const BATTLE_MODULE_ENABLED = import.meta.env['VITE_ENABLE_BATTLE_MODULE'] === 'true';
/** Marco B só liga após migração isolada + autorização administrativa. */
export const BATTLE_PERSISTENCE_UI_ENABLED=import.meta.env['VITE_ENABLE_BATTLE_PERSISTENCE']==='true';
export const BATTLE_RULES_VERSION = 'PTE-2.0' as const;
