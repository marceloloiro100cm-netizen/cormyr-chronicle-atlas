import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {BattleCrzLab} from '@/components/battle/BattleCrzLab';
import {DND_CORMYR_300_STORAGE_KEY} from '@/lib/crusade/dnd-cormyr-300';
import {dndMilitaryTemplateId} from '@/lib/crusade/dnd-military';

afterEach(()=>{cleanup();window.localStorage.clear();vi.restoreAllMocks();});
describe('Interface D&D · seleção concentrada e implantação automática',()=>{
 it('esconde importações, cadastro privado e implantação manual, preservando de/para e d20',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  expect(screen.getByRole('region',{name:'D&D simplificado · laboratório do Narrador'}))
   .toBeInTheDocument();
  fireEvent.click(screen.getByText('Montar exércitos e ajustar cenário'));
  expect(screen.getByRole('heading',{name:'Montros'})).toBeInTheDocument();
  expect(screen.queryByLabelText('Importar tabela de monstros D&D')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Importar mapa quadrado D&D')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Importar catálogo Cormyr 300')).not.toBeInTheDocument();
  expect(screen.queryByText('Adicionar criatura original ao catálogo privado'))
   .not.toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'Implantação manual D&D'}))
   .not.toBeInTheDocument();
  expect(screen.queryByText(/D&D V3: cada quadrado equivale/)).not.toBeInTheDocument();
  const kinds=screen.getByText('Ver de/para das 17 unidades de Cormyr para D&D');
  fireEvent.click(kinds);
  const table=screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(18);
  expect(within(table).getByText('Navios de guerra')).toBeInTheDocument();
  expect(screen.getByLabelText('Resolução CRZ')).toHaveValue('rolled');
  const own=screen.getByRole('region',{name:'Pilha D&D atacante'});
  expect(within(own).getAllByLabelText(/Quantidade D&D/)).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Monstro D&D para adicionar'),
   {target:{value:dndMilitaryTemplateId('archers')}});
  fireEvent.change(screen.getByLabelText('Quantidade de monstros D&D'),
   {target:{value:'25'}});
  fireEvent.click(screen.getByRole('button',{name:/Adicionar ao atacante/}));
  expect(within(own).getAllByLabelText(/Quantidade D&D/)).toHaveLength(3);
  expect(screen.getByLabelText('Quantidade D&D attacker-catalog-1')).toHaveValue(25);
  fireEvent.click(screen.getByRole('button',{name:/Defensor ·/}));
  const defense=screen.getByRole('region',{name:'Pilha D&D defensora'});
  expect(within(defense).getAllByLabelText(/Quantidade D&D/)).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:/Adicionar ao defensor/}));
  expect(within(defense).getAllByLabelText(/Quantidade D&D/)).toHaveLength(3);
 });
 it('filtra as 300 criaturas e seleciona uma delas para qualquer lado no mesmo painel',()=>{
  const groups=['Dragões','Goblinoides','Humanoides','Constructos','Mortos-vivos'];
  const monsters=Array.from({length:300},(_,i)=>({
   id:'test-'+String(i+1).padStart(3,'0'),
   name:'Criatura '+String(i+1).padStart(3,'0'),group:groups[i%5],
   source:'Fonte de teste',challenge_rating:1,hp:12,ac:14,size:'M',
   speed_ft:30,melee:{name:'Golpe',bonus:3,damage:'1d6+2'},ranged:null,
  }));
  window.localStorage.setItem(DND_CORMYR_300_STORAGE_KEY,JSON.stringify({
   metadata:{catalog:'Teste privado',count:300,version:1},monsters,
  }));
  render(<BattleCrzLab mode="dnd"/>);
  fireEvent.click(screen.getByText('Montar exércitos e ajustar cenário'));
  expect(screen.getByText(/300 monstros disponíveis para seleção/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Grupo de monstros D&D'),
   {target:{value:'Mortos-vivos'}});
  fireEvent.change(screen.getByLabelText('Buscar monstro D&D'),
   {target:{value:'Criatura 005'}});
  expect(screen.getByLabelText('Monstro D&D para adicionar'))
   .toHaveValue('cy-test-005|local');
  fireEvent.click(screen.getByRole('button',{name:/Defensor ·/}));
  fireEvent.change(screen.getByLabelText('Quantidade de monstros D&D'),
   {target:{value:'13'}});
  fireEvent.click(screen.getByRole('button',{name:/Adicionar ao defensor/}));
  const defense=screen.getByRole('region',{name:'Pilha D&D defensora'});
  expect(within(defense).getByText('Criatura 005')).toBeInTheDocument();
  expect(screen.getByLabelText('Quantidade D&D defender-catalog-1')).toHaveValue(13);
 });
 it('inicia batalha com pilhas automaticamente posicionadas e mostra a ficha tática',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar agora'}));
  expect(screen.getByRole('region',{name:'Arena e comandos CRZ'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'Painel de combate básico D&D'}))
   .toBeInTheDocument();
  expect(screen.queryByLabelText('Magia do General')).not.toBeInTheDocument();
  const sheet=screen.getByRole('region',{name:'Ficha D&D da pilha'});
  expect(within(sheet).getByText(/PV por criatura:/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Classe de Armadura/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Iniciativa \(d20/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Corpo a corpo:/)).toBeInTheDocument();
  expect(within(sheet).getByText(/Quantidade empilhada:/)).toBeInTheDocument();
 });
});
