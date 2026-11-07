import type {WarPosition,WarSide} from './types';

/** Equipamentos do capítulo 10, pp. 228–230. Munição especial não é importada automaticamente. */
export type WarSiegeKind='catapult-small'|'catapult-medium'|'catapult-large'|
 'fire-pot'|'scorpion'|'mangonel'|'trebuchet';
export type WarSiegeAmmo='stone'|'oil';
export type WarSiegeProfile=Readonly<{
 kind:WarSiegeKind;label:string;rangeMetres:number;movementMetres:number;
 maxHealth:number;armor:number;damage:number;ignoreArmor:boolean;
 engineerPenaltyDice:number;wealth:number;
}>;
export const WAR_SIEGE_CATALOG:Readonly<Record<WarSiegeKind,WarSiegeProfile>>={
 'catapult-small':{kind:'catapult-small',label:'Catapulta pequena',
  rangeMetres:300,movementMetres:0,maxHealth:10,armor:5,damage:3,
  ignoreArmor:false,engineerPenaltyDice:0,wealth:1},
 'catapult-medium':{kind:'catapult-medium',label:'Catapulta média',
  rangeMetres:400,movementMetres:0,maxHealth:30,armor:5,damage:5,
  ignoreArmor:false,engineerPenaltyDice:0,wealth:2},
 'catapult-large':{kind:'catapult-large',label:'Catapulta grande',
  rangeMetres:500,movementMetres:0,maxHealth:40,armor:5,damage:7,
  ignoreArmor:false,engineerPenaltyDice:0,wealth:4},
 'fire-pot':{kind:'fire-pot',label:'Cospe-fogo',
  rangeMetres:200,movementMetres:10,maxHealth:20,armor:2,damage:3,
  ignoreArmor:true,engineerPenaltyDice:0,wealth:2},
 scorpion:{kind:'scorpion',label:'Escorpião',
  rangeMetres:500,movementMetres:10,maxHealth:10,armor:1,damage:3,
  ignoreArmor:true,engineerPenaltyDice:0,wealth:1},
 mangonel:{kind:'mangonel',label:'Manganela',
  rangeMetres:200,movementMetres:10,maxHealth:20,armor:3,damage:6,
  ignoreArmor:false,engineerPenaltyDice:1,wealth:3},
 trebuchet:{kind:'trebuchet',label:'Trabuco',
  rangeMetres:500,movementMetres:0,maxHealth:40,armor:4,damage:7,
  ignoreArmor:false,engineerPenaltyDice:0,wealth:4},
};
export type WarSiegeEngine=Readonly<{
 id:string;name:string;kind:WarSiegeKind;side:WarSide;position:WarPosition;
 engineerId:string;ammo:WarSiegeAmmo;health:number;lastFiredRound:number|null;
 source:Readonly<{kind:'model'|'house-readonly';houseId?:string}>;
}>;
export function makeModelSiege(input:{
 id:string;kind:WarSiegeKind;side:WarSide;position:WarPosition;
 engineerId:string;ammo?:WarSiegeAmmo;
}):WarSiegeEngine{
 const profile=WAR_SIEGE_CATALOG[input.kind];
 if(!profile||!input.id.trim()||!input.engineerId.trim())
  throw new Error('Máquina de cerco inválida.');
 if(input.ammo==='oil'&&!input.kind.startsWith('catapult'))
  throw new Error('Munição de óleo apenas para catapultas no modelo.');
 return {id:input.id,name:profile.label,kind:input.kind,side:input.side,
  position:{...input.position},engineerId:input.engineerId,ammo:input.ammo??'stone',
  health:profile.maxHealth,lastFiredRound:null,source:{kind:'model'}};
}
export function warSiegeDamage(engine:WarSiegeEngine):{base:number;ignoresArmor:boolean}{
 const profile=WAR_SIEGE_CATALOG[engine.kind];
 if(!profile)throw new Error('Máquina de cerco desconhecida.');
 return {base:profile.damage,ignoresArmor:profile.ignoreArmor||engine.ammo==='oil'};
}
