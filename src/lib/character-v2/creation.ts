import {
 CHARACTER_SKILL_IDS, CHARACTER_SKILL_LABELS, type CharacterSkillId,
 type CharacterV2,
} from './schema';

/**
 * Lote 04. Fontes: Guerra dos Tronos RPG, cap. 3 tabelas 3-8/3-9/3-10,
 * cap. 4 tabela 4-1. Compra inicial NÃO é a evolução após a criação.
 * Faixas etárias devem ser validadas pelo Narrador; datas canônicas vêm do Hub.
 */
export const AGE_GROUPS = [
 'child','adolescent','young','adult','middle','old','veryOld','venerable',
] as const;
export type AgeGroup=typeof AGE_GROUPS[number];
export type AgeRules=Readonly<{
 label:string;skillXp:number;specialtyXp:number;maxCreationSkill:number;
 initialDestiny:number|null;maxInitialBenefits:number|null;
}>;
export const AGE_RULES:Record<AgeGroup,AgeRules>={
 child:{label:'Criança',skillXp:120,specialtyXp:40,maxCreationSkill:4,initialDestiny:7,maxInitialBenefits:3},
 adolescent:{label:'Adolescente',skillXp:150,specialtyXp:40,maxCreationSkill:4,initialDestiny:6,maxInitialBenefits:3},
 young:{label:'Jovem',skillXp:180,specialtyXp:60,maxCreationSkill:5,initialDestiny:5,maxInitialBenefits:3},
 adult:{label:'Adulto',skillXp:210,specialtyXp:80,maxCreationSkill:7,initialDestiny:4,maxInitialBenefits:3},
 middle:{label:'Meia-idade',skillXp:240,specialtyXp:100,maxCreationSkill:6,initialDestiny:3,maxInitialBenefits:3},
 old:{label:'Velho',skillXp:270,specialtyXp:160,maxCreationSkill:5,initialDestiny:null,maxInitialBenefits:null},
 veryOld:{label:'Muito velho',skillXp:330,specialtyXp:200,maxCreationSkill:5,initialDestiny:null,maxInitialBenefits:null},
 venerable:{label:'Venerável',skillXp:360,specialtyXp:240,maxCreationSkill:5,initialDestiny:null,maxInitialBenefits:null},
};
/* Números de Destino da tabela 3-10 da fonte OCR só são claros até meia-idade.
 * Não presumir 2/1/0 para idades avançadas; dependem de conferência do livro.
 */
export const SKILL_CREATION_COST:Readonly<Record<1|2|3|4|5|6|7,number>>={
 1:-50,2:0,3:10,4:40,5:70,6:100,7:130,
};
export const SPECIALTY_BONUS_XP=10;

/** Lista aprovada quando verificada na Tabela 4-1; outras requerem confirmação.
 * Itens do jogo referenciados por catálogo recebem IDs canônicos e nunca se
 * tornam habilidades autônomas (especialmente 'Briga').
 */
