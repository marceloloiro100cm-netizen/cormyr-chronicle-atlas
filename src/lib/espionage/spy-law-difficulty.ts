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

/** Reference bands through Lei 104; the formula above keeps going beyond it.
 * Source labels distinguish the supplement's stated range (through 59) from
 * Cormyr's agreed continuation at Law >= 60.
 */
export function spyLawDifficultyTable(){
 const first={lawMin:0,lawMax:34,difficulty:6,source:'livro' as const};
 const extended=Array.from({length:14},(_,i)=>{
  const lawMin=35+i*5;
  return {lawMin,lawMax:lawMin+4,
   difficulty:spyLawDifficulty(lawMin),
   source:(lawMin>=60?'cormyr':'livro') as 'livro'|'cormyr'};
 });
 return [first,...extended];
}
