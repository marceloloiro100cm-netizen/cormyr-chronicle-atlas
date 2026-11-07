import type {WarUnit} from './types';

/** Chapter 10 specialist equipment. The requisition cost is informational:
 * battle snapshots never debit a House's Land or Wealth resources.
 */
export type WarSpecialGear='mantlet'|'tortoise'|'ladders'|'ram'|
 'covered-ram'|'siege-tower'|'boiling-water'|'boiling-oil'|'wildfire';
export type WarSpecialProfile=Readonly<{
 id:WarSpecialGear;label:string;resource:'land'|'wealth';cost:number;
 defenseMelee:number;defenseRanged:number;
 movementPenaltyMetres:number;movementCapMetres?:number;
 cannotAttack:boolean;restrictedToFoot:boolean;
}>;
const make=(id:WarSpecialGear,label:string,resource:'land'|'wealth',cost:number,
 defenseMelee=0,defenseRanged=0,movementPenaltyMetres=0,
 movementCapMetres?:number,cannotAttack=false,restrictedToFoot=true
):WarSpecialProfile=>({
 id,label,resource,cost,defenseMelee,defenseRanged,movementPenaltyMetres,
 ...(movementCapMetres!==undefined?{movementCapMetres}:{}),
 cannotAttack,restrictedToFoot,
});
export const WAR_SPECIAL_GEAR:Readonly<Record<WarSpecialGear,WarSpecialProfile>>={
 mantlet:make('mantlet','Manteletes','wealth',1,0,5,10),
 tortoise:make('tortoise','Tartaruga de cerco','wealth',1,10,10,0,10,true),
 ladders:make('ladders','Escadas, cordas e arpéus','wealth',0.5,0,0,0,undefined,true),
 ram:make('ram','Aríete comum','land',1,0,0,0,undefined,true),
 'covered-ram':make('covered-ram','Aríete coberto','land',2,5,5,0,10,true),
 'siege-tower':make('siege-tower','Torre de cerco','wealth',2,5,5,0,10,true),
 'boiling-water':make('boiling-water','Água fervente (uso único)','wealth',0.5),
 'boiling-oil':make('boiling-oil','Óleo fervente (uso único)','wealth',0.5),
 wildfire:make('wildfire','Fogo selvagem (uso único)','wealth',5),
};
export function equipWarSpecialGear(unit:WarUnit,gear:WarSpecialGear|null):WarUnit{
 if(gear===null)return {...unit,specialGear:undefined,
  specialGearUsed:false,laddersDeployed:false};
 const p=WAR_SPECIAL_GEAR[gear];
 if(p.restrictedToFoot&&(unit.mounted||unit.naval))
  throw new Error('Este equipamento especial exige unidade a pé.');
 return {...unit,specialGear:gear,specialGearUsed:false,laddersDeployed:false};
}
export function specialGearDefense(unit:WarUnit,ranged:boolean):number{
 const p=unit.specialGear?WAR_SPECIAL_GEAR[unit.specialGear]:null;
 if(!p||unit.specialGearUsed)return 0;
 return ranged?p.defenseRanged:p.defenseMelee;
}
export function specialGearMovement(unit:WarUnit,metres:number):number{
 const p=unit.specialGear?WAR_SPECIAL_GEAR[unit.specialGear]:null;
 if(!p||unit.specialGearUsed)return metres;
 const penalized=Math.max(0,metres-p.movementPenaltyMetres);
 return Math.min(penalized,p.movementCapMetres??Infinity);
}
export function specialGearBlocksAttack(unit:WarUnit):boolean{
 if(unit.specialGearUsed)return false;
 if(unit.specialGear==='ladders'&&unit.laddersDeployed)return false;
 return unit.specialGear?WAR_SPECIAL_GEAR[unit.specialGear].cannotAttack:false;
}
