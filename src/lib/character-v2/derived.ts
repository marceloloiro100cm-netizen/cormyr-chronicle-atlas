import {CharacterV2Schema,type CharacterSkillId,type CharacterV2} from './schema';
import {normalizeSpecialty} from './creation';

/**
 * Lote 05 — resolver puro e determinístico.
 * Regra básica: cap. 3 Passo 8; movimento cap. 9 e tabela 9-1.
 * Nenhuma entrada de catálogo (incluindo Rápido/Manco/Defeito) é aplicada aqui:
 * somente regras homologadas nos lotes 07–10 podem gerar modificadores.
 */
export const CHARACTER_DERIVED_VERSION='got-basic-pt-derived-2026-11-01-v1';
export type DerivedKey='combatDefense'|'intrigueDefense'|'maxHealth'|'maxComposure'|
 'movement'|'running'|'armorRating';
export type DerivationLine=Readonly<{
 sourceId:string;description:string;amount:number;
 kind:'rank'|'specialty'|'equipment'|'condition'|'rule'|'cap';
}>;
export type DerivedNode=Readonly<{
 key:DerivedKey;value:number;formula:string;
 dependsOn:readonly string[];lines:readonly DerivationLine[];
}>;
export type MechanicalModifier=Readonly<{
 /** Apenas eventos de regras explicitamente aprovados; validação no servidor será lote 11. */
 sourceId:string;description:string;target:DerivedKey;amount:number;
 approved:boolean;active:boolean;
 stackKey:string|null;
 kind:'equipment'|'condition'|'rule';
}>;
export type CharacterEquipmentSnapshot=Readonly<{
 verified:boolean;
 sourceId:string;armorRating:number;armorPenalty:number;
 shieldDefense:number;bulk:number;defensiveWeaponBonus:number;
}>;
export type DerivedContext=Readonly<{
 equipment?:CharacterEquipmentSnapshot|undefined;
 modifiers?:readonly MechanicalModifier[]|undefined;
}>;
export type CharacterDerived=Readonly<{
 version:typeof CHARACTER_DERIVED_VERSION;
 nodes:Readonly<Record<DerivedKey,DerivedNode>>;
 order:readonly DerivedKey[];
 values:Readonly<Record<DerivedKey,number>>;
 healthCurrent:number;composureCurrent:number;
 warnings:readonly string[];
}>;
const ORDER:readonly DerivedKey[]=[
 'armorRating','combatDefense','intrigueDefense','maxHealth','maxComposure','movement','running',
];
const rank=(c:CharacterV2,id:CharacterSkillId)=>c.skillRanks[id];
const line=(sourceId:string,description:string,amount:number,kind:DerivationLine['kind']):DerivationLine=>
 ({sourceId,description,amount,kind});
