/** Testes do capítulo 2: dados de teste + dados de bônus; dados de penalidade retirados depois. */
export type DieResult=Readonly<{dice:readonly number[];kept:readonly number[];total:number;nextSeed:number}>;
export function seedFromText(value:string):number{
 let seed=2166136261;
 for(let i=0;i<value.length;i++){seed=Math.imul(seed^value.charCodeAt(i),16777619);}
 return seed>>>0;
}
export function rollDice(seed:number,rank:number,bonus=0,penalty=0):DieResult{
 if(![seed,rank,bonus,penalty].every(Number.isInteger)||rank<1||rank>15||bonus<0||bonus>15||penalty<0||penalty>15)
  throw new Error('Parâmetros de dados inválidos.');
 let nextSeed=seed>>>0;
 const dice:number[]=[];
 for(let i=0;i<rank+bonus;i++){
  nextSeed=(Math.imul(nextSeed,1664525)+1013904223)>>>0;
  dice.push((nextSeed%6)+1);
 }
 const kept=dice.slice().sort((a,b)=>b-a).slice(0,rank).slice(0,Math.max(0,rank-penalty));
 return {dice,kept,total:kept.reduce((a,b)=>a+b,0),nextSeed};
}
export function degreesOfSuccess(total:number,difficulty:number):number{
 return total<difficulty?0:Math.min(4,1+Math.floor((total-difficulty)/5));
}
export function criticalFailure(total:number,difficulty:number):boolean{
 return total<=difficulty-5;
}
