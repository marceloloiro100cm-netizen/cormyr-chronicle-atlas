/** Prosperidade, Mechanics > Stacking Bonuses. Ambiguous boundaries stay blocked. */
export function stackingBonus(total:number,dice:number[]=[]):number {
 if(!Number.isFinite(total)||total<0||!Number.isInteger(total))throw new Error('Total de bônus inválido.');
 if(total===0||total===1){if(dice.length)throw new Error('Bônus fixo não usa dados.');return total;}
 if(total===2||total===3)throw new Error('1d6 dividido por dois: arredondamento exige decisão do Narrador.');
 if(total===12||total>18)throw new Error('Limite da tabela de empilhamento ambíguo: decisão do Narrador necessária.');
 const count=total<=6?1:total<=11?2:3;
 if(dice.length!==count||dice.some(d=>!Number.isInteger(d)||d<1||d>6))throw new Error(`Registre ${count} dado(s) de empilhamento de 1 a 6.`);
 return dice?.reduce((n,d)=>n+d,0) ?? 0;
}