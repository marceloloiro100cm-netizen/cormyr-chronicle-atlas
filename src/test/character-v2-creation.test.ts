import {describe,it,expect} from 'vitest';
import {AGE_RULES,quoteCharacterCreation,skillCreationCost,
 SPECIALTY_REGISTRY,validateCharacterCreation,type CreationInput} from '@/lib/character-v2/creation';
import {CHARACTER_SKILL_IDS,emptyCharacterSkillRanks} from '@/lib/character-v2/schema';

describe('Ficha V2 — lote 04: criação com custos do livro',()=>{
 const base=():CreationInput=>({ageGroup:'adult',statusCap:4,
  skillRanks:emptyCharacterSkillRanks(),specialties:[],benefitCount:0});
 it('usa orçamentos por 8 faixas etárias sem cobrar 20 XP militares',()=>{
  expect(Object.keys(AGE_RULES)).toHaveLength(8);
  expect(AGE_RULES.adult).toMatchObject({skillXp:210,specialtyXp:80,maxCreationSkill:7});
  expect(AGE_RULES.child).toMatchObject({skillXp:120,specialtyXp:40,maxCreationSkill:4});
  expect(AGE_RULES.venerable).toMatchObject({skillXp:360,specialtyXp:240,maxCreationSkill:5});
  expect(skillCreationCost(1)).toBe(-50);
  expect(skillCreationCost(2)).toBe(0);
  expect(skillCreationCost(3)).toBe(10);
  expect(skillCreationCost(4)).toBe(40);
  expect(skillCreationCost(5)).toBe(70);
  expect(skillCreationCost(7)).toBe(130);
  expect(()=>skillCreationCost(8)).toThrow();
 });
 it('lista 19 habilidades oficiais sem Briga independente; Briga integra Luta',()=>{
  expect(CHARACTER_SKILL_IDS).toHaveLength(19);
  expect(SPECIALTY_REGISTRY.fighting.map(x=>x.name)).toContain('Briga');
  expect(SPECIALTY_REGISTRY.cunning.map(x=>x.name)).toContain('Lógica');
  expect(SPECIALTY_REGISTRY.athletics.map(x=>x.name)).toContain('Correr');
  expect(SPECIALTY_REGISTRY.language).toHaveLength(0);
 });
 it('calcula compras separadas de habilidade e especialidade, sem modificar objeto',()=>{
  const input=base();
  input.skillRanks.cunning=4;input.skillRanks.fighting=5;input.skillRanks.status=3;
  input.specialties=[{skillId:'fighting',specialtyId:'briga',bonusDice:2,verified:true}];
  const previous=structuredClone(input);
  const result=validateCharacterCreation(input);
  expect(result.skillSpent).toBe(120);
  expect(result.skillAvailable).toBe(90);
  expect(result.specialtySpent).toBe(20);
  expect(result.specialtyAvailable).toBe(60);
  expect(result.initialDestiny).toBe(4);
  expect(input).toEqual(previous);
 });
 it('impede Status acima do teto e graduação inicial incompatível com idade',()=>{
  const a=base();a.skillRanks.status=5;
  expect(quoteCharacterCreation(a).violations).toContain('Status excede o teto autorizado da Casa.');
  const child={...base(),ageGroup:'child' as const};
  child.skillRanks.cunning=5;
  expect(quoteCharacterCreation(child).violations.some(x=>x.includes('limite inicial'))).toBe(true);
 });
 it('não libera B acima da habilidade, não aceita especialidade desconhecida e detecta duplicidade',()=>{
  const a=base();
  a.specialties=[{skillId:'fighting',specialtyId:'briga',bonusDice:3,verified:true},
   {skillId:'fighting',specialtyId:'briga',bonusDice:1,verified:true},
   {skillId:'fighting',specialtyId:'criatura inventada',bonusDice:1,verified:true}];
  const issues=quoteCharacterCreation(a).violations.join(' ');
  expect(issues).toContain('Dados B excedem graduação');
  expect(issues).toContain('duplicada');
  expect(issues).toContain('sem confirmação do livro');
 });
 it('faixas de idade com tabela OCR incompleta exigem regra explícita do Narrador',()=>{
  const a={...base(),ageGroup:'old' as const};
  expect(quoteCharacterCreation(a).valid).toBe(false);
  const b={...a,narratorDestinyOverride:{
   initialDestiny:2,maxInitialBenefits:3,
   reason:'Decisão expressa de criação após consulta ao livro físico.'}};
  expect(validateCharacterCreation(b).initialDestiny).toBe(2);
  expect(quoteCharacterCreation({...b,benefitCount:4}).valid).toBe(false);
 });
});
