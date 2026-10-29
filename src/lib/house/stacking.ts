/** Prosperidade, Mechanics > Stacking Bonuses. Ambiguous boundaries stay blocked. */
export function stackingBonus(total:number,dice:number[]=[]):number {
 if(!Number.isFinite(total)||total<0||!Number.isInteger(total))throw new Error('Total de bônus inválido.');
 if(total===0||total===1){if(dice.length)throw new Error('Bônus fixo não usa dados.');return total;}
 const count=total<=3?1:total<=6?1:total<=11?2:total<=18?3:3+Math.ceil((total-18)/6);
 if(dice.length!==count||dice.some(d=>!Number.isInteger(d)||d<1||d>6))throw new Error(`Registre ${count} dado(s) de empilhamento de 1 a 6.`);
 if(total===2||total===3)return Math.max(1,Math.floor(dice[0]/2));
 return dice.reduce((n,d)=>n+d,0);
}