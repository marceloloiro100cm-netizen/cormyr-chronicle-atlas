import {UNIT_EQUIPMENT} from '@/lib/house/equipment';
import {TRAINING,UNIT_TYPES} from '@/lib/house/engine';
import {resolveEquipmentDamage} from './official-adapter';
import type {WarCommander,WarPosition,WarSide,WarUnit,WarRange} from './types';

/** All seventeen table 10-1 unit categories, for synthetic war scenarios. */
export const WAR_MODEL_UNIT_TYPES=[
 {id:'support',label:'Apoio'},
 {id:'archers',label:'Arqueiros'},
 {id:'scouts',label:'Batedores'},
 {id:'cavalry',label:'Cavalaria'},
 {id:'criminals',label:'Criminosos'},
 {id:'crusaders',label:'Cruzados'},
 {id:'engineers',label:'Engenheiros'},
 {id:'special',label:'Especial'},
 {id:'personal-guard',label:'Guarda Pessoal'},
 {id:'garrison',label:'Guarnição'},
 {id:'guerrillas',label:'Guerrilheiros'},
 {id:'infantry',label:'Infantaria'},
 {id:'sailors',label:'Marinheiros'},
 {id:'mercenaries',label:'Mercenários'},
 {id:'warships',label:'Navios de Guerra'},
 {id:'levies',label:'Plebeus Recrutados'},
 {id:'raiders',label:'Saqueadores'},
] as const;
export type WarModelUnitTypeId=typeof WAR_MODEL_UNIT_TYPES[number]['id'];

export function modelWarUnit(input:{
 id:string;name:string;side:WarSide;position:WarPosition;
 typeId:WarModelUnitTypeId;
 training?:WarUnit['training'];
}):WarUnit{
 const type=UNIT_TYPES.find(x=>x.id===input.typeId);
 const equip=UNIT_EQUIPMENT.find(x=>x.id===input.typeId)?.initial;
 if(!type||!equip)throw new Error('Tipo de tropa-modelo ausente das tabelas militares.');
 const training=input.training??'trained';
 const skills={
  agility:['archers','scouts','guerrillas','cavalry'].includes(input.typeId)?3:2,
  athletics:2,
  awareness:['scouts','personal-guard','garrison'].includes(input.typeId)?3:2,
  endurance:3,
  fighting:['infantry','garrison','crusaders','personal-guard',
   'mercenaries','raiders','sailors'].includes(input.typeId)?3:2,
  marksmanship:['archers','scouts','guerrillas','warships'].includes(input.typeId)?3:2,
  animalHandling:input.typeId==='cavalry'?3:2,
  warfare:input.typeId==='engineers'?3:2,
 };
 const mounted=input.typeId==='cavalry';
 const naval=input.typeId==='warships';
 const discipline=Math.max(0,TRAINING[training].discipline+type.discipline);
 const range:WarRange=equip.marksmanship==='—'?'none':equip.marksmanship.includes('longo')?'long':'short';
 return {
  id:input.id,name:input.name,side:input.side,position:{...input.position},typeId:input.typeId,
  training,ability:skills,defense:skills.agility+skills.athletics+skills.awareness-equip.penalty,
  discipline,armor:equip.armor,bulk:equip.bulk,
  meleeDamage:resolveEquipmentDamage(equip.fighting,skills),
  rangedDamage:range==='none'?0:resolveEquipmentDamage(equip.marksmanship,skills),
  range,mounted,naval,
  meleeBonusDice:0,rangedBonusDice:0,
  maxHealth:9,health:9,condition:'organized',disorganizations:0,
  standing:null,activated:false,defendRoll:null,
  issuedThisRound:0,actedThisRound:false,criticalThisRound:false,
  source:{kind:'model'},
 };
}
export function modelWarCommanders(input:{attacker:number;defender:number}):WarCommander[]{
 return [
  {id:'leader-attacker',name:'Comandante atacante',side:'attacker',role:'commander',
   warfare:input.attacker,strategy:0,status:3,active:true},
  {id:'leader-defender',name:'Comandante defensor',side:'defender',role:'commander',
   warfare:input.defender,strategy:0,status:3,active:true},
 ];
}
