import { TRAINING, UNIT_TYPES, unitStats } from './engine';
import { SKILLS, EXTRA_UNIT_SKILLS, type HouseState, type Unit, type UnitSkill, type ExtraUnitSkills } from './types';

export const XP_PER_RANK=20;
const level=(unit:Unit)=>TRAINING[unit.training as keyof typeof TRAINING];
export function spentUnitXp(unit:Unit){return unitStats(unit).xpSpent;}
/** Existing sheets store unspent XP only, not a lifetime award ledger.
 * Normalize lazily: preserve their current XP exactly instead of giving training points twice. */
export function unitXpSummary(unit:Unit){
 const spent=spentUnitXp(unit),training=level(unit);
 if(!training)throw new Error('Treinamento inválido.');
 const bonus=unit.bonusXp??(unit.xp+spent-training.xp-(unit.bonusRanks??0)*XP_PER_RANK);
 const total=training.xp+(unit.bonusRanks??0)*XP_PER_RANK+bonus;
 return {training:training.xp,bonus,total,spent,available:Math.max(0,total-spent),deficit:Math.max(0,spent-total)};
}
export function syncUnitXp(unit:Unit){
 const summary=unitXpSummary(unit);
 unit.bonusXp=summary.bonus;
 unit.xp=summary.total-summary.spent;
 return summary;
}
export function unitAllowedSkills(unit:Unit):Set<UnitSkill>{
 const skills=unit.mixedRule?.allowedSkills??[
  ...unit.types.flatMap(id=>UNIT_TYPES.find(x=>x.id===id)?.skills??[]),
  ...(unit.types.includes('special')?EXTRA_UNIT_SKILLS:[])
 ];
 return new Set(skills as UnitSkill[]);
}
export function validateUnitSkills(unit:Unit,skills:Unit['skills'],extraSkills:ExtraUnitSkills={}){
 const allowed=unitAllowedSkills(unit);
 for(const s of SKILLS){
  const value=skills[s];
  if(!Number.isInteger(value)||value<2||value>12)throw new Error('Graduação inválida em '+s+'.');
  // Legacy imports with unavailable specializations may be reduced, never raised.
  if(value>2&&!allowed.has(s)&&value>(unit.skills[s]??2))throw new Error('Habilidade não permitida para este tipo de unidade.');
 }
 for(const s of EXTRA_UNIT_SKILLS){
  const value=extraSkills[s]??2,original=unit.extraSkills?.[s]??2;
  if(!Number.isInteger(value)||value<2||value>12)throw new Error('Graduação inválida em '+s+'.');
  if(value>2&&!allowed.has(s)&&value>original)throw new Error('Habilidade não permitida para este tipo de unidade.');
 }
 if(unit.types.includes('special')&&SKILLS.filter(s=>skills[s]>2).length+EXTRA_UNIT_SKILLS.filter(s=>(extraSkills[s]??2)>2).length>3)
  throw new Error('Unidade especial escolhe no máximo três habilidades.');
}
export function editUnitProfile(state:HouseState,input:{unitId:string;name:string;origin:string;notes:string;skills:Unit['skills'];extraSkills?:ExtraUnitSkills|undefined;situation:string;mount?:Unit['mount']}):HouseState{
 const next=structuredClone(state),u=next.units.find(x=>x.id===input.unitId&&!x.destroyed);
 if(!u)throw new Error('Unidade indisponível.');
 if(!input.name.trim()||input.name.length>160||input.origin.length>160||input.notes.length>4000||input.situation.length>1000)
  throw new Error('Campos de unidade inválidos.');
 const nextExtra=input.extraSkills??u.extraSkills??{};
 validateUnitSkills(u,input.skills,nextExtra);
 const old=unitXpSummary(u),newSpent=SKILLS.reduce((sum,s)=>sum+Math.max(0,input.skills[s]-2)*XP_PER_RANK,0)+
   EXTRA_UNIT_SKILLS.reduce((sum,s)=>sum+Math.max(0,(nextExtra[s]??2)-2)*XP_PER_RANK,0);
 if(newSpent>old.total&&newSpent>=old.spent)throw new Error('XP insuficiente; reduza atributos antes de novas melhorias.');
 if(u.types.includes('cavalry')){
  if(!input.mount||!input.mount.name.trim()||!input.mount.source.trim()||
   ![input.mount.athletics,input.mount.endurance].every(v=>Number.isInteger(v)&&v>=1&&v<=12))throw new Error('Montaria exige nome, origem e atributos válidos.');
  u.mount=input.mount;
 }
 u.name=input.name.trim();u.origin=input.origin.trim();u.notes=input.notes.trim();u.situation=input.situation.trim();
 u.bonusXp=old.bonus;u.skills=input.skills;u.extraSkills=nextExtra;u.xp=old.total-newSpent;
 u.health=Math.min(u.health,unitStats(u).maxHealth);
 return next;
}
export function grantUnitXp(state:HouseState,input:{unitId:string;amount:number;reason:string}):HouseState{
 if(!Number.isInteger(input.amount)||input.amount<1||input.amount>1000)throw new Error('Conceda de 1 a 1000 XP por lançamento.');
 if(input.reason.trim().length<10)throw new Error('Justifique o XP concedido (mínimo de 10 caracteres).');
 const next=structuredClone(state),u=next.units.find(x=>x.id===input.unitId&&!x.destroyed);
 if(!u)throw new Error('Unidade indisponível.');
 const old=syncUnitXp(u);
 u.bonusXp=old.bonus+input.amount;
 u.xp=old.total+input.amount-old.spent;
 u.xpEvents??=[];u.xpEvents.push({id:crypto.randomUUID(),month:state.month,delta:input.amount,reason:input.reason.trim(),kind:'award'});
 return next;
}
export function changeUnitTrainingXp(unit:Unit,target:keyof typeof TRAINING,month:number,reason:string){
 const previous=level(unit);if(!previous)throw new Error('Treinamento anterior inválido.');
 const old=syncUnitXp(unit),next=TRAINING[target],delta=next.xp-previous.xp;
 unit.training=target;unit.xp=old.total+delta-old.spent;
 unit.xpEvents??=[];unit.xpEvents.push({id:crypto.randomUUID(),month,delta,reason,kind:'training'});
 return delta;
}
export const MILITARY_HOLDINGS=[
 'pros-master-of-arms','pros-master-of-arms--field-master','pros-master-of-arms--prepared-for-siege',
 'pros-military-academy','pros-military-academy--broad-training','pros-military-academy--core-training',
 'pros-bailiffs--military-training','pros-abbey--warrior-brotherhood','pros-bowyer-fletcher-or-weaponsmith'
];
export function renameMilitaryHolding(state:HouseState,input:{holdingId:string;name:string}):HouseState{
 const next=structuredClone(state),h=next.holdings.find(x=>x.id===input.holdingId&&x.status==='active');
 if(!h||!MILITARY_HOLDINGS.includes(h.itemId))throw new Error('Estrutura militar indisponível.');
 const name=input.name.trim();
 if(name.length<2||name.length>160)throw new Error('Informe nome entre 2 e 160 caracteres.');
 h.name=name;
 return next;
}
