/** Conversão de exibição para D&D. NÃO use no motor, nas fichas JSON nem no replay.
 * Fórmula exata 1 pé = 0,3048 m; display de mesa em passos aproximados de 0,5 m.
 * A grade legada de 10 pés (~3 m) preserva seus custos de movimento.
 */
export const FEET_TO_METRES_EXACT=0.3048 as const;
export const feetToMetresExact=(feet:number):number=>feet*FEET_TO_METRES_EXACT;
export function feetToDndMetres(feet:number):number{
 if(!Number.isFinite(feet)||feet<0)throw new Error('Distância em pés inválida.');
 // D&D convencional adota 5 pés ≈ 1,5 metro: facilita contar casas de 3 m.
 return Math.round(feet*0.3*2)/2;
}
export function dndMetresToFeet(metres:number):number{
 if(!Number.isFinite(metres)||metres<0||metres>300)
  throw new Error('Distância em metros inválida.');
 // Velocidades de criaturas são expressas em passos de 5 pés no motor existente.
 return Math.round(metres/1.5)*5;
}
export function formatDndMetres(feet:number):string{
 const metres=feetToDndMetres(feet);
 return metres.toLocaleString('pt-BR',{maximumFractionDigits:1})+' m';
}
