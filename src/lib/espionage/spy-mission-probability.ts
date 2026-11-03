/** Strategic preview: PostgreSQL returns the actual House test DC, NOT raw Law.
 * A separate law->DC calculation occurs once, before construction bonuses.
 * NEVER convert an already-converted DC into another DC.
 * Exact probabilities enumerate all N-d6 outcomes with no simulated roll.
 * This mission success odds model is a Cormyr adaptation; the Law->DC rule
 * itself follows the adopted Prosperidade cell discovery difficulty.
 */
export const SPY_BASELINE_TEST_DICE=3 as const;
export const SPY_ODDS_RULE_VERSION='cormyr-spy-law-dc-v2' as const;

/** Defensive number already represents a difficulty, including holdings. */
export function spyTestDifficulty(houseDefense:number):number{
 if(!Number.isSafeInteger(houseDefense)||houseDefense<6||houseDefense>100000)
  throw new Error('Dificuldade de espionagem inválida.');
 return houseDefense;
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
