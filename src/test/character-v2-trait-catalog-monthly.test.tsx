import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {CHARACTER_TRAITS,auditCharacterCatalog,findCharacterTrait} from '@/lib/character-v2/catalog';
import {CHARACTER_BOOK_SUMMARIES} from '@/lib/character-v2/trait-book-index';
import {describeCharacterTrait} from '@/lib/character-v2/trait-descriptions';
import {TraitCard} from '@/components/character-v2/character-sheet-parts';
import {TraitCatalogPicker} from '@/components/character-v2/trait-catalog-picker';
import {quoteWealthyMonthlyIncome,degreeOfSuccess,listMonthlyTraitWindows,pendingMonthlyCredits}
 from '@/lib/character-v2/trait-monthly';
import {readStructuredTraitText} from '@/lib/character-v2/legacy-traits';

describe('Biblioteca de qualidades e defeitos — livro básico',()=>{
 it('mantém todas as 150 entradas e sinopses tabulares com cobertura explícita',()=>{
  expect(CHARACTER_TRAITS).toHaveLength(150);
  expect(auditCharacterCatalog().duplicates).toEqual([]);
  expect(Object.keys(CHARACTER_BOOK_SUMMARIES).length).toBeGreaterThanOrEqual(110);
  const covered=CHARACTER_TRAITS.filter(t=>Boolean(describeCharacterTrait(t.id)?.effectDescription));
  expect(covered).toHaveLength(150);
  expect(describeCharacterTrait('pugilista-ii')?.sourceCoverage).toBe('pending_transcription');
  expect(describeCharacterTrait('abastado')?.automationStatus).toBe('verified');
 });
 it('abre qualidade e mostra bônus, pré-requisito, fonte e grau',()=>{
  render(<TraitCard trait={findCharacterTrait('Abastado')!}/>);
  const trigger=screen.getByText('Abastado').closest('summary');
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  expect(screen.getByText(/10 dragões de ouro por grau de sucesso/)).toBeInTheDocument();
  expect(screen.getByText(/Uma oportunidade por mês de Harptos/)).toBeInTheDocument();
  expect(screen.getByText(/Capítulo 5 · Tabela 5-1/)).toBeInTheDocument();
 });
 it('seletor oferece o conjunto completo e grava itens sem ativar efeitos',()=>{
  let value='';
  const {rerender}=render(<TraitCatalogPicker kind="benefit" value={value} onChange={v=>{value=v;}}/>);
  expect(screen.getByText(/115 opções do catálogo/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Catálogo completo'),{target:{value:'abastado'}});
  fireEvent.click(screen.getByRole('button',{name:'Adicionar qualidade'}));
  expect(value).toBe('Abastado');
  rerender(<TraitCatalogPicker kind="benefit" value={value} onChange={v=>{value=v;}}/>);
  expect(screen.getByRole('button',{name:'Remover Abastado'})).toBeInTheDocument();
  expect(readStructuredTraitText(value,'')).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:'quality',catalogTrait:expect.objectContaining({id:'abastado'}),status:'imported_unverified'})
  ]));
 });
 it('permite escolher habilidade de Defeito sem inventar pontos',()=>{
  let value='';
  render(<TraitCatalogPicker kind="flaw" value={value} onChange={v=>{value=v;}}/>);
  fireEvent.change(screen.getByLabelText('Catálogo completo'),{
   target:{value:'defeito-habilidade-parametrizada'}});
  fireEvent.change(screen.getByLabelText('Habilidade afetada'),{target:{value:'Pontaria'}});
  fireEvent.click(screen.getByRole('button',{name:'Adicionar defeito'}));
  expect(value).toBe('Defeito (Pontaria)');
  const parsed=readStructuredTraitText('',value);
  expect(parsed[0]).toMatchObject({skillId:'marksmanship',
   catalogTrait:expect.objectContaining({id:'defeito-habilidade-parametrizada'})});
 });
});
describe('Abastado — calendário mensal de Harptos',()=>{
 const base={
  characterId:'00000000-0000-4000-8000-000000000080',houseId:'ashkar',
  monthKey:1522*12+9,traitId:'abastado' as const,
  approved:true,skill:'cunning' as const,skillRank:3,
 };
 it('fácil 3 e +10 DO por grau de sucesso, não um valor fixo',()=>{
  expect(degreeOfSuccess(2,3)).toBe(0);
  expect(degreeOfSuccess(3,3)).toBe(1);
  expect(degreeOfSuccess(8,3)).toBe(2);
  expect(degreeOfSuccess(13,3)).toBe(3);
  expect(degreeOfSuccess(18,3)).toBe(4);
  const result=quoteWealthyMonthlyIncome({...base,dice:[1,3,4]});
  expect(result).toMatchObject({result:8,difficulty:3,degrees:2,coins:20,
   currency:'DO',status:'pending_authorized_settlement'});
 });
 it('idempotência por pessoa+mês+versão e múltiplos meses em saltos do calendário',()=>{
  const first=quoteWealthyMonthlyIncome({...base,dice:[1,3,4]});
  const repeated=quoteWealthyMonthlyIncome({...base,dice:[6,6,6]});
  expect(first.eventKey).toBe(repeated.eventKey);
  const second=quoteWealthyMonthlyIncome({...base,monthKey:base.monthKey+1,dice:[2,2,2]});
  expect(pendingMonthlyCredits([first,repeated,second],new Set())).toHaveLength(2);
  expect(pendingMonthlyCredits([first,second],new Set([first.eventKey]))).toEqual([second]);
  expect(listMonthlyTraitWindows(12,15)).toEqual([13,14,15]);
 });
 it('nunca oferece crédito de trait não homologada ou rolagem inválida',()=>{
  expect(()=>quoteWealthyMonthlyIncome({...base,approved:false,dice:[6,6,6]})).toThrow('homologado');
  expect(()=>quoteWealthyMonthlyIncome({...base,dice:[1,2]})).toThrow('D6');
  expect(()=>quoteWealthyMonthlyIncome({...base,dice:[1,6,9]})).toThrow('D6');
 });
});
