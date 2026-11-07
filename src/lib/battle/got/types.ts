import type {WarFormation,WarFacing} from './formations';
import type {WarTerrainTile,WarVisibility,WarWeather} from './terrain';
import type {WarFortification} from './fortifications';
import type {WarHero} from './heroes';
import type {WarSiegeEngine} from './siege';
import type {WarPendingPersonalDamage} from './personal-injuries';
import type {WarSquad} from './squads';
/** Motor independente de Guerra dos Tronos RPG, capítulo 10. Não reaproveitar BattleState/PTE. */
export type WarSide='attacker'|'defender';
export type WarPosition=Readonly<{x:number;y:number}>;
export type WarCondition='organized'|'disorganized'|'routed'|'destroyed'|'surrendered'|'escaped';
export type WarRange='none'|'short'|'long';
export type WarOrderKind='attack'|'charge'|'defend'|'move'|'ready'|'rally'|'revive'|'reorganize'|'retreat'|'aggressive-retreat'|'surrender'|'formation'|'turn'|'reverse'|'suppress'|'probe'|'push'|'counter-charge'|'sabotage'|'ambush'|'join';
export type WarReadyPlan=Readonly<{
 trigger:'enemy-adjacent'|'enemy-routed';
 reaction:'attack'|'move';
 to?:WarPosition;
 ranged?:boolean;
}>;
export type WarOrder=Readonly<{
 kind:WarOrderKind;
 targetId?:string;
 targetHeroId?:string;
 to?:WarPosition;
 sprint?:boolean;
 ranged?:boolean;
 formation?:WarFormation;
 facing?:WarFacing;
 fortId?:string;
 ready?:WarReadyPlan;
}>;
export type WarCommander=Readonly<{
 id:string;name:string;side:WarSide;role:'commander'|'subcommander';
 warfare:number;strategy:number;status:number;active:boolean;
}>;
export type WarUnit=Readonly<{
 id:string;name:string;side:WarSide;typeId:string;
 position:WarPosition;training:'green'|'trained'|'veteran'|'elite';
 ability:Readonly<{agility:number;athletics:number;awareness:number;endurance:number;
 fighting:number;marksmanship:number;animalHandling:number;warfare?:number;}>;
 defense:number;discipline:number;armor:number;bulk:number;
 meleeDamage:number;rangedDamage:number;range:WarRange;mounted:boolean;naval:boolean;
 meleeBonusDice?:number;rangedBonusDice?:number;
 maxHealth:number;health:number;condition:WarCondition;disorganizations:number;
 standing:WarOrder|null;activated:boolean;defendRoll:number|null;
 formation?:WarFormation;facing?:WarFacing;
 hidden?:boolean;exposedFacingUntilRound?:number;
 suppressionPenalty?:number;suppressionRound?:number;probeDefenseRound?:number;
 counterChargeReady?:boolean;
 issuedThisRound:number;actedThisRound:boolean;criticalThisRound:boolean;
 source:Readonly<{kind:'model'|'house-readonly';houseId?:string;unitId?:string;version?:number}>;
}>;
export type WarEvent=Readonly<{
 seq:number;round:number;side:WarSide|null;kind:string;text:string;
 roll?:readonly number[];total?:number;difficulty?:number;degrees?:number;
}>;
export type WarPersonalInitiative=Readonly<{
 phase:'heroes-first'|'heroes-second';roundIndex:number;
 order:readonly string[];cursor:number;
 originalOrder?:readonly string[];delayedHeroIds?:readonly string[];
}>;
export type WarBattle=Readonly<{
 schemaVersion:1;rulesVersion:'GOT-CH10-1';id:string;name:string;seed:number;
 width:number;height:number;metresPerCell:10;round:number;
 tiles:readonly WarTerrainTile[];weather:WarWeather;visibility:WarVisibility;advancedFormations:boolean;
 fortifications:readonly WarFortification[];
 phase:'siege'|'heroes-first'|'orders'|'heroes-second'|'finished';first:WarSide;turn:WarSide;
 heroes:readonly WarHero[];heroSecondCompletedRound?:number;
 personalInitiative?:WarPersonalInitiative|undefined;
 manualMitigation?:boolean;pendingPersonalDamage?:WarPendingPersonalDamage|undefined;
 pendingPersonalCounterattack?:Readonly<{
  attackerId:string;defenderId:string;ranged:boolean;charge:boolean;
  cautious?:boolean;reckless?:boolean;
  twoHandedGrip?:boolean;powerBonusDice?:number;
 }>|undefined;
 squads?:readonly WarSquad[];
 siege:readonly WarSiegeEngine[];siegeCompleted:Readonly<Record<WarSide,boolean>>;
 commanders:readonly WarCommander[];units:readonly WarUnit[];
 ordersRemaining:Readonly<Record<string,number>>;
 events:readonly WarEvent[];winner:WarSide|null;
}>;
export type WarOrderResult=Readonly<{battle:WarBattle;passed:boolean;critical:boolean;test:number;difficulty:number;degrees:number}>;
