import type {WarUnit} from './types';

/** Cap. 10 stat integrity, independent of the actual House database.
 * Does not invent a fixed Defense or Discipline formula for imported units:
 * those may include equipment, training and active holdings.
 */
export type WarUnitStatAudit=Readonly<{
 unitId:string;endurance:number;expectedMaxHealth:number;
 currentHealth:number;defense:number;armor:number;
 fightingDice:number;marksmanshipDice:number;
 availableMeleeBonusDice:number;availableRangedBonusDice:number;
 consistency:'valid';source:'model'|'house-readonly';
}>;
const valid=(n:number,max=100000)=>Number.isInteger(n)&&n>=0&&n<=max;
export function auditWarUnitStats(unit:WarUnit):WarUnitStatAudit{
 const a=unit.ability;
 if(!unit.id.trim()||!unit.name.trim()||!valid(a.endurance,30)||a.endurance<1||
  !valid(a.agility,30)||!valid(a.athletics,30)||!valid(a.awareness,30)||
  !valid(a.fighting,30)||!valid(a.marksmanship,30)||
  !valid(a.animalHandling,30)||a.warfare!==undefined&&!valid(a.warfare,30)||
  !valid(unit.maxHealth,90)||unit.maxHealth!==a.endurance*3||
  !valid(unit.health,unit.maxHealth)||!valid(unit.defense,1000)||
  !valid(unit.armor,1000)||!valid(unit.discipline,1000)||
  !valid(unit.bulk,100)||!valid(unit.meleeDamage,1000)||
  !valid(unit.rangedDamage,1000)||!valid(unit.disorganizations,30)||
  !valid(unit.issuedThisRound,30)||!valid(unit.meleeBonusDice??0,15)||
  !valid(unit.rangedBonusDice??0,15)||
  !['none','short','long'].includes(unit.range)||
  !['green','trained','veteran','elite'].includes(unit.training))
  throw new Error('Atributos militares inconsistentes: '+unit.name);
 return {unitId:unit.id,endurance:a.endurance,expectedMaxHealth:a.endurance*3,
  currentHealth:unit.health,defense:unit.defense,armor:unit.armor,
  fightingDice:a.fighting,marksmanshipDice:a.marksmanship,
  availableMeleeBonusDice:unit.meleeBonusDice??0,
  availableRangedBonusDice:unit.rangedBonusDice??0,
  consistency:'valid',source:unit.source.kind};
}
