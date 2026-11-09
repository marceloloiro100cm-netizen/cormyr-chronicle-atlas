/** Adaptador D&D: fichas legadas (speed_ft/fly_ft, 5etools) → escala métrica de mesa.
 * Delegado ao módulo central `@/lib/units/metric`. Os valores legados nunca
 * são reescritos; a conversão ocorre apenas na borda (leitura/edição/exibição).
 */
import {FOOT_M_EXACT,feetToMetresExact as exact,tableFeetToMetres,
 tableMetresToFeet,formatMetres} from '@/lib/units/metric';

export const FEET_TO_METRES_EXACT=FOOT_M_EXACT;
export const feetToMetresExact=(feet:number):number=>exact(feet);
export function feetToDndMetres(feet:number):number{
 if(!Number.isFinite(feet)||feet<0)throw new Error('Distância legada inválida.');
 return tableFeetToMetres(feet);
}
export const dndMetresToFeet=(metres:number):number=>tableMetresToFeet(metres);
export const formatDndMetres=(feet:number):string=>formatMetres(feetToDndMetres(feet));

/** Leitura métrica de um registro legado do bestiário, preservando a fonte para auditoria. */
export type DndLegacySpeed=Readonly<{speed_ft:number;fly_ft?:number|undefined|null}>;
export function dndLegacySpeedToMetric(row:DndLegacySpeed){
 return {
  walkM:feetToDndMetres(row.speed_ft),
  flyM:row.fly_ft==null?null:feetToDndMetres(row.fly_ft),
  legacy:{speed_ft:row.speed_ft,fly_ft:row.fly_ft??null},
 } as const;
}
/** Escrita: metros digitados → campos legados (passos de 1,5 m = 5 pés). */
export function dndMetricSpeedToLegacy(input:Readonly<{walkM:number;flyM?:number|null}>){
 return {
  speed_ft:dndMetresToFeet(input.walkM),
  ...(input.flyM==null?{}:{fly_ft:dndMetresToFeet(input.flyM)}),
 };
}
