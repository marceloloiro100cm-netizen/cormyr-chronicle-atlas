import {survivorResult,type SurvivorCondition} from '@/lib/house/military';
import {rollDice} from './dice';
import type {WarBattle,WarSide,WarUnit} from './types';

/** Projeção de pós-batalha: nunca grava em HouseState nem autoriza baixas oficiais. */
export type WarSurvivorProposal=Readonly<{
 unitId:string;unitName:string;side:WarSide;training:WarUnit['training'];
 condition:SurvivorCondition;disorganizations:number;die:number;
 adjusted:number;steps:number|'destroyed';
}>;
export type WarAftermathPreview=Readonly<{
 rulesVersion:'GOT-CH10-1';battleId:string;winner:WarSide|null;
 glory:Readonly<Record<WarSide,number>>;
 survivors:readonly WarSurvivorProposal[];
 appliedToHouse:false;
}>;
function postCondition(unit:WarUnit):SurvivorCondition{
 if(unit.condition==='destroyed')return 'destroyed';
 if(unit.condition==='routed'||unit.condition==='escaped'||unit.condition==='surrendered')return 'routed';
 if(unit.condition==='disorganized')return 'disorganized';
 return unit.health===unit.maxHealth?'unharmed':'damaged';
}
export function previewWarAftermath(battle:WarBattle,options?:{
 masterOfArmsBonus?:Readonly<Record<string,0|1>>;
}):WarAftermathPreview{
 if(battle.phase!=='finished')throw new Error('A resolução de sobreviventes exige batalha encerrada.');
 let seed=battle.seed;
 const survivors:WarSurvivorProposal[]=battle.units.map(u=>{
  const dieRoll=rollDice(seed,1);seed=dieRoll.nextSeed;
  const die=dieRoll.dice[0]!;
  const condition=postCondition(u);
  const bonus=options?.masterOfArmsBonus?.[u.id]??0;
  const rolled=survivorResult(die,condition,u.disorganizations,bonus);
  return {unitId:u.id,unitName:u.name,side:u.side,training:u.training,
   condition,disorganizations:u.disorganizations,die,adjusted:rolled.adjusted,
   steps:rolled.steps};
 });
 const winner=battle.winner;
 const glory:Record<WarSide,number>={attacker:0,defender:0};
 if(winner){
  const defeated=battle.units.filter(u=>u.side!==winner&&
   ['destroyed','routed','escaped','surrendered'].includes(u.condition)).length;
  glory[winner]=defeated<=3?1:defeated<=6?2:defeated<=9?3:4;
  const own=battle.units.filter(u=>u.side===winner).length;
  const enemy=battle.units.filter(u=>u.side!==winner).length;
  if(own>0&&enemy>=own*3)glory[winner]+=3;
  else if(own>0&&enemy>=own*2)glory[winner]+=2;
  else if(own>0&&enemy*2>=own*3)glory[winner]+=1;
  glory[winner==='attacker'?'defender':'attacker']=1;
 }
 return {rulesVersion:'GOT-CH10-1',battleId:battle.id,winner,glory,
  survivors,appliedToHouse:false};
}
