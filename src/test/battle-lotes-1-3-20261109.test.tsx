import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {BattleTurnCue} from '@/components/battle/BattleTurnCue';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {readFileSync} from 'node:fs';

afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});

describe('Lotes 1 e 2 · navegação, proteção e orientação contextual',()=>{
 it('roteia continuacao por motor sem enviar D&D e GOT para painel PTE',()=>{
  const hub=readFileSync('src/components/battle/BattleNarratorHub.tsx','utf8');
  expect(hub).toContain("rulesetMode==='adapted'?");
  expect(hub).toContain('Continuar batalha');
  expect(hub).toContain('<BattleSaveScope system={rulesetMode}/>');
  expect(hub).toContain('resumeFromLibrary={resumeGot}');
  expect(hub).toContain('showSavedOnOpen={resumeDnd}');
  expect(readFileSync('src/components/battle/BattleGotGame.tsx','utf8'))
   .toContain('leaveBattle');
  expect(readFileSync('src/components/battle/BattleV3Game.tsx','utf8'))
   .toContain('leaveBattle');
 });
 it('apresenta instrução e permite focar uma unidade ativa',()=>{
  const onSelect=vi.fn();
  render(<BattleTurnCue system="dnd" round={4} phase="active"
   activeUnit="Dragão" canAct moves={6} attacks={2}
   needsSelection onSelectActive={onSelect}/>);
  const guidance=screen.getByRole('region',{name:'Orientação do turno · D&D'});
  expect(within(guidance).getByText(/Rodada 4/)).toBeInTheDocument();
  expect(within(guidance).getByText(/6 destinos · 2 ataques possíveis/)).toBeInTheDocument();
  fireEvent.click(within(guidance).getByRole('button',{name:'Selecionar unidade ativa'}));
  expect(onSelect).toHaveBeenCalledOnce();
 });
 it('GOT apresenta orientação de fase sem interferir em ações táticas',()=>{
  render(<BattleTurnCue system="got" round={2} phase="heroes-first"
   activeUnit="Heróis" hint="Resolver ações pessoais" canAct/>);
  expect(screen.getByText('Resolver ações pessoais')).toBeInTheDocument();
  expect(screen.queryByText(/destinos ·/)).not.toBeInTheDocument();
 });
});

describe('Lote 3 · montador D&D',()=>{
 it('oferece filtros avançados e prévia sem exibir editor privado',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  fireEvent.click(screen.getByText('Montar exércitos e ajustar cenário'));
  const preview=screen.getByRole('status',{name:'Prévia da criatura selecionada'});
  expect(within(preview).getByText(/PV/)).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Resumo do confronto D&D'})).toBeInTheDocument();
  fireEvent.click(screen.getByText('Filtros avançados de monstros'));
  fireEvent.change(screen.getByLabelText('Filtrar tamanho D&D'),
   {target:{value:'L'}});
  expect(screen.getByText('Nenhum monstro corresponde aos filtros.')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Adicionar ao atacante/})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));
  expect(screen.getByRole('button',{name:/Adicionar ao atacante/})).toBeEnabled();
  expect(screen.queryByText('Adicionar criatura original ao catálogo privado'))
   .not.toBeInTheDocument();
 });
 it('resumo acompanha pilhas duplicadas e contagem dos dois lados',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  fireEvent.click(screen.getByText('Montar exércitos e ajustar cenário'));
  const summary=screen.getByRole('region',{name:'Resumo do confronto D&D'});
  expect(within(summary).getAllByText('2/7 pilhas · 20 criaturas')).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button',{name:'Duplicar pilha'})[0]!);
  expect(within(summary).getByText('3/7 pilhas · 32 criaturas')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Defensor ·/}));
  const defense=screen.getByRole('region',{name:'Pilha D&D defensora'});
  expect(within(defense).getAllByLabelText(/Quantidade D&D/)).toHaveLength(2);
 });
});
