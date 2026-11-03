/** Regra de Cormyr adotada para a defesa de espionagem a partir da Lei.
 *
 * A Lei NÃO é a dificuldade do teste. Lei até 30: dificuldade 6.
 * Acrescentar +3 somente a cada 5 pontos COMPLETOS acima de 30.
 * Construções defensivas ativas são somadas DEPOIS desta conversão.
 */
export const SPY_LAW_RULE_VERSION='prosperity-law-difficulty-v2' as const;

export function spyLawDifficulty(law:number):number{
 if(!Number.isSafeInteger(law)||law<0||law>100000)
  throw new Error('Lei da Casa inválida para dificuldade de espionagem.');
 return 6+3*Math.floor(Math.max(0,law-30)/5);
}
