/** Regras exclusivas do simulador D&D, sem alterar os outros presets CRZ. */
export type DndSimulationProfile='dnd-v3';
/** Regra Cormyr (métrica): cada quadrado mede 3 m.
 * Diagonal custa 1,5 quadrado; ataque adjacente = célula vizinha.
 * Ataque à distância não tem alcance numérico: exige linha de visão.
 */
export const DND_METRES_PER_SQUARE=3 as const;
export const DND_DIAGONAL_SQUARE_COST=1.5 as const;
/** @deprecated Campo histórico do ruleset (`movement.feetPerHex`), mantido só
 * para hashes/replays. Equivale a 3 m na escala de mesa. Não usar em regras novas. */
export const DND_FEET_PER_SQUARE=10 as const;
/** @deprecated Use DND_METRES_PER_SQUARE. */
export const DND_METRES_PER_SQUARE_DISPLAY=DND_METRES_PER_SQUARE;
export const isDndV3=(state:Readonly<{rulesetId:string;simulationProfile?:string|undefined}>):boolean=>
 state.rulesetId==='CRZ-5E'&&state.simulationProfile==='dnd-v3';
export const isDndBattle=(state:Readonly<{id:string;rulesetId:string;
 simulationProfile?:string|undefined}>):boolean=>
 state.rulesetId==='CRZ-5E'&&
 (state.id.startsWith('dnd-training-v2-')||isDndV3(state));

/** Reconhece arquivos antigos sem reinterpretar a matemática/replay V1. */
export const isDndReplay=(state:Readonly<{id:string;rulesetId:string}>):boolean=>
 state.rulesetId==='CRZ-5E'&&state.id.startsWith('dnd-training-');

/** Um monstro voador usa a altitude abstrata apenas para atravessar terrenos.
 * Ataques continuam exigindo linha de visão; não há combate vertical nesta etapa.
 */
export const dndCanFly=(unit:Readonly<{
 template:Readonly<{flags:Readonly<{flying:boolean}>;speedFt:Readonly<{fly?:number|undefined}>}>;
}>):boolean=>Boolean(unit.template.flags.flying&&(unit.template.speedFt.fly??0)>0);

/** Distância sem limite no tabuleiro: não impõe alcance máximo, mas respeita LOS. */
export const DND_UNBOUNDED_RANGED=true as const;