const eqDefault:CharacterEquipmentSnapshot={
 verified:false,sourceId:'none',armorRating:0,armorPenalty:0,
 shieldDefense:0,bulk:0,defensiveWeaponBonus:0,
};
function assertPositiveInt(value:number,max:number,name:string){
 if(!Number.isInteger(value)||value<0||value>max)throw new Error(name+' inválido.');
}
/** Resolve modificadores distintos por stackKey, sem mutar fontes nem duplicar efeitos. */
function activeModifiers(
 target:DerivedKey,ctx:DerivedContext,warnings:string[]
):DerivationLine[]{
 const selected=new Set<string>(),lines:DerivationLine[]=[];
 for(const mod of ctx.modifiers??[]){
  if(mod.target!==target||!mod.active)continue;
  if(!mod.approved){warnings.push('Efeito não aprovado ignorado: '+mod.sourceId);continue;}
  if(!mod.sourceId||!mod.description||!Number.isInteger(mod.amount)||
    Math.abs(mod.amount)>50)throw new Error('Modificador mecânico inválido.');
  const key=mod.stackKey??mod.sourceId+':'+target;
  if(selected.has(key)){warnings.push('Bônus duplicado ignorado: '+key);continue;}
  selected.add(key);lines.push(line(mod.sourceId,mod.description,mod.amount,mod.kind));
 }
 return lines;
}
export function resolveCharacterDerived(character:CharacterV2,ctx:DerivedContext={}):CharacterDerived{
 const valid=CharacterV2Schema.parse(character);
 const warnings:string[]=[],values={} as Record<DerivedKey,number>;
 const nodes={} as Record<DerivedKey,DerivedNode>;
 const eq=ctx.equipment?.verified?ctx.equipment:eqDefault;
 if(ctx.equipment&&!ctx.equipment.verified)warnings.push('Equipamento não conferido não altera atributos.');
 for(const field of ['armorRating','armorPenalty','shieldDefense','bulk','defensiveWeaponBonus'] as const)
  assertPositiveInt(eq[field],200,'Equipamento '+field);
 const add=(key:DerivedKey,formula:string,dependsOn:string[],rawLines:DerivationLine[],
  clamp:{min?:number;max?:number}={})=>{
  const numeric=rawLines.reduce((acc,x)=>acc+x.amount,0);
  const min=clamp.min??Number.NEGATIVE_INFINITY,max=clamp.max??Number.POSITIVE_INFINITY;
  const value=Math.min(max,Math.max(min,numeric));
  const lines=value===numeric?rawLines:[
   ...rawLines,line('bound:'+key,'Limite legal da estatística',value-numeric,'cap')];
  values[key]=value;nodes[key]={key,value,formula,dependsOn,lines};
 };
 const equipment=(key:string,description:string,value:number)=>
  line(eq.sourceId+':'+key,description,value,'equipment');
 add('armorRating','VA da armadura equipada', ['equipment.armorRating'],[
  equipment('armor','Armadura homologada',eq.armorRating),
  ...activeModifiers('armorRating',ctx,warnings)],{min:0});
 add('combatDefense','Agilidade + Atletismo + Percepção + defesas − penalidade da armadura',
  ['skill.agility','skill.athletics','skill.awareness','equipment.shieldDefense','equipment.armorPenalty'],[
   line('skill.agility','Agilidade',rank(valid,'agility'),'rank'),
   line('skill.athletics','Atletismo',rank(valid,'athletics'),'rank'),
   line('skill.awareness','Percepção',rank(valid,'awareness'),'rank'),
   equipment('shieldDefense','Escudo / defesa',eq.shieldDefense),
   equipment('defensiveWeaponBonus','Arma defensiva',eq.defensiveWeaponBonus),
   equipment('armorPenalty','Penalidade de armadura',-eq.armorPenalty),
   ...activeModifiers('combatDefense',ctx,warnings)],{min:0});
 add('intrigueDefense','Astúcia + Percepção + Status',
  ['skill.cunning','skill.awareness','skill.status'],[
   line('skill.cunning','Astúcia',rank(valid,'cunning'),'rank'),
   line('skill.awareness','Percepção',rank(valid,'awareness'),'rank'),
   line('skill.status','Status',rank(valid,'status'),'rank'),
   ...activeModifiers('intrigueDefense',ctx,warnings)],{min:0});
 add('maxHealth','3 × Vigor',['skill.endurance'],[
  line('skill.endurance','Três vezes Vigor',3*rank(valid,'endurance'),'rank'),
  ...activeModifiers('maxHealth',ctx,warnings)],{min:0});
 add('maxComposure','3 × Vontade',['skill.will'],[
  line('skill.will','Três vezes Vontade',3*rank(valid,'will'),'rank'),
  ...activeModifiers('maxComposure',ctx,warnings)],{min:0});
 const runningBonus=valid.specialties
  .filter(s=>s.verified&&s.skillId==='athletics'&&normalizeSpecialty(s.specialtyId)==='correr')
  .reduce((n,s)=>n+s.bonusDice,0);
 // Quem usa graduações não confirmadas recebe aviso, mas não ganha bônus.
 if(valid.specialties.some(s=>!s.verified&&s.skillId==='athletics'&&normalizeSpecialty(s.specialtyId)==='correr'))
  warnings.push('Correr não homologado não altera Movimento.');
 if(runningBonus>rank(valid,'athletics'))throw new Error('Correr B excede Atletismo.');
 const moveBonus=Math.floor(runningBonus/2);
 const bulkMovement=Math.floor(eq.bulk/2);
 const moveLines=[
  line('rule.movement','Movimento base',4,'rule'),
  line('specialty.correr','+1 m a cada 2B de Correr',moveBonus,'specialty'),
  equipment('bulkMovement','−1 m a cada 2 de Volume',-bulkMovement),
  ...activeModifiers('movement',ctx,warnings),
 ];
 add('movement','4 + floor(Correr B / 2) − floor(Volume / 2) + modificadores',
  ['specialty.correr','equipment.bulk'],moveLines,{min:0});
 add('running','4 × Movimento − Volume + modificadores',
  ['derived.movement','equipment.bulk'],[
   line('derived.movement','Quatro vezes Movimento',4*values.movement,'rule'),
   equipment('bulkRunning','Redução adicional por Volume',-eq.bulk),
   ...activeModifiers('running',ctx,warnings)],{min:0});
 const current=(value:number|null,max:number,name:string)=>{
  if(value===null)return max;
  if(value>max)warnings.push(name+' atual excede o máximo; exibição limitada sem alterar o registro.');
  return Math.max(0,Math.min(max,value));
 };
 return {version:CHARACTER_DERIVED_VERSION,order:ORDER,nodes,values,
  healthCurrent:current(valid.state.healthCurrent,values.maxHealth,'Saúde'),
  composureCurrent:current(valid.state.composureCurrent,values.maxComposure,'Compostura'),
  warnings};
}
