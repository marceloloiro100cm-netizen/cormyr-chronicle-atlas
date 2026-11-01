import {findCharacterTrait} from './catalog';
import {getCharacterTraitRule} from './trait-rules';
import {CHARACTER_BOOK_SUMMARIES} from './trait-book-index';

/** Livro do Narrador: capítulo 5, tabelas 5-1/5-2.
 * A sinopse de uma tabela não equivale a um efeito homologado.
 */
export function describeCharacterTrait(id:string){
 const trait=findCharacterTrait(id);
 if(!trait)return null;
 const rule=getCharacterTraitRule(trait.id);
 const summary=CHARACTER_BOOK_SUMMARIES[trait.label];
 const requirements=rule?.prerequisites.map(p=>p.skill+' '+p.minimumRank+
  (p.specialtyId?' ('+p.specialtyId+' '+(p.minimumBonusDice??1)+'B)':''))??[];
 const rich=trait.id==='abastado'?{
  summary:'No início de cada mês, teste Astúcia ou Status contra dificuldade Fácil (3). Um sucesso gera 10 dragões de ouro por grau de sucesso.',
  prerequisite:'Sem pré-requisito na tabela do livro.',
  cadence:'Uma oportunidade por mês de Harptos; rolagem necessária; sem depósito automático sem validação do resultado.',
 }:null;
 return {
  trait,rule,
  bookReference:'Capítulo 5 · Tabela '+(trait.kind==='flaw'?'5-2':'5-1'),
  effectDescription:rich?.summary??(rule?.status==='verified'?rule.notes:
   summary?.effectSummary??'Detalhamento da regra pendente de conferência no livro.'),
  prerequisiteDescription:rich?.prerequisite??(
   summary?.prerequisite||(requirements.length?requirements.join('; '):'Sem exigências tabuladas; conferir descrição integral.')),
  cadence:rich?.cadence??null,
  sourceCoverage:rich?'verified_detail':summary?'table_summary':'pending_transcription',
  automationStatus:rule?.status??'pending_source_review',
  isAppliedByPreview:false as const,
 };
}
export const CHARACTER_TRAIT_DESCRIPTION_AUDIT={
 total:150,
 source:'Guerra dos Tronos RPG, capítulo 5, tabelas 5-1 e 5-2',
} as const;
