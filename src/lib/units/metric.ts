/** Padronização métrica global do Cormyr (decisão do Narrador, 09/11/2026).
 *
 * Toda distância, velocidade, alcance e massa apresentada ao usuário usa
 * metros (m), quilômetros (km) ou quilogramas (kg).
 *
 * Duas famílias de conversão, nunca misturadas:
 * 1. EXATA (SI): 1 pé = 0,3048 m; 1 jarda = 0,9144 m; 1 milha = 1,609344 km;
 *    1 libra = 0,45359237 kg. Usada para auditoria e dados físicos reais.
 * 2. ESCALA DE MESA (regra Cormyr): 5 pés ≈ 1,5 m; 10 pés ≈ 3 m (fator 0,3).
 *    Usada por fichas D&D/5etools legadas, para que quadrados de 3 m
 *    contem exatamente como os de 10 pés. Nunca use a escala de mesa para
 *    massas nem para dados físicos reais.
 *
 * Não se aplica a Riqueza, PV, soldados, dados ou quaisquer contagens.
 */
export const FOOT_M_EXACT = 0.3048 as const;
export const YARD_M_EXACT = 0.9144 as const;
export const MILE_KM_EXACT = 1.609344 as const;
export const POUND_KG_EXACT = 0.45359237 as const;
/** Escala de mesa: 1 pé de ficha = 0,3 m (5 pés ≈ 1,5 m). */
export const TABLE_M_PER_FOOT = 0.3 as const;

const finiteNonNegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(label + ' inválido(a).');
  return value;
};

export const feetToMetresExact = (ft: number) => finiteNonNegative(ft, 'Distância') * FOOT_M_EXACT;
export const metresToFeetExact = (m: number) => finiteNonNegative(m, 'Distância') / FOOT_M_EXACT;
export const yardsToMetresExact = (yd: number) => finiteNonNegative(yd, 'Distância') * YARD_M_EXACT;
export const milesToKmExact = (mi: number) => finiteNonNegative(mi, 'Distância') * MILE_KM_EXACT;
export const kmToMilesExact = (km: number) => finiteNonNegative(km, 'Distância') / MILE_KM_EXACT;
export const poundsToKgExact = (lb: number) => finiteNonNegative(lb, 'Massa') * POUND_KG_EXACT;
export const kgToPoundsExact = (kg: number) => finiteNonNegative(kg, 'Massa') / POUND_KG_EXACT;

/** Massa canônica: kg arredondado a 0,1 kg (exibição e persistência nova). */
export const poundsToKg = (lb: number) => Math.round(poundsToKgExact(lb) * 10) / 10;

/** Decímetros inteiros na escala de mesa: aritmética exata, sem ponto flutuante. */
export function tableFeetToDecimetres(ft: number): number {
  finiteNonNegative(ft, 'Distância');
  if (!Number.isInteger(ft)) throw new Error('Distância legada exige pés inteiros.');
  return ft * 3;
}
/** Escala de mesa em metros, arredondada a 0,5 m (5 pés → 1,5 m). */
export function tableFeetToMetres(ft: number): number {
  finiteNonNegative(ft, 'Distância');
  return Math.round(ft * TABLE_M_PER_FOOT * 2) / 2;
}
/** Inverso da escala de mesa, em passos de 5 pés legados (1,5 m). */
export function tableMetresToFeet(m: number, max = 300): number {
  if (!Number.isFinite(m) || m < 0 || m > max) throw new Error('Distância em metros inválida.');
  return Math.round(m / 1.5) * 5;
}

const nf = (digits: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits });

/** Distância curta em metros; acima de 1000 m passa a km. */
export function formatDistance(m: number): string {
  finiteNonNegative(m, 'Distância');
  return m >= 1000 ? formatKm(m / 1000) : nf(1).format(m) + ' m';
}
export const formatMetres = (m: number) => nf(1).format(finiteNonNegative(m, 'Distância')) + ' m';
export const formatKm = (km: number) => nf(2).format(finiteNonNegative(km, 'Distância')) + ' km';
export const formatKg = (kg: number) => nf(1).format(finiteNonNegative(kg, 'Massa')) + ' kg';
