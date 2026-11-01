import {CHARACTER_TRAITS,findCharacterTrait,type CharacterTrait,CHARACTER_CATALOG_VERSION} from './catalog';
import {type CharacterSkillId} from './schema';

/**
 * Lotes 07–09. Regras ativas são uma allowlist explicitamente revisada
 * contra as tabelas 5-1/5-2 do livro básico PT, não uma promessa de que
 * todas as 150 entradas possam alterar a ficha.
 * Fonte: Guerra dos Tronos RPG, cap. 5, tabelas 5-1 e 5-2.
 */
export const CHARACTER_TRAIT_RULESET_VERSION='got-pt-traits-cormyr-2026-11-01-v1' as const;
export type TraitEffectCode=
 |'fast_movement'|'hardy_health'|'stubborn_composure'
 |'agile_reroll'|'attractive_reroll'|'charismatic_result'|'deceptive_result'
 |'animal_friend_dice'|'precision_dice'|'noble_favorite_bonus'|'common_favorite_bonus'
 |'limp_movement'|'short_movement_and_social'|'childhood_illness_health'
 |'flawed_skill_dice'|'cowardice_dice'|'ignoble_dice'|'bastard_dice'|'sickly_dice'
 |'clumsy_reroll'|'distracted_reroll'|'scarred_reroll';
export type TraitPrerequisite=Readonly<{
 skill:CharacterSkillId;minimumRank:number;
 specialtyId?:string|undefined;minimumBonusDice?:number|undefined;
}>;
export type TraitRule=Readonly<{
 trait:CharacterTrait;
 effect:TraitEffectCode|null;
 status:'verified'|'pending_source_review'|'narrative_manual';
 reference:string;
 category:'fortune'|'heritage'|'ability'|'martial'|'social'|'flaw';
 prerequisites:readonly TraitPrerequisite[];
 notes:string;
}>;
type RuleSpec=Readonly<{effect:TraitEffectCode;prerequisites?:readonly TraitPrerequisite[];notes:string}>;
const spec=(effect:TraitEffectCode,notes:string,
 prerequisites:readonly TraitPrerequisite[]=[]):RuleSpec=>({effect,notes,prerequisites});
