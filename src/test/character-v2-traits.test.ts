import {describe,it,expect} from 'vitest';
import {CHARACTER_TRAITS} from '@/lib/character-v2/catalog';
import {auditCharacterTraitRules,getCharacterTraitRule,CHARACTER_TRAIT_RULES} from '@/lib/character-v2/trait-rules';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';
import {resolveCharacterDerived} from '@/lib/character-v2/derived';
import {evaluateCharacterTraits,resolveCharacterWithTraits} from '@/lib/character-v2/trait-engine';
import {reviewCharacterAgeDefects,reviewCharacterConditions} from '@/lib/character-v2/age-defects';
import type {CharacterV2,CharacterSkillId} from '@/lib/character-v2/schema';

const ID='00000000-0000-4000-8000-000000000733';
function sample():CharacterV2{
 const s=blankChronicleSheet();s.name='Aldaeric Erdenor';
 const read=readCharacterV2({id:ID,version:1,houseId:'erdenor',title:'Ficha',content:serializeChronicleSheet(s)});
 const c=read.character!;
 return {...c,review:{status:'approved',warnings:[]},
  skillRanks:{...c.skillRanks,agility:3,athletics:4,endurance:5,
   will:3,cunning:4,awareness:3,status:4,persuasion:4,marksmanship:4},
  specialties:[
   {id:'one',skillId:'endurance',specialtyId:'resistencia',bonusDice:2,verified:true},
   {id:'two',skillId:'will',specialtyId:'dedicacao',bonusDice:1,verified:true},
  ]};
}
function trait(c:CharacterV2,traitId:string,params:Record<string,string>={}){
 c.traits.push({id:'selected-'+c.traits.length,traitId,
  status:'approved',tier:null,params,acquiredAt:null});
}
describe('Ficha V2 — lotes 07–09: catálogo e elegibilidade',()=>{
 it('possui política explícita para 150 entradas, inclusive efeitos ainda não liberados',()=>{
  const audit=auditCharacterTraitRules();
  expect(CHARACTER_TRAITS).toHaveLength(150);
  expect(audit.total).toBe(150);
  expect(audit.verified).toBeGreaterThan(15);
  expect(audit.pending+audit.manual+audit.verified).toBe(audit.total);
  expect(audit.unreferenced).toHaveLength(0);
  expect(audit.duplicateIds).toEqual([]);
  expect(CHARACTER_TRAIT_RULES.some(r=>r.trait.category==='fortune')).toBe(true);
  expect(CHARACTER_TRAIT_RULES.some(r=>r.trait.category==='heritage')).toBe(true);
  expect(CHARACTER_TRAIT_RULES.some(r=>r.trait.category==='ability')).toBe(true);
  expect(CHARACTER_TRAIT_RULES.some(r=>r.trait.category==='martial')).toBe(true);
  expect(CHARACTER_TRAIT_RULES.some(r=>r.trait.category==='social')).toBe(true);
  expect(CHARACTER_TRAIT_RULES.some(r=>r.trait.category==='flaw')).toBe(true);
  expect(getCharacterTraitRule('Pugilista II')?.status).toBe('pending_source_review');
  expect(getCharacterTraitRule('Sortudo')?.status).toBe('narrative_manual');
  expect(getCharacterTraitRule('Rápido')?.status).toBe('verified');
  expect(getCharacterTraitRule('Defeito (habilidade)')?.status).toBe('verified');
 });
 it('valida graduação de série e impede III sem graus anteriores',()=>{
  const c=sample();trait(c,'dancarino-da-agua-iii');
  const result=evaluateCharacterTraits(c);
  expect(result.applied).toEqual([]);
  expect(result.pending.join(' ')).toContain('efeito contextual');
 });
 it('não aceita bônus automático de fichas nem de seleções não homologadas',()=>{
  const c=sample();trait(c,'rapido');c.review.status='needs_review';
  expect(resolveCharacterWithTraits(c).derived.values.movement).toBe(4);
  expect(resolveCharacterWithTraits(c).derived.values.running).toBe(16);
  c.review.status='approved';c.traits[0]!.status='proposed';
  expect(evaluateCharacterTraits(c).applied).toEqual([]);
  expect(c.traits[0]!.status).toBe('proposed');
 });
 it('pré-requisito de Durão e Teimoso bloqueia B insuficiente/não verificado',()=>{
  const c=sample();trait(c,'durao');trait(c,'teimoso');
  const once=resolveCharacterWithTraits(c);
  expect(once.derived.values.maxHealth).toBe(17);
  expect(once.derived.values.maxComposure).toBe(10);
  c.specialties[0]!.verified=false;c.specialties[1]!.verified=false;
  const other=resolveCharacterWithTraits(c);
  expect(other.derived.values.maxHealth).toBe(15);
  expect(other.derived.values.maxComposure).toBe(9);
  expect(other.traits.pending.join(' ')).toContain('especialidade');
 });
});
describe('Lotes 07–08: benefícios numéricos sem dupla aplicação',()=>{
 it('Rápido adiciona +1 metro, troca Corrida para 5× e não duplica seleção',()=>{
  const c=sample();trait(c,'rapido');trait(c,'rapido');
  const first=resolveCharacterWithTraits(c);
  expect(first.derived.values.movement).toBe(5);
  expect(first.derived.values.running).toBe(25);
  expect(first.derived.nodes.running.lines.some(l=>l.sourceId==='trait:rapido')).toBe(true);
  expect(first.traits.warnings.join(' ')).toContain('duplicada');
  expect(resolveCharacterDerived(c).values.running).toBe(16);
  c.traits[0]!.status='inactive';
  const second=resolveCharacterWithTraits(c);
  expect(second.derived.values.running).toBe(25);
  c.traits[1]!.status='inactive';
  expect(resolveCharacterWithTraits(c).derived.values.running).toBe(16);
 });
 it('bônus de teste Atraente, Carismático, Traiçoeiro e Favoritos só no contexto',()=>{
  const c=sample();
  for(const id of ['atraente','carismatico','traicoeiro',
   'favorito-da-nobreza','favorito-da-plebe'])trait(c,id);
  const pers=evaluateCharacterTraits(c,{activity:'intrigue',skillId:'persuasion',opponentStatus:5});
  expect(pers.tests.some(t=>t.kind==='reroll'&&t.face===1&&!t.mandatory)).toBe(true);
  expect(pers.tests.some(t=>t.kind==='result'&&t.amount===2)).toBe(true);
  expect(pers.tests.filter(t=>t.kind==='bonusDice')).toHaveLength(1);
  expect(pers.tests.find(t=>t.kind==='bonusDice')?.sourceId).toContain('nobreza');
  const low=evaluateCharacterTraits(c,{activity:'intrigue',skillId:'persuasion',opponentStatus:2});
  expect(low.tests.find(t=>t.kind==='bonusDice')?.sourceId).toContain('plebe');
  const dec=evaluateCharacterTraits(c,{activity:'intrigue',skillId:'deception'});
  expect(dec.tests).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'result',amount:4,sourceId:'trait:traicoeiro'})]));
  const other=evaluateCharacterTraits(c,{activity:'exploration',skillId:'endurance'});
  expect(other.tests).toHaveLength(0);
 });
 it('Amigo das Feras e Preciso só em especialidade/alvo válido',()=>{
  const c=sample();trait(c,'amigo-das-feras');trait(c,'preciso');
  const yes=evaluateCharacterTraits(c,{activity:'exploration',skillId:'animalHandling',
   specialtyId:'encantar'});
  expect(yes.tests).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'testDice',amount:1})]));
  expect(evaluateCharacterTraits(c,{activity:'exploration',
   skillId:'animalHandling',specialtyId:'cavalgar'}).tests).toHaveLength(0);
  expect(evaluateCharacterTraits(c,{activity:'combat',
   skillId:'marksmanship',targetCovered:true}).tests).toEqual(expect.arrayContaining([
    expect.objectContaining({kind:'testDice',amount:1})]));
 });
});
describe('Lote 09: defeitos, condições e requisitos da idade',()=>{
 it('Manco, Anão e Doença na Infância afetam apenas derivados corretos',()=>{
  const c=sample();
  for(const id of ['manco','anao','doenca-na-infancia'])trait(c,id);
  const x=resolveCharacterWithTraits(c).derived;
  expect(x.values.movement).toBe(1);
  expect(x.values.running).toBe(4);
  expect(x.values.maxHealth).toBe(13);
  expect(c.skillRanks.agility).toBe(3);
  expect(c.skillRanks.endurance).toBe(5);
  expect(x.nodes.maxHealth.lines.some(line=>line.sourceId==='trait:doenca-na-infancia')).toBe(true);
 });
 it('Defeito parametrizado reduz rolagem, não a graduação nem defesa de intriga',()=>{
  const c=sample();trait(c,'defeito-habilidade-parametrizada',{skillId:'cunning'});
  const results=evaluateCharacterTraits(c,{activity:'exploration',skillId:'cunning'});
  expect(results.tests).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'testDice',amount:-1})]));
  expect(resolveCharacterWithTraits(c).derived.values.intrigueDefense).toBe(11);
  c.traits[0]!.params={skillId:'nonexistent' as CharacterSkillId};
  expect(evaluateCharacterTraits(c).pending.join(' ')).toContain('params.skillId');
 });
 it('Covarde, Bastardo, Ignóbil e Doente respeitam a cena e alvo',()=>{
  const c=sample();
  for(const id of ['covarde','bastardo','ignobil','doente'])trait(c,id);
  const intrusion=evaluateCharacterTraits(c,{
   activity:'intrigue',skillId:'persuasion',opponentStatus:5});
  expect(intrusion.tests.filter(e=>e.kind==='testDice').map(x=>x.amount)).toEqual([-1,-1,-1]);
  const idle=evaluateCharacterTraits(c,{
   activity:'exploration',skillId:'persuasion',opponentStatus:3});
  expect(idle.tests.map(x=>x.amount)).toEqual([-1]);
  const disease=evaluateCharacterTraits(c,{
   activity:'exploration',skillId:'endurance',purpose:'resist_disease'});
  expect(disease.tests).toEqual(expect.arrayContaining([expect.objectContaining({amount:-2})]));
  const general=evaluateCharacterTraits(c,{activity:'exploration',skillId:'endurance'});
  expect(general.tests).toHaveLength(0);
 });
 it('Ágil/Desastrado distinguem rerrolagem voluntária e obrigatória',()=>{
  const c=sample();trait(c,'agil');trait(c,'desastrado');
  const x=evaluateCharacterTraits(c,{activity:'combat',skillId:'agility'});
  expect(x.tests.filter(t=>t.kind==='reroll')).toEqual([
   expect.objectContaining({face:1,mandatory:false}),
   expect.objectContaining({face:6,mandatory:true}),
  ]);
 });
 it('exigências de idade exigem escolha, não causam defeito ao envelhecer',()=>{
  const c=sample();const pristine=structuredClone(c);
  expect(reviewCharacterAgeDefects(c,'child').satisfied).toBe(true);
  expect(reviewCharacterAgeDefects(c,'old').missingTotal).toBe(2);
  expect(reviewCharacterAgeDefects(c,'old').missingRestricted).toBe(1);
  trait(c,'manco');
  trait(c,'defeito-habilidade-parametrizada',{skillId:'agility'});
  expect(reviewCharacterAgeDefects(c,'old').satisfied).toBe(true);
  expect(reviewCharacterAgeDefects(c,'venerable').missingRestricted).toBe(2);
  expect(pristine.traits).toEqual([]);
 });
 it('ferimentos e condições importados são rastreados sem penalidades inventadas',()=>{
  const c=sample();c.state.injuries.push('Ferimento da batalha');
  c.state.conditions.push('Condição desconhecida');
  const initial=structuredClone(c);
  const report=reviewCharacterConditions(c);
  expect(report.sources).toHaveLength(2);
  expect(report.mechanicalEffectsEnabled).toBe(false);
  expect(report.pending).toHaveLength(2);
  expect(c).toEqual(initial);
 });
});
