import {AGE_RULES,type AgeGroup} from './creation';
import {CHARACTER_SKILL_IDS,type CharacterSkillId,type CharacterV2,CharacterV2Schema} from './schema';
import {getCharacterTraitRule} from './trait-rules';

export type AgeDefectRequirement=Readonly<{
 ageGroup:AgeGroup;totalMinimum:number;minimumSkillDefects:number;
 allowedSkillDefects:readonly CharacterSkillId[];source:string;
}>;
const OLD_SKILLS:readonly CharacterSkillId[]=[
 'agility','athletics','awareness','cunning','endurance','fighting','marksmanship',
];
/**
 * Cap. 3, tabela 3-11. Defeitos de idade não são concedidos, comprados
 * ou criados automaticamente por avançar o calendário.
 */
export const AGE_DEFECT_REQUIREMENTS:Record<AgeGroup,AgeDefectRequirement>={
 child:{ageGroup:'child',totalMinimum:0,minimumSkillDefects:0,allowedSkillDefects:[],source:'3-11'},
 adolescent:{ageGroup:'adolescent',totalMinimum:0,minimumSkillDefects:0,allowedSkillDefects:[],source:'3-11'},
 young:{ageGroup:'young',totalMinimum:0,minimumSkillDefects:0,allowedSkillDefects:[],source:'3-11'},
 adult:{ageGroup:'adult',totalMinimum:1,minimumSkillDefects:0,allowedSkillDefects:[],source:'3-11'},
 middle:{ageGroup:'middle',totalMinimum:1,minimumSkillDefects:1,
  allowedSkillDefects:['agility','athletics','endurance'],source:'3-11'},
 old:{ageGroup:'old',totalMinimum:2,minimumSkillDefects:1,allowedSkillDefects:OLD_SKILLS,source:'3-11'},
 veryOld:{ageGroup:'veryOld',totalMinimum:3,minimumSkillDefects:2,allowedSkillDefects:OLD_SKILLS,source:'3-11'},
 venerable:{ageGroup:'venerable',totalMinimum:4,minimumSkillDefects:3,allowedSkillDefects:OLD_SKILLS,source:'3-11'},
};
export type AgeDefectReview=Readonly<{
 ageGroup:AgeGroup;ageLabel:string;
 approvedFlaws:number;approvedRestrictedSkillFlaws:number;
 required:AgeDefectRequirement;
 missingTotal:number;missingRestricted:number;
 warnings:readonly string[];
 satisfied:boolean;
}>;
export function reviewCharacterAgeDefects(character:CharacterV2,ageGroup:AgeGroup):AgeDefectReview{
 const c=CharacterV2Schema.parse(character),required=AGE_DEFECT_REQUIREMENTS[ageGroup];
 if(!required)throw new Error('Faixa etária desconhecida.');
 const flaws=c.traits.filter(t=>t.status==='approved'&&
  getCharacterTraitRule(t.traitId)?.trait.kind==='flaw');
 const restricted=new Set<CharacterSkillId>(),warnings:string[]=[];
 for(const f of flaws){
  const rule=getCharacterTraitRule(f.traitId);
  if(rule?.trait.id!=='defeito-habilidade-parametrizada')continue;
  const s=f.params['skillId'];
  if(s&&CHARACTER_SKILL_IDS.some(id=>id===s)&&required.allowedSkillDefects.includes(s as CharacterSkillId))
   restricted.add(s as CharacterSkillId);
  else if(required.minimumSkillDefects>0)
   warnings.push('Defeito sem habilidade da lista obrigatória: '+(s??'não informada'));
 }
 const missingTotal=Math.max(0,required.totalMinimum-flaws.length);
 const missingRestricted=Math.max(0,required.minimumSkillDefects-restricted.size);
 if(missingTotal)warnings.push('Faltam '+missingTotal+' desvantagens exigidas pela idade.');
 if(missingRestricted)warnings.push('Faltam '+missingRestricted+' Defeitos de habilidades diferentes exigidos pela idade.');
 return{
  ageGroup,ageLabel:AGE_RULES[ageGroup].label,approvedFlaws:flaws.length,
  approvedRestrictedSkillFlaws:restricted.size,required,missingTotal,
  missingRestricted,warnings,satisfied:missingTotal===0&&missingRestricted===0,
 };
}
/**
 * Lote 09 — estados importados não têm base numérica segura; fornecer
 * apenas relatório de conciliação. Nunca derivar -D de strings livres.
 */
export type ConditionReview=Readonly<{
 sources:readonly {category:'injury'|'wound'|'condition';value:string}[];
 pending:readonly string[];
 mechanicalEffectsEnabled:false;
}>;
export function reviewCharacterConditions(character:CharacterV2):ConditionReview{
 const c=CharacterV2Schema.parse(character);
 const sources=[
  ...c.state.injuries.map(value=>({category:'injury' as const,value})),
  ...c.state.wounds.map(value=>({category:'wound' as const,value})),
  ...c.state.conditions.map(value=>({category:'condition' as const,value})),
 ];
 return{
  sources,
  pending:sources.map(x=>
   x.category+': '+x.value+' — exige evento tipado, data, duração e regra homologada.'),
  mechanicalEffectsEnabled:false,
 };
}
