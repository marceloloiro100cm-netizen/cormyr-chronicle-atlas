/** Probabilidades exatas dos testes do capítulo 2, sem rolar dados.
 * Espelha `rollDice`: rolam-se graduação + bônus, ficam os melhores
 * (graduação − penalidade) dados. Usado só para orientar a interface;
 * a resolução real continua no motor com a semente auditável.
 */
const cache=new Map<string,readonly number[]>();
const choose=(n:number,k:number):number=>{
 let value=1;
 for(let i=1;i<=k;i++)value=value*(n-k+i)/i;
 return value;
};
/** Índice = total do teste; valor = probabilidade. */
export function warRollDistribution(rank:number,bonus=0,penalty=0):readonly number[]{
 if(![rank,bonus,penalty].every(Number.isInteger)||rank<1||rank>15||bonus<0||bonus>15||
  penalty<0||penalty>15)throw new Error('Parâmetros de dados inválidos.');
 const key=rank+':'+bonus+':'+penalty;
 const hit=cache.get(key);
 if(hit)return hit;
 const dice=rank+bonus,kept=Math.max(0,rank-penalty);
 const result=new Array<number>(kept*6+1).fill(0);
 const total=Math.pow(6,dice);
 // Percorre as faces de 6 a 1, escolhendo quantos dados caem em cada face.
 const walk=(face:number,left:number,keepLeft:number,sum:number,ways:number):void=>{
  if(face===1){
   result[sum+Math.min(left,keepLeft)]!+=ways/total;
   return;
  }
  for(let count=0;count<=left;count++){
   const used=Math.min(count,keepLeft);
   walk(face-1,left-count,keepLeft-used,sum+used*face,ways*choose(left,count));
  }
 };
 walk(6,dice,kept,0,1);
 cache.set(key,result);
 return result;
}
export type WarOdds=Readonly<{
 /** Chance de igualar ou superar a Dificuldade. */
 success:number;
 /** Chance de falha crítica (5 ou mais abaixo da Dificuldade). */
 critical:number;
 /** Chance de obter exatamente 1, 2, 3 ou 4 graus. */
 degrees:readonly [number,number,number,number];
 expectedDegrees:number;
}>;
/** `modifier` é somado ao total antes da comparação (clima, por exemplo). */
export function warTestOdds(input:{
 rank:number;bonus?:number;penalty?:number;difficulty:number;modifier?:number;
}):WarOdds{
 const spread=warRollDistribution(input.rank,input.bonus??0,input.penalty??0);
 const degrees:[number,number,number,number]=[0,0,0,0];
 let success=0,critical=0;
 spread.forEach((chance,rolled)=>{
  if(!chance)return;
  const total=Math.max(0,rolled+(input.modifier??0));
  if(total<input.difficulty){
   if(total<=input.difficulty-5)critical+=chance;
   return;
  }
  success+=chance;
  const degree=Math.min(4,1+Math.floor((total-input.difficulty)/5));
  degrees[degree-1]!+=chance;
 });
 return {success,critical,degrees,
  expectedDegrees:degrees.reduce((sum,chance,i)=>sum+chance*(i+1),0)};
}
/** Dano médio de um ataque: dano básico × graus − VA, nunca negativo. */
export function warExpectedDamage(odds:WarOdds,baseDamage:number,armor:number):number{
 return odds.degrees.reduce((sum,chance,i)=>
  sum+chance*Math.max(0,baseDamage*(i+1)-armor),0);
}
export function formatWarChance(value:number):string{
 const percent=Math.round(value*100);
 if(percent===0&&value>0)return '<1%';
 if(percent===100&&value<1)return '>99%';
 return percent+'%';
}
