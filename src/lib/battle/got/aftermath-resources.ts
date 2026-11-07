import {rollDice} from './dice';
import type {WarBattle,WarSide} from './types';

export type WarResources=Readonly<{
 law:number;population:number;wealth:number;land:number;defense:number;
}>;
export type WarResourceScenario=Readonly<{
 occupiedDomain:boolean;
 garrisonHeldForThreeMonths:boolean;
 /** Invested value of the captured land (chosen by the narrator). */
 capturedLandValue:number;
 /** Defensive resource invested in the surviving fortification. */
 survivingFortDefenseValue:number;
 domainHasCommunityOrFort:boolean;
 transferredWealthInvestments:number;
 /** Identificação declarada pelo Narrador: domínio arrasado -> proprietário. */
 scorchedDomainOwners?:Readonly<Record<string,WarSide>>;
}>;
export type WarResourceProposal=Readonly<{
 battleId:string;winner:WarSide|null;loser:WarSide|null;
 attacker:WarResources;defender:WarResources;
 dice:Readonly<Record<string,readonly number[]>>;
 captured:readonly Readonly<{heroId:string;name:string;side:WarSide;status:number;ransomWealth:number}>[];
 occupationMonthsRequired:3;
 occupationSecured:boolean;
 provisionalOccupationTransfer:boolean;
 unresolvedScorchedDomains:readonly string[];
 appliedToHouse:false;
 notes:readonly string[];
}>;
const zero=():WarResources=>({law:0,population:0,wealth:0,land:0,defense:0});
const safe=(n:number)=>Number.isInteger(n)&&n>=0&&n<=10000;
const other=(side:WarSide):WarSide=>side==='attacker'?'defender':'attacker';
/** Optional step 11 preview. Does not update the House, owner, calendar or any database.
 * Where the book leaves occupation and transfer to the narrator, this
 * method requires an explicit scenario rather than guessing from the map.
 */
export function previewWarResourceConsequences(
 battle:WarBattle,scenario:WarResourceScenario,
):WarResourceProposal{
 if(battle.phase!=='finished')
  throw new Error('Consequências exigem batalha encerrada.');
 if(!safe(scenario.capturedLandValue)||!safe(scenario.survivingFortDefenseValue)||
  !safe(scenario.transferredWealthInvestments))
  throw new Error('Recursos de cenário precisam ser inteiros não negativos.');
 if(!scenario.occupiedDomain&&(
  scenario.capturedLandValue||scenario.survivingFortDefenseValue||
  scenario.transferredWealthInvestments||scenario.garrisonHeldForThreeMonths))
  throw new Error('Transferência de recursos exige domínio ocupado.');
 const owners=scenario.scorchedDomainOwners??{};
 if(Object.entries(owners).some(([id,owner])=>!id.trim()||
  (owner!=='attacker'&&owner!=='defender')))
  throw new Error('Proprietário do domínio arrasado precisa ser um dos exércitos.');
 const winner=battle.winner,loser=winner?other(winner):null;
 const delta:Record<WarSide,WarResources>={attacker:zero(),defender:zero()};
 const dice:Record<string,readonly number[]>={};
 let seed=battle.seed;
 const roll=(key:string,count:number):number=>{
  const outcome=rollDice(seed,count);seed=outcome.nextSeed;
  dice[key]=outcome.dice;
  return outcome.dice.reduce((sum,n)=>sum+n,0);
 };
 const notes:string[]=[
  'Prévia local: não altera fichas, economia, domínios, usuários ou calendário.',
  'Prisioneiros, transferência de posses e ocupação exigem aprovação do Narrador.',
 ];
 const captured=battle.heroes.filter(h=>h.defeatOutcome==='captured').map(h=>({
  heroId:h.id,name:h.name,side:h.side,status:h.status,ransomWealth:h.status,
 }));
 if(winner&&loser){
  const w={...delta[winner]},l={...delta[loser]};
  l.law-=roll('law-loser',1);
  if(scenario.occupiedDomain){
   w.law-=roll('law-occupant',1);
   l.population-=roll('population-loser',1);
   w.population+=Math.max(0,roll('population-winner',1)-1);
   const wealth=roll('wealth-loser',2);
   l.wealth-=wealth;
   if(scenario.domainHasCommunityOrFort)
    w.wealth+=Math.max(0,roll('wealth-winner',1)-1);
   l.land-=scenario.capturedLandValue;
   w.land+=scenario.capturedLandValue;
   l.defense-=scenario.survivingFortDefenseValue;
   w.defense+=scenario.survivingFortDefenseValue;
   l.wealth-=scenario.transferredWealthInvestments;
   w.wealth+=scenario.transferredWealthInvestments;
   if(!scenario.garrisonHeldForThreeMonths)
    notes.push('A posse da terra exige guarnição por três meses para ser assegurada.');
  }else notes.push('Nenhuma transferência de domínio foi simulada.');
  delta[winner]=w;delta[loser]=l;
 }
 const unresolved=new Set<string>();
 // Terra Arrasada afeta o dono declarado do domínio, não o derrotado por suposição.
 for(const record of battle.scorchedPreview??[]){
  const owner=owners[record.domainId];
  if(!owner){unresolved.add(record.domainId);continue;}
  const affected=delta[owner];
  delta[owner]={...affected,
   population:affected.population+record.populationDelta,
   wealth:affected.wealth+record.wealthDelta};
 }
 if(unresolved.size)notes.push('Terra Arrasada sem proprietário confirmado: '+
  [...unresolved].join(', ')+'. Nenhuma perda dessas posses foi atribuída.');
 if(scenario.occupiedDomain&&!scenario.garrisonHeldForThreeMonths)
  notes.push('Terras e Defesa são projeções condicionais, não uma ocupação consolidada.');
 return {battleId:battle.id,winner,loser,attacker:delta.attacker,
  defender:delta.defender,dice,captured,occupationMonthsRequired:3,
  occupationSecured:scenario.occupiedDomain&&scenario.garrisonHeldForThreeMonths,
  provisionalOccupationTransfer:scenario.occupiedDomain&&!scenario.garrisonHeldForThreeMonths,
  unresolvedScorchedDomains:[...unresolved],
  appliedToHouse:false,notes};
}
