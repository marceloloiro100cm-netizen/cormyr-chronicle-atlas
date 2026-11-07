import type {WarFormation,WarFacing} from './formations';
import type {WarTerrainTile,WarVisibility,WarWeather} from './terrain';
/** Motor independente de Guerra dos Tronos RPG, capítulo 10. Não reaproveitar BattleState/PTE. */
export type WarSide='attacker'|'defender';
export type WarPosition=Readonly<{x:number;y:number}>;
export type WarCondition='organized'|'disorganized'|'routed'|'destroyed'|'surrendered'|'escaped';
export type WarRange='none'|'short'|'long';
export type WarOrderKind='attack'|'charge'|'defend'|'move'|'ready'|'rally'|'revive'|'reorganize'|'retreat'|'aggressive-retreat'|'formation'|'turn'|'reverse';
export type WarOrder=Readonly<{
 kind:WarOrderKind;
 targetId?:string;
 to?:WarPosition;
 sprint?:boolean;
 ranged?:boolean;
 formation?:WarFormation;
 facing?:WarFacing;
}>;
export type WarCommander=Readonly<{
 id:string;name:string;side:WarSide;role:'commander'|'subcommander';
 warfare:number;strategy:number;status:number;active:boolean;
}>;
export type WarUnit=Readonly<{
 id:string;name:string;side:WarSide;typeId:string;
 position:WarPosition;training:'green'|'trained'|'veteran'|'elite';
 ability:Readonly<{agility:number;athletics:number;awareness:number;endurance:number;
 fighting:number;marksmanship:number;animalHandling:number;}>;
 defense:number;discipline:number;armor:number;bulk:number;
 meleeDamage:number;rangedDamage:number;range:WarRange;mounted:boolean;naval:boolean;
 meleeBonusDice?:number;rangedBonusDice?:number;
 maxHealth:number;health:number;condition:WarCondition;disorganizations:number;
 standing:WarOrder|null;activated:boolean;defendRoll:number|null;
 formation?:WarFormation;facing?:WarFacing;
 issuedThisRound:number;actedThisRound:boolean;criticalThisRound:boolean;
 source:Readonly<{kind:'model'|'house-readonly';houseId?:string;unitId?:string;version?:number}>;
}>;
export type WarEvent=Readonly<{
 seq:number;round:number;side:WarSide|null;kind:string;text:string;
 roll?:readonly number[];total?:number;difficulty?:number;degrees?:number;
}>;
export type WarBattle=Readonly<{
 schemaVersion:1;rulesVersion:'GOT-CH10-1';id:string;name:string;seed:number;
 width:number;height:number;metresPerCell:10;round:number;
 tiles:readonly WarTerrainTile[];weather:WarWeather;visibility:WarVisibility;advancedFormations:boolean;
 phase:'orders'|'finished';first:WarSide;turn:WarSide;
 commanders:readonly WarCommander[];units:readonly WarUnit[];
 ordersRemaining:Readonly<Record<string,number>>;
 events:readonly WarEvent[];winner:WarSide|null;
}>;
export type WarOrderResult=Readonly<{battle:WarBattle;passed:boolean;critical:boolean;test:number;difficulty:number;degrees:number}>;
