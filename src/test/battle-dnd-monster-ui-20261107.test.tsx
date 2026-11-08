import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('Interface D&D · 17 unidades, d20 e monstros empilhados',()=>{
 it('mostra importação, de/para, pilhas e d20 rolado como padrão',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  expect(screen.getByRole('region',{name:'D&D simplificado · laboratório do Narrador'}))
   .toBeInTheDocument();
  expect(screen.getByLabelText('Importar tabela de monstros D&D'))
   .toHaveAttribute('type','file');
  const kinds=screen.getByText('Ver de/para das 17 unidades de Cormyr para D&D');
  expect(kinds).toBeInTheDocument();
  fireEvent.click(kinds);
  const table=screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(18);
  expect(within(table).getByText('Navios de guerra')).toBeInTheDocument();
  expect(within(table).getByText(/Navios exigem mapa naval/)).toBeInTheDocument();
  expect(screen.getByLabelText('Resolução CRZ')).toHaveValue('rolled');
  const own=screen.getByRole('region',{name:'Pilha D&D atacante'});
  expect(within(own).getAllByLabelText(/Perfil D&D/)).toHaveLength(2);
  fireEvent.click(within(own).getByRole('button',{name:'Adicionar pilha atacante'}));
  expect(within(own).getAllByLabelText(/Quantidade D&D/)).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Quantidade D&D attacker-stack-1'),
   {target:{value:'25'}});
  expect(screen.getByLabelText('Quantidade D&D attacker-stack-1')).toHaveValue(25);
 });
 it('inicia pilhas no tabuleiro quadrado e mostra ficha D&D inspecionável',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:/Iniciar batalha D&D/}));
  expect(screen.getByRole('region',{name:'Arena e comandos CRZ'})).toBeInTheDocument();
  expect(screen.getByText(/Batalha D&D/)).toBeInTheDocument();
  const sheet=screen.getByRole('region',{name:'Ficha D&D da pilha'});
  expect(within(sheet).getByText(/PV por criatura:/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Classe de Armadura/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Iniciativa \(d20/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Corpo a corpo:/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Quantidade empilhada:/)).toBeInTheDocument();
 });
});
