import {unitStats} from '@/lib/house/engine';
import {unitMilitaryBonuses} from '@/lib/house/military-bonuses';
import type {HouseState,Unit,Skill} from '@/lib/house/types';
import {tacticalProfile,TRAINING_BONUS} from '../domain/profiles-v2';
import {officialAvailableCount,officialMovementHex,clamp} from '../domain/rulebook-v2';
import type {BattleStack,Hex,Side,Training} from '../domain/types';
export type ReadonlySourceInput=Readonly<{
 houseId:string;unitId:string;side:Side;position:Hex;
 primaryTypeId:string;profileDecisionReason?:string;capturedAt:string;sourceVersion:number;
}>;
/** Adaptador PURO — recebe uma cópia privada somente no servidor. Não importa mutadores oficiais. */
export function adaptOfficialUnit(state:HouseState,unit:Unit,input:ReadonlySourceInput):BattleStack{
 if(state.houseId!==input.houseId||unit.id!==input.unitId)throw new Error('Origem não corresponde à ficha consultada.');
 if(unit.destroyed)throw new Error('Unidade oficial destruída não pode ser copiada.');
 if(unit.types.length===0||unit.types.includes('warships'))throw new Error('Unidade naval indisponível para combate terrestre.');
 if(!unit.types.includes(input.primaryTypeId))throw new Error('Perfil escolhido não pertence à unidade.');
 const mixed=unit.types.length>1;
 if(mixed&&(!input.profileDecisionReason||input.profileDecisionReason.trim().length<12))
  throw new Error('Unidade mista exige escolha e justificativa do Narrador.');
 if(!Number.isInteger(input.sourceVersion)||input.sourceVersion<0)throw new Error('Versão de origem inválida.');
 const count=officialAvailableCount(unit.strength,unit.casualties);
 if(count<1||count>1000)throw new Error('Unidade sem efetivo válido para a arena.');
 const profile=tacticalProfile(input.primaryTypeId);
 const training=unit.training as Training,bonus=TRAINING_BONUS[training];
 if(bonus===undefined)throw new Error('Treinamento oficial não mapeado.');
 // Leia ambos da ÚNICA fonte autorizada, uma vez, sem somar os efeitos de defesa novamente.
 const stats=unitStats(unit,state);
 const benefits=unitMilitaryBonuses(state,unit);
 const skill:Skill=profile.rangeHex>1?'marksmanship':'fighting';
 const rawSkill=unit.skills[skill];
 const effectiveSkill=Math.max(2,(Number.isFinite(rawSkill)?rawSkill:2)+(benefits.skillBonuses[skill]??0));
 const attack=clamp(profile.attackBase+bonus+Math.floor((effectiveSkill-2)/2),0,15);
 const defense=clamp(profile.defenseBase+bonus+Math.floor((stats.defense-6)/3),0,15);
 const armor=clamp(stats.armorRating,0,10);
 const mapped=new Set(benefits.entries.filter(e=>e.kind==='combat'&&
  /Defesa de fortificação|Defesa em fortificação|Absorção de Armadura|Habilidade /.test(e.description))
  .map(e=>e.holdingId));
 const unmapped=[...benefits.entries.filter(e=>!mapped.has(e.holdingId)),
  ...benefits.conditional];
 const warnings:string[]=[];
 if(stats.health<stats.maxHealth)warnings.push('Saúde oficial parcial: '+stats.health+' / '+stats.maxHealth+'; PV táticos começam completos.');
 if(!Number.isFinite(rawSkill)||rawSkill<2)warnings.push('Habilidade '+skill+' ausente/inferior a 2; usado mínimo de 2.');
 for(const row of unmapped){
  const description=row.source+' · '+row.description;
  warnings.push('Efeito oficial não mapeado para PTE-2.0: '+description);
 }
 if(benefits.fightingDamage||benefits.marksmanshipDamage||benefits.meleeBonusDice||
  benefits.trackingBonusDice||benefits.warshipCasualtyMitigation)
  warnings.push('Dano/dados/mitigação do livro não se convertem automaticamente.');
 if(unit.commanderName||unit.commanderId)warnings.push('Comandante registrado como metadado; nenhum bônus tático automático.');
 const stack:BattleStack={
  id:'import-'+unit.id,side:input.side,name:unit.name,primaryTypeId:profile.id,
  originalTypeIds:[...unit.types],training,source:{
   kind:'house-readonly',houseId:input.houseId,unitId:unit.id,sourceVersion:input.sourceVersion,
   sourceCapturedAt:input.capturedAt,officialHealth:stats.health,officialMaxHealth:stats.maxHealth,
   warnings:warnings.slice(0,35),
  },initialCount:count,currentHp:count*profile.hpPerSoldier,
  hpPerSoldier:profile.hpPerSoldier,damagePerSoldier:profile.damagePerSoldier,
  attack,defense,armor,movementHex:officialMovementHex(stats.movement),
  rangeHex:profile.rangeHex,moraleTypeModifier:profile.moraleModifier,
  moraleState:'steady',position:input.position,
  movedThisActivation:false,attackedThisActivation:false,waitedThisRound:false,
  defenseGuard:false,retaliationUsedRound:null,profileDecisionReason:input.profileDecisionReason?.trim(),
  appliedEffectIds:[...mapped].sort(),
 };
 return stack;
}