const SPECIALTY_NAMES:Partial<Record<CharacterSkillId,readonly string[]>>={
 agility:['Acrobacia','Contorcionismo','Equilíbrio','Esquiva'],
 athletics:['Arremessar','Correr','Escalar','Força','Nadar','Saltar'],
 cunning:['Decifrar','Lógica','Memória'],
 knowledge:['Educação','Manha','Pesquisa'],
 healing:['Diagnóstico','Tratar Doença','Tratar Ferimento'],
 deception:['Atuar','Blefar','Disfarce','Trapacear'],
 stealth:['Esgueirar-se','Mesclar-se'],
 warfare:['Comandar','Estratégia','Tática'],
 thievery:['Arrombar','Furtar','Prestidigitação'],
 animalHandling:['Cavalgar','Conduzir','Encantar','Treinar'],
 fighting:['Armas de Contusão','Armas de Haste','Briga','Esgrima','Lâminas Curtas','Lâminas Longas','Lanças','Machados'],
 awareness:['Empatia','Notar'],
 persuasion:['Barganha','Charme','Convencer','Incitar','Intimidar','Provocar','Seduzir'],
 marksmanship:['Arcos','Armas Arremessadas','Bestas','Fundas'],
 survival:['Caçar','Coletar','Orientar-se','Rastrear'],
 status:['Administração','Criação','Reputação','Torneios'],
 endurance:['Resistência','Vitalidade'],
 will:['Coordenar','Coragem','Dedicação'],
};
export function normalizeSpecialty(value:string):string{
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
export const SPECIALTY_REGISTRY:Readonly<Record<CharacterSkillId,ReadonlyArray<{id:string;name:string}>>> =
 Object.fromEntries(CHARACTER_SKILL_IDS.map(id=>[id,(SPECIALTY_NAMES[id]??[]).map(name=>({
 id:normalizeSpecialty(name),name,
 }))])) as Record<CharacterSkillId,{id:string;name:string}[]>;

export function skillCreationCost(rank:number):number{
 if(!Number.isInteger(rank)||rank<1||rank>7)throw new Error('Graduação fora da tabela 3-8 da criação.');
 return SKILL_CREATION_COST[rank as keyof typeof SKILL_CREATION_COST];
}
export type CreationSpecialty={skillId:CharacterSkillId;specialtyId:string;bonusDice:number;verified:boolean};
export type CreationInput={
 ageGroup:AgeGroup;
 statusCap:number;
 skillRanks:Record<CharacterSkillId,number>;
 specialties:readonly CreationSpecialty[];
 benefitCount:number;
 /** Se houver faixas avançadas, exige decisão explícita de Destino. */
 narratorDestinyOverride?:{initialDestiny:number;maxInitialBenefits:number;reason:string}|undefined;
};
export type CreationBudget={
 ageGroup:AgeGroup;skillBudget:number;skillSpent:number;skillAvailable:number;
 specialtyBudget:number;specialtySpent:number;specialtyAvailable:number;
 initialDestiny:number|null;maxInitialBenefits:number|null;
 violations:string[];valid:boolean;skillBreakdown:{id:CharacterSkillId;label:string;rank:number;cost:number}[];
};
export function quoteCharacterCreation(input:CreationInput):CreationBudget{
 const rules=AGE_RULES[input.ageGroup],violations:string[]=[];
 if(!rules)throw new Error('Faixa etária desconhecida.');
 if(!Number.isInteger(input.statusCap)||input.statusCap<1||input.statusCap>10)
  throw new Error('Limite de Status inválido.');
 if(!Number.isInteger(input.benefitCount)||input.benefitCount<0)
  throw new Error('Quantidade de benefícios inválida.');
 const skillBreakdown=CHARACTER_SKILL_IDS.map(id=>{
  const rank=input.skillRanks[id];
  const valid=Number.isInteger(rank)&&rank>=1&&rank<=7;
  if(!valid)violations.push(CHARACTER_SKILL_LABELS[id]+': graduação fora da tabela de criação.');
  if(valid&&id!=='status'&&rank>rules.maxCreationSkill)
   violations.push(CHARACTER_SKILL_LABELS[id]+': graduação excede limite inicial da idade.');
  if(valid&&id==='status'&&rank>input.statusCap)
   violations.push('Status excede o teto autorizado da Casa.');
  return{id,label:CHARACTER_SKILL_LABELS[id],rank,cost:valid?skillCreationCost(rank):0};
 });
 const skillSpent=skillBreakdown.reduce((n,x)=>n+x.cost,0);
 if(skillSpent>rules.skillXp)violations.push('Experiência de habilidades insuficiente.');
 const specialties=new Set<string>();let specialtySpent=0;
 for(const s of input.specialties){
  if(!Number.isInteger(s.bonusDice)||s.bonusDice<0||s.bonusDice>10){
   violations.push('Especialidade com dados de bônus inválidos.');continue;
  }
  if(!CHARACTER_SKILL_IDS.includes(s.skillId)){
   violations.push('Habilidade de especialidade desconhecida.');continue;
  }
  if(s.bonusDice>input.skillRanks[s.skillId])
   violations.push('Dados B excedem graduação de '+CHARACTER_SKILL_LABELS[s.skillId]+'.');
  const key=s.skillId+':'+normalizeSpecialty(s.specialtyId);
  if(specialties.has(key))violations.push('Especialidade duplicada: '+key);
  specialties.add(key);
  if(s.bonusDice>0&&(!s.verified||!SPECIALTY_REGISTRY[s.skillId].some(x=>x.id===normalizeSpecialty(s.specialtyId))))
   violations.push('Especialidade ainda sem confirmação do livro: '+s.specialtyId);
  specialtySpent+=s.bonusDice*SPECIALTY_BONUS_XP;
 }
 if(specialtySpent>rules.specialtyXp)violations.push('Experiência de especialidades insuficiente.');
 const override=input.narratorDestinyOverride;
 if(override&&(!Number.isInteger(override.initialDestiny)||override.initialDestiny<0||
 !Number.isInteger(override.maxInitialBenefits)||override.maxInitialBenefits<0||
 override.reason.trim().length<10))violations.push('Decisão do Narrador sobre Destino inválida.');
 if(rules.initialDestiny===null&&!override)violations.push('Pontos de Destino da faixa avançada pendentes de conferência.');
 const maxInitialBenefits=override?.maxInitialBenefits??rules.maxInitialBenefits;
 if(maxInitialBenefits!==null&&input.benefitCount>maxInitialBenefits)
  violations.push('Benefícios iniciais excedem limite da idade.');
 return{
  ageGroup:input.ageGroup,skillBudget:rules.skillXp,skillSpent,skillAvailable:rules.skillXp-skillSpent,
  specialtyBudget:rules.specialtyXp,specialtySpent,specialtyAvailable:rules.specialtyXp-specialtySpent,
  initialDestiny:override?.initialDestiny??rules.initialDestiny,maxInitialBenefits,
  violations,valid:violations.length===0,skillBreakdown,
 };
}
export function validateCharacterCreation(input:CreationInput):CreationBudget{
 const quote=quoteCharacterCreation(input);
 if(!quote.valid)throw new Error(quote.violations.join(' | '));
 return quote;
}
export function quoteV2CharacterCreation(
 character:CharacterV2,ageGroup:AgeGroup,statusCap:number,benefitCount=0
):CreationBudget{
 return quoteCharacterCreation({
 ageGroup,statusCap,skillRanks:character.skillRanks,
 specialties:character.specialties.map(s=>({
 skillId:s.skillId,specialtyId:s.specialtyId,bonusDice:s.bonusDice,verified:s.verified,
 })),benefitCount,
 });
}
