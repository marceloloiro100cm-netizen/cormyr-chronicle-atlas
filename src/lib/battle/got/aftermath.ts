import {survivorResult,type SurvivorCondition} from '@/lib/house/military';
import {rollDice} from './dice';
import type {WarBattle,WarSide,WarUnit} from './types';

/** Projeção de pós-batalha: nunca grava em HouseState nem autoriza baixas oficiais. */
export type WarSurvivorProposal=Readonly<{
 unitId:string;unitName:string;side:WarSide;training:WarUnit['training'];
 condition:SurvivorCondition;disorganizations:number;die:number;
 /** Auditável: +1 para Mestre de Armas confirmado pelo Narrador; penalidade por desorganizações adicionais. */
 masterOfArmsBonus:0|1;disorganizationPenalty:number;
 masterOfArmsSource:'official-house-sheet'|'narrator-scenario'|'none';
 adjusted:number;steps:number|'destroyed';
 /** Consequência da tabela 10-6 sobre a graduação atual, ainda sem aprovação. */
 proposedTraining:WarUnit['training']|'destroyed';
 extraRanksAfterElite:number;
 requiresNarratorApproval:true;
}>;
export type WarAftermathSideSummary=Readonly<{
 originalUnits:number;organized:number;disorganized:number;routedOrEscaped:number;
 destroyedInBattle:number;surrendered:number;
 proposedDestroyed:number;trainingAdvanced:number;trainingReduced:number;
}>;
export type WarGloryBreakdown=Readonly<{
 victory:number;outnumberedBonus:number;defeatConsolation:number;
}>;
export type WarAftermathPreview=Readonly<{
 rulesVersion:'GOT-CH10-1';battleId:string;winner:WarSide|null;
 glory:Readonly<Record<WarSide,number>>;
 gloryBreakdown:Readonly<Record<WarSide,WarGloryBreakdown>>;
 summary:Readonly<Record<WarSide,WarAftermathSideSummary>>;
 survivors:readonly WarSurvivorProposal[];
 appliedToHouse:false;
}>;
const TRAINING_ORDER=['green','trained','veteran','elite'] as const;
function postCondition(unit:WarUnit):SurvivorCondition{
 if(unit.condition==='destroyed')return 'destroyed';
 if(unit.condition==='routed'||unit.condition==='escaped'||unit.condition==='surrendered')return 'routed';
 if(unit.condition==='disorganized')return 'disorganized';
 return unit.health===unit.maxHealth?'unharmed':'damaged';
}
function projectTraining(unit:WarUnit,steps:number|'destroyed'):{
 training:WarUnit['training']|'destroyed';extraRanks:number;
}{
 if(steps==='destroyed')return {training:'destroyed',extraRanks:0};
 const initial=TRAINING_ORDER.indexOf(unit.training);
 const target=initial+steps;
 if(initial<0||target<0)return {training:'destroyed',extraRanks:0};
 return {training:TRAINING_ORDER[Math.min(3,target)]!,
  extraRanks:Math.max(0,target-3)};
}
const emptySummary=():WarAftermathSideSummary=>({
 originalUnits:0,organized:0,disorganized:0,routedOrEscaped:0,
 destroyedInBattle:0,surrendered:0,proposedDestroyed:0,
 trainingAdvanced:0,trainingReduced:0,
});
const emptyGlory=():WarGloryBreakdown=>({
 victory:0,outnumberedBonus:0,defeatConsolation:0,
});
export function previewWarAftermath(battle:WarBattle,options?:{
 masterOfArmsBonus?:Readonly<Record<string,0|1>>;
}):WarAftermathPreview{
 if(battle.phase!=='finished')throw new Error('A resolução de sobreviventes exige batalha encerrada.');
 let seed=battle.seed;
 const survivors:WarSurvivorProposal[]=battle.units.map(u=>{
  const dieRoll=rollDice(seed,1);seed=dieRoll.nextSeed;
  const die=dieRoll.dice[0]!;
  const condition=postCondition(u);
  const approvedHouseBonus=u.source.kind==='house-readonly'?
   u.source.warEffects?.masterOfArmsSurvivorBonus??0:0;
  const scenarioBonus=options?.masterOfArmsBonus?.[u.id]??0;
  // O Mestre de Armas documentado na ficha é aplicado automaticamente;
  // uma escolha narrativa não pode somá-lo uma segunda vez.
  const bonus=Math.max(approvedHouseBonus,scenarioBonus) as 0|1;
  const masterOfArmsSource=approvedHouseBonus?'official-house-sheet' as const:
   scenarioBonus?'narrator-scenario' as const:'none' as const;
  const disorganizationPenalty=Math.max(0,u.disorganizations-1);
  const rolled=survivorResult(die,condition,u.disorganizations,bonus);
  const projected=projectTraining(u,rolled.steps);
  return {unitId:u.id,unitName:u.name,side:u.side,training:u.training,
   condition,disorganizations:u.disorganizations,die,adjusted:rolled.adjusted,
   masterOfArmsBonus:bonus,disorganizationPenalty,masterOfArmsSource,
   steps:rolled.steps,proposedTraining:projected.training,
   extraRanksAfterElite:projected.extraRanks,requiresNarratorApproval:true};
 });
 const sides:readonly WarSide[]=['attacker','defender'];
 const summary:Record<WarSide,WarAftermathSideSummary>={
  attacker:emptySummary(),defender:emptySummary(),
 };
 for(const side of sides){
  const units=battle.units.filter(u=>u.side===side);
  const proposed=survivors.filter(u=>u.side===side);
  summary[side]={
   originalUnits:units.length,
   organized:units.filter(u=>u.condition==='organized').length,
   disorganized:units.filter(u=>u.condition==='disorganized').length,
   routedOrEscaped:units.filter(u=>u.condition==='routed'||u.condition==='escaped').length,
   destroyedInBattle:units.filter(u=>u.condition==='destroyed').length,
   surrendered:units.filter(u=>u.condition==='surrendered').length,
   proposedDestroyed:proposed.filter(u=>u.proposedTraining==='destroyed').length,
   trainingAdvanced:proposed.filter(u=>u.proposedTraining!=='destroyed'&&
    (TRAINING_ORDER.indexOf(u.proposedTraining)>TRAINING_ORDER.indexOf(u.training)||
     u.extraRanksAfterElite>0)).length,
   trainingReduced:proposed.filter(u=>u.proposedTraining!=='destroyed'&&
    TRAINING_ORDER.indexOf(u.proposedTraining)<TRAINING_ORDER.indexOf(u.training)).length,
  };
 }
 const winner=battle.winner;
 const glory:Record<WarSide,number>={attacker:0,defender:0};
 const gloryBreakdown:Record<WarSide,WarGloryBreakdown>={
  attacker:emptyGlory(),defender:emptyGlory(),
 };
 if(winner){
  const defeated=battle.units.filter(u=>u.side!==winner&&
   ['destroyed','routed','escaped','surrendered'].includes(u.condition)).length;
  const victory=defeated<=3?1:defeated<=6?2:defeated<=9?3:4;
  const own=battle.units.filter(u=>u.side===winner).length;
  const enemy=battle.units.filter(u=>u.side!==winner).length;
  const outnumberedBonus=own>0&&enemy>=own*3?3:
   own>0&&enemy>=own*2?2:own>0&&enemy*2>=own*3?1:0;
  const defeatedSide:WarSide=winner==='attacker'?'defender':'attacker';
  gloryBreakdown[winner]={victory,outnumberedBonus,defeatConsolation:0};
  gloryBreakdown[defeatedSide]={victory:0,outnumberedBonus:0,defeatConsolation:1};
  glory[winner]=victory+outnumberedBonus;
  glory[defeatedSide]=1;
 }
 return {rulesVersion:'GOT-CH10-1',battleId:battle.id,winner,glory,
  gloryBreakdown,summary,survivors,appliedToHouse:false};
}
