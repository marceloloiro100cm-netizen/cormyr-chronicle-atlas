import {unitStats} from '@/lib/house/engine';
import {UNIT_EQUIPMENT} from '@/lib/house/equipment';
import {unitMilitaryBonuses} from '@/lib/house/military-bonuses';
import type {HouseState,Unit,Skill} from '@/lib/house/types';
import type {WarPosition,WarSide,WarUnit,WarRange} from './types';

const FORMULAE:Record<string,'agility'|'athletics'|'animalHandling'>={
 'Atletismo':'athletics','Agilidade':'agility','Lidar com animais':'animalHandling',
};
/** Calcula dano da Tabela 10-1/10-2 sem converter o perfil para HP por soldado de PTE. */
export function resolveEquipmentDamage(expression:string,ability:WarUnit['ability']):number{
 const value=expression.replace(/[–−]/g,'-').split(' · ')[0]!.trim();
 const match=/^(Atletismo|Agilidade|Lidar com animais)\s*([+-]\s*\d+)?$/.exec(value);
 if(!match)throw new Error('Fórmula de equipamento não reconhecida: '+value);
 const skill=FORMULAE[match[1]!];
 if(!skill)throw new Error('Habilidade de dano não reconhecida.');
 return Math.max(0,ability[skill]+Number((match[2]??'0').replace(/\s/g,'')));
}
export function snapshotOfficialWarUnit(
 state:HouseState,unit:Unit,input:{
 side:WarSide;position:WarPosition;version:number;
 typeId?:string;rangeOverride?:'short'|'long';
 },
):WarUnit{
 if(unit.destroyed||unit.strength-unit.casualties<=0)throw new Error('Unidade oficial indisponível.');
 if(!Number.isInteger(input.version)||input.version<0)throw new Error('Versão de origem inválida.');
 const typeId=input.typeId??unit.equipmentTypeId??unit.types[0];
 if(!typeId||!unit.types.includes(typeId))throw new Error('Equipamento deve corresponder a um tipo cadastrado.');
 if(unit.types.length>1&&!input.typeId)throw new Error('Unidade mista exige escolha explícita do equipamento.');
 const row=UNIT_EQUIPMENT.find(e=>e.id===typeId);
 if(!row)throw new Error('Equipamento não cadastrado no livro.');
 const stats=unitStats(unit,state),bonuses=unitMilitaryBonuses(state,unit);
 const skill=(s:Skill)=>unit.skills[s]+(bonuses.skillBonuses[s]??0);
 const mounted=unit.types.includes('cavalry')&&unit.mounted!==false;
 const ability={
  agility:skill('agility'),athletics:mounted&&unit.mount?unit.mount.athletics:skill('athletics'),
  awareness:skill('awareness'),
  endurance:mounted&&unit.mount?unit.mount.endurance:skill('endurance'),
  fighting:skill('fighting'),marksmanship:skill('marksmanship'),
  animalHandling:skill('animalHandling'),warfare:skill('warfare'),
 };
 const melee=row[unit.equipment.includes('fighting')?'improved':'initial'];
 const marks=row[unit.equipment.includes('marksmanship')?'improved':'initial'];
 let range:WarRange='none';
 if(marks.marksmanship!=='—'){
  if(marks.marksmanship.includes('longo'))range='long';
  else if(marks.marksmanship.includes('curto'))range='short';
  else if(input.rangeOverride)range=input.rangeOverride;
  else throw new Error('Alcance variável exige decisão explícita do Narrador.');
 }
 const training=unit.training;
 if(!['green','trained','veteran','elite'].includes(training))throw new Error('Treinamento oficial inválido.');
 return {
  id:'official-'+state.houseId+'-'+unit.id,name:unit.name,
  side:input.side,typeId,position:{...input.position},
  training:training as WarUnit['training'],ability,
  defense:stats.defense,discipline:stats.discipline,armor:stats.armorRating,bulk:unit.bulk??row.initial.bulk,
  meleeDamage:resolveEquipmentDamage(melee.fighting,ability)+bonuses.fightingDamage,
  rangedDamage:range==='none'?0:resolveEquipmentDamage(marks.marksmanship,ability)+bonuses.marksmanshipDamage,
  range,mounted,naval:unit.types.includes('warships'),
  meleeBonusDice:bonuses.meleeBonusDice,rangedBonusDice:0,
  maxHealth:stats.maxHealth,health:stats.health,condition:'organized',disorganizations:0,
  standing:null,activated:false,defendRoll:null,
  issuedThisRound:0,actedThisRound:false,criticalThisRound:false,
  source:{kind:'house-readonly',houseId:state.houseId,unitId:unit.id,version:input.version},
 };
}
