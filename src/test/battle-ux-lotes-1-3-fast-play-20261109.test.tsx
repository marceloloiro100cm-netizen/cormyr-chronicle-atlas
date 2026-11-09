import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {BattleNarratorHub} from '@/components/battle/BattleNarratorHub';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {BATTLE_PLAYERS_ENABLED} from '@/lib/battle/feature-flag';

afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});

describe('UX lotes 1–3 — preparação rápida e arena contextual',()=>{
 it('mostra um único início principal e preserva a Cruzada V3 como opcional',()=>{
  render(<BattleNarratorHub/>);
  expect(screen.getByRole('button',{name:'Criar batalha'})).toBeEnabled();
  expect((screen.getByRole('button',{name:'Cruzada com comandantes'})
   .closest('details') as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(screen.getByText('Mais opções'));
  expect(screen.getByRole('button',{name:'Cruzada com comandantes'})).toBeEnabled();
  expect(BATTLE_PLAYERS_ENABLED).toBe(false);
 });

 it('GOT inicia direto com exércitos-modelo sem obrigar edição das fases',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Batalhar agora'})).toBeEnabled();
  expect((screen.getByRole('button',{name:'Iniciar simulação pelo livro'})
   .closest('details') as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar agora'}));
  expect(screen.getByRole('heading',{name:'Escaramuça de treinamento'}))
   .toBeInTheDocument();
  expect(screen.getByRole('navigation',{name:'Guia de fases Game of Thrones'}))
   .toBeInTheDocument();
 });

 it('D&D inicia com o roster automático e o editor técnico recolhido',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Batalhar agora'})).toBeEnabled();
  expect((screen.getByRole('heading',{name:'Montros'})
   .closest('details') as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar agora'}));
  expect(screen.getByRole('region',{name:'Arena e comandos CRZ'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Painel de combate básico D&D'}))
   .toBeInTheDocument();
 });

 it('PTE expõe três decisões principais e executa movimento legal ao tocar o mapa',()=>{
  render(<BattleNarratorHub/>);
  fireEvent.click(screen.getByRole('button',{name:'Criar batalha'}));
  fireEvent.click(screen.getByRole('button',{name:'Iniciar combate com forças-modelo'}));
  const dialog=screen.getByRole('dialog',{name:'Batalha em tela ampliada'});
  const controls=within(dialog).getByRole('group',{name:'Ações da unidade'});
  expect(within(controls).getAllByRole('button')).toHaveLength(3);
  expect(within(dialog).getByRole('region',{name:/Orientação do turno · Adaptado/}))
   .toBeInTheDocument();
  expect(within(dialog).queryByRole('button',{name:'Mover',exact:true}))
   .not.toBeInTheDocument();
  const field=within(dialog).getByRole('region',{name:'Campo de batalha PTE'});
  const moves=within(field).getAllByRole('button',{name:/movimento permitido/});
  expect(moves.length).toBeGreaterThan(0);
  fireEvent.click(moves[0]!);
  expect(within(dialog).getByRole('region',{name:'Registro da batalha'}))
   .toHaveTextContent(/Movimento/);
 });
});
