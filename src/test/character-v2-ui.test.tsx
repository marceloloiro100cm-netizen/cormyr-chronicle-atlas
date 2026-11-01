import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {SkillPips,SpecialtyPips,TraitCard,CharacterStatus,
  CharacterV2Preview} from '@/components/character-v2/character-sheet-parts';
import {findCharacterTrait} from '@/lib/character-v2/catalog';
import {readCharacterV2} from '@/lib/character-v2/read-adapter';
import {blankChronicleSheet,serializeChronicleSheet} from '@/lib/house/character-sheet';

describe('Character V2 — lote 03 UI de bolinhas',()=>{
 it('leitura mostra sete círculos e a quantidade correta preenchida',()=>{
  const {container}=render(<SkillPips skillId="cunning" value={4}/>);
  const group=screen.getByRole('group',{name:/Astúcia: 4 de 7/});
  expect(within(group).queryAllByRole('button')).toHaveLength(0);
  expect(container.querySelectorAll('.character-v2-pip')).toHaveLength(7);
  expect(container.querySelectorAll('.character-v2-pip.is-filled')).toHaveLength(4);
  expect(screen.getByText('4')).toBeInTheDocument();
 });
 it('edição oferece botões acessíveis com clique, foco e valor selecionado',()=>{
  const change=vi.fn();
  render(<SkillPips skillId="fighting" value={2} onValueChange={change}/>);
  const button=screen.getByRole('button',{name:'Luta: selecionar 5'});
  button.focus();expect(button).toHaveFocus();expect(button).toHaveAttribute('aria-pressed','false');
  fireEvent.click(button);expect(change).toHaveBeenCalledWith(5);
  expect(screen.getByRole('button',{name:'Luta: selecionar 2'}))
    .toHaveAttribute('aria-pressed','true');
 });
 it('especialidade possui B, zero e comando de limpar',()=>{
  const change=vi.fn();
  render(<SpecialtyPips label="Lógica" bonusDice={2} onValueChange={change}/>);
  expect(screen.getByText('(2B)')).toBeInTheDocument();
  expect(screen.getByRole('group',{name:/Especialidade Lógica: 2 de 5/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Remover pontos de Lógica'}));
  expect(change).toHaveBeenCalledWith(0);
 });
 it('trait revela categoria e pendência, sem inventar efeitos',()=>{
  const t=findCharacterTrait('Rápido')!;
  render(<TraitCard trait={t} tier={null}/>);
  expect(screen.getByRole('article',{name:'Rápido — Benefício'})).toBeInTheDocument();
  expect(screen.getByText(/pendente de conciliação/)).toBeInTheDocument();
 });
 it('status não sugere cálculos aprovados onde ainda não existe motor',()=>{
  render(<CharacterStatus name="Aldaeric Erdenor" role="Lorde" reviewStatus="needs_review"/>);
  expect(screen.getByRole('region',{name:'Resumo de Aldaeric Erdenor'})).toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(6);
  expect(screen.getByText(/nenhum bônus é presumido/)).toBeInTheDocument();
 });
 it('composição renderiza 19 habilidades, preserva a revisão e markup de referência',()=>{
  const s=blankChronicleSheet();s.name='Aldaeric Erdenor';s.cunning=4;
  const r=readCharacterV2({id:'00000000-0000-4000-8000-000000000011',
    houseId:'h1',version:1,title:'Ficha',content:serializeChronicleSheet(s)});
  const {container}=render(<CharacterV2Preview character={r.character!}/>);
  expect(container.querySelectorAll('.character-v2-skill')).toHaveLength(19);
  expect(screen.getByRole('region',{name:'Habilidades V2'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Pendências de conciliação'})).toBeInTheDocument();
  // Snapshot sem depender da renderização de dados de produção.
  const markup=container.querySelector('.character-v2-skill')?.innerHTML??'';
  expect(markup).toContain('Agilidade');
  expect(markup).toContain('character-v2-pip');
 });
});
