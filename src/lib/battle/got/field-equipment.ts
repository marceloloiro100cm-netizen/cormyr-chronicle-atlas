import type {WarUnit} from './types';

/** Military equipment, Chapter 10 pp. 223–225.
 * A unit can equip one special package in the digital laboratory.
 * Importing a House unit does not buy, equip or consume actual resources.
 */
export type WarFieldEquipmentId=
 'mantlet'|'tortoise'|'siege-tower'|'ladders'|
 'ram'|'covered-ram'|'wildfire-pots'|'boiling-water'|'boiling-oil';
export type WarFieldEquipmentProfile=Readonly<{
 id:WarFieldEquipmentId;label:string;
 costResource:'wealth'|'land';cost:number;
 attackBlocked:boolean;moveOverrideMetres?:number;
 movePenaltyMetres?:number;rangedDefenseBonus?:number;defenseBonus?:number;
 orderDifficulty?:number;singleUse?:boolean;
}>;
export const WAR_FIELD_EQUIPMENT:Readonly<Record<WarFieldEquipmentId,WarFieldEquipmentProfile>>={
 mantlet:{id:'mantlet',label:'Manteletes',costResource:'wealth',cost:1,
  attackBlocked:false,movePenaltyMetres:10,rangedDefenseBonus:5},
 tortoise:{id:'tortoise',label:'Tartaruga',costResource:'wealth',cost:1,
  attackBlocked:true,moveOverrideMetres:10,defenseBonus:10},
 'siege-tower':{id:'siege-tower',label:'Torre de Cerco',
  costResource:'wealth',cost:2,attackBlocked:false,
  moveOverrideMetres:10,defenseBonus:5},
 ladders:{id:'ladders',label:'Escadas, cordas e arpéus',
  costResource:'wealth',cost:0.5,attackBlocked:true},
 ram:{id:'ram',label:'Aríete simples',costResource:'land',
  cost:1,attackBlocked:true},
 'covered-ram':{id:'covered-ram',label:'Aríete coberto',
  costResource:'land',cost:2,attackBlocked:true,
  moveOverrideMetres:10,defenseBonus:5},
 'wildfire-pots':{id:'wildfire-pots',label:'Fogo selvagem',
  costResource:'wealth',cost:5,attackBlocked:false,
  orderDifficulty:3,singleUse:true},
 'boiling-water':{id:'boiling-water',label:'Água fervente',
  costResource:'wealth',cost:0.5,attackBlocked:false,singleUse:true},
 'boiling-oil':{id:'boiling-oil',label:'Óleo fervente',
  costResource:'wealth',cost:0.5,attackBlocked:false,singleUse:true},
};
function selected(unit:WarUnit):WarFieldEquipmentProfile|undefined{
 return unit.fieldEquipment&&!unit.fieldEquipmentConsumed?
  WAR_FIELD_EQUIPMENT[unit.fieldEquipment]:undefined;
}
export function warFieldDefenseBonus(unit:WarUnit,ranged:boolean):number{
 const equipment=selected(unit);
 return (equipment?.defenseBonus??0)+(ranged?(equipment?.rangedDefenseBonus??0):0);
}
export function warFieldMovementMetres(unit:WarUnit,base:number):number{
 const equipment=selected(unit);
 if(!equipment)return base;
 return Math.max(0,equipment.moveOverrideMetres??(
  base-(equipment.movePenaltyMetres??0)));
}
export function warFieldOrderDifficulty(unit:WarUnit):number{
 return selected(unit)?.orderDifficulty??0;
}
export function warFieldForbidsAttack(unit:WarUnit):boolean{
 return unit.fieldEquipment==='ladders'&&unit.laddersDeployed?false:
  selected(unit)?.attackBlocked??false;
}
export function warFieldCanClimbWithoutPenalty(unit:WarUnit):boolean{
 return selected(unit)?.id==='ladders'||selected(unit)?.id==='siege-tower';
}
export function warFieldThrowDamage(unit:WarUnit):Readonly<{
 damage:number;wildfire:boolean;
}>{
 const equipment=selected(unit);
 if(!equipment||!['wildfire-pots','boiling-water','boiling-oil'].includes(equipment.id))
  throw new Error('Esta unidade não possui munição especial disponível.');
 return {damage:equipment.id==='wildfire-pots'?7:
  equipment.id==='boiling-oil'?10:5,
  wildfire:equipment.id==='wildfire-pots'};
}
export function validateWarFieldEquipment(unit:WarUnit):void{
 if(!unit.fieldEquipment)return;
 const profile=WAR_FIELD_EQUIPMENT[unit.fieldEquipment];
 if(!profile)throw new Error('Equipamento especial militar desconhecido.');
 if((unit.mounted||unit.naval)&&
  ['ram','covered-ram','tortoise','siege-tower','ladders'].includes(profile.id))
  throw new Error('Cavalaria/navios não podem receber esse equipamento especial.');
}
