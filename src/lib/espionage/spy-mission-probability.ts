/** Cormyr strategic preview, NOT a published SIFRP house-action rule.
 * Law (+ verified defenses) is on a 0-100 resource scale, not a d6 target.
 * Convert to a table-compatible test difficulty (6..21, increments of 3).
 * Exact probabilities enumerate independent fair d6 pools; no dice are rolled.
 * Until agent skills are saved, the preview explicitly uses a provisional 3D6.
 */
export const SPY_BASELINE_TEST_DICE=3 as const;
export const SPY_ODDS_RULE_VERSION='cormyr-spy-preview-v1' as const;

export function spyTestDifficulty(houseDefense:number):number{
 if(!Number.isSafeInteger(houseDefense)||houseDefense<0||houseDefense>100000)
  throw new Error('Defesa da Casa inválida.');
 return 6+3*Math.min(5,Math.floor(houseDefense/20));
}
export function spyTestLabel(difficulty:number){
 const names:Record<number,string>={
  6:'Rotineira',9:'Desafiadora',12:'Formidável',
  15:'Difícil',18:'Muito difícil',21:'Heroica',
 };
 return names[difficulty]??'Especial';
}
/** Exact P(sum of N d6 >= DC), including equality as a success. */
export function spyDiceSuccessPercent(dice:number,difficulty:number):number{
 if(!Number.isInteger(dice)||dice<1||dice>7||
    !Number.isInteger(difficulty)||difficulty<0||difficulty>100000)
  throw new Error('Parâmetros de dado inválidos.');
 let totals=new Array(6*dice+1).fill(0) as number[];
 totals[0]=1;
 for(let n=0;n<dice;n++){
  const next=new Array(6*dice+1).fill(0) as number[];
  for(let sum=0;sum<totals.length;sum++)if(totals[sum]){
   for(let side=1;side<=6;side++)next[sum+side]=(next[sum+side]??0)+(totals[sum]??0);
  }
  totals=next;
 }
 const wins=totals.reduce((n,count,sum)=>n+(sum>=difficulty?count:0),0);
 return Math.round(1000*wins/(6**dice))/10;
}
export function spyMissionOdds(houseDefense:number,dice:number=SPY_BASELINE_TEST_DICE){
 const testDifficulty=spyTestDifficulty(houseDefense);
 return {
  houseDefense,testDifficulty,
  difficultyLabel:spyTestLabel(testDifficulty),
  successPercent:spyDiceSuccessPercent(dice,testDifficulty),
  testDice:dice,
  rulesVersion:SPY_ODDS_RULE_VERSION,
  provisional:true as const,
 };
}