const verified:Readonly<Record<string,RuleSpec>>={
 // L07: fórmulas passivas e rolagens de habilidades.
 rapido:spec('fast_movement','+1 m de Movimento; Corrida usa 5 × Movimento.'),
 durao:spec('hardy_health','Soma B de Resistência à Saúde.',[
  {skill:'endurance',minimumRank:2,specialtyId:'resistencia',minimumBonusDice:1}]),
 agil:spec('agile_reroll','Permite rerrolar resultados 1 em testes de Agilidade.'),
 'amigo-das-feras':spec('animal_friend_dice','+1D somente em Encantar ou Treinar, Lidar com Animais.'),
 // L08: efeitos de persuasão e intriga em contextos conferidos.
 teimoso:spec('stubborn_composure','Soma dados B verificados de Dedicação à Compostura.',[
  {skill:'will',minimumRank:3,specialtyId:'dedicacao',minimumBonusDice:1}]),
 atraente:spec('attractive_reroll','Permite rerrolar resultados 1 em Persuasão.'),
 carismatico:spec('charismatic_result','+2 ao resultado de Persuasão.',[
  {skill:'persuasion',minimumRank:3}]),
 traiçoeiro:spec('deceptive_result','Soma graduações de Astúcia ao resultado de Enganação.'),
 'favorito-da-nobreza':spec('noble_favorite_bonus','+1B Persuasão contra Status 4 ou maior.'),
 'favorito-da-plebe':spec('common_favorite_bonus','+1B Persuasão contra Status 3 ou menor.'),
 preciso:spec('precision_dice','+1D Pontaria quando o alvo tem cobertura.',[
  {skill:'marksmanship',minimumRank:4}]),
 // L09: desvantagens numéricas e rerrolagens que constam na Tabela 5-2.
 manco:spec('limp_movement','Movimento -2 m.'),
 anao:spec('short_movement_and_social','Movimento -1 m; -1D Persuasão: Charme/Seduzir.'),
 'doenca-na-infancia':spec('childhood_illness_health','Saúde máxima -2.'),
 'defeito-habilidade-parametrizada':spec('flawed_skill_dice','-1D em teste da habilidade do parâmetro skillId.'),
 covarde:spec('cowardice_dice','-1D em testes durante combate e intriga.'),
 ignobil:spec('ignoble_dice','-1D Persuasão e Status.'),
 bastardo:spec('bastard_dice','-1D Persuasão contra Status superior ao próprio.'),
 doente:spec('sickly_dice','-2D Vigor para resistir a doenças ou perigos.'),
 desastrado:spec('clumsy_reroll','Força rerrolagem de resultados 6 em Agilidade.'),
 distraido:spec('distracted_reroll','Força rerrolagem de resultados 6 em Astúcia.'),
 marcado:spec('scarred_reroll','Força rerrolagem de resultados 6 em Persuasão.'),
};
const MANUAL= new Set<string>([
 // Efeitos relevantes dependem de ações, cenários, equipamentos ou decisões.
 'abastado','companheiro','companheiro-animal','famoso','heranca',
 'herdeiro','lider-de-casa','meistre','patrono','pio','sortudo',
 'terras','enorme','sangue-de-herois','artista','avaliacao',
 'contatos','esquadrao-de-elite','lider-de-homens','inspirador',
 'furtivo','foco-em-conhecimento','famoso','fiel','fascinante',
 'furia','furioso','cavaleiro-de-torneio','negociante-nato',
 'honrado','inimigo','medo','habito-perturbador','protegido',
 'arrogancia-suprema','proscrito','fragil','colerico','lascivo',
 'insanidade-cruel','sangue-de-valyria','warg','trocador-de-peles'
]);
/** Cada uma das entradas possui uma decisão de aplicação, nunca um +N genérico. */
export const CHARACTER_TRAIT_RULES:readonly TraitRule[]=Object.freeze(CHARACTER_TRAITS.map(trait=>{
 const v=verified[trait.id];
 const effective=v&&trait.sourceQuality!=='visual_review_required';
 return Object.freeze({
  trait,
  effect:effective?v.effect:null,
  status:effective?'verified' as const:
   (MANUAL.has(trait.id)?'narrative_manual' as const:'pending_source_review' as const),
  reference:trait.source+' · '+CHARACTER_CATALOG_VERSION,
  category:trait.category,
  prerequisites:effective?(v.prerequisites??[]):[],
  notes:effective?v.notes:'Regra pendente de revisão/aprovação ou efeito contextual narrativo; nenhum bônus presumido.',
 });
}));
export function getCharacterTraitRule(nameOrId:string):TraitRule|undefined{
 const found=findCharacterTrait(nameOrId);
 return found?CHARACTER_TRAIT_RULES.find(rule=>rule.trait.id===found.id):undefined;
}
export function auditCharacterTraitRules(){
 return {
  version:CHARACTER_TRAIT_RULESET_VERSION,total:CHARACTER_TRAIT_RULES.length,
  verified:CHARACTER_TRAIT_RULES.filter(r=>r.status==='verified').length,
  manual:CHARACTER_TRAIT_RULES.filter(r=>r.status==='narrative_manual').length,
  pending:CHARACTER_TRAIT_RULES.filter(r=>r.status==='pending_source_review').length,
  unreferenced:CHARACTER_TRAIT_RULES.filter(r=>!r.reference),
  duplicateIds:CHARACTER_TRAIT_RULES.filter((r,i,a)=>a.findIndex(x=>x.trait.id===r.trait.id)!==i)
   .map(r=>r.trait.id),
 };
}
