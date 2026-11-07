import {beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import type {BattleStack} from '@/lib/battle/domain/types';
import {BattleSourcePicker} from '@/components/battle/BattleSourcePicker';

const mocked=vi.hoisted(()=>({
 houses:vi.fn(),units:vi.fn(),snapshot:vi.fn(),
}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(func:unknown)=>func}));
vi.mock('@/lib/battle/adapters/readonly-source.functions',()=>({
 listBattleSourceHouses:mocked.houses,
 listBattleSourceUnits:mocked.units,
 previewBattleSourceStack:mocked.snapshot,
}));

const army=[
 {id:'u1',name:'Guarda da Fênix',types:['infantry'],training:'trained',
  strength:100,casualties:10,destroyed:false},
 {id:'u2',name:'Arqueiros de Cinzaria',types:['archers'],training:'veteran',
  strength:60,casualties:0,destroyed:false},
 {id:'u3',name:'Navios do Lago',types:['warships'],training:'trained',
  strength:40,casualties:0,destroyed:false},
 {id:'u4',name:'Batedores Mistos',types:['scouts','archers'],training:'trained',
  strength:30,casualties:0,destroyed:false},
];
beforeEach(()=>{
 mocked.houses.mockReset().mockResolvedValue([
  {id:'ashkar',name:'Ashkar',region:'dragoncoast',crest:'assets/dragoncoast-ashkar.webp'},
  {id:'phelles',name:'Phelles',region:'crownlands',crest:'assets/crownlands-phelles.webp'},
 ]);
 mocked.units.mockReset().mockResolvedValue({
  houseId:'ashkar',sourceVersion:8,sourceStatus:'recorded',units:army,
 });
 mocked.snapshot.mockReset().mockImplementation(async({data}:{data:{
  houseId:string;unitId:string;side:string;primaryTypeId:string;
 }})=>({
  id:'copied-'+data.unitId,side:data.side,name:army.find(x=>x.id===data.unitId)?.name,
  source:{kind:'house-readonly',houseId:data.houseId,unitId:data.unitId,
   sourceVersion:8},primaryTypeId:data.primaryTypeId,
 }));
});

async function selectAshkar(){
 await screen.findByRole('option',{name:'Dragon Coast (1)'});
 fireEvent.change(screen.getByLabelText('Região das casas'),{target:{value:'dragoncoast'}});
 expect(screen.getByRole('option',{name:'Ashkar'})).toBeInTheDocument();
 expect(screen.queryByRole('option',{name:'Phelles'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Casa de origem militar'),{target:{value:'ashkar'}});
 await screen.findByRole('list',{name:'Unidades carregadas da casa'});
}

describe('Seletor militar · Região → Casa → Exército',()=>{
 it('carrega automaticamente unidades da casa, com nomes e efetivos sem inventar tropas',async()=>{
  render(<BattleSourcePicker onAdd={vi.fn(()=>true)} onAddMany={vi.fn(()=>true)}/>);
  await selectAshkar();
  expect(mocked.units).toHaveBeenCalledWith({data:{houseId:'ashkar'}});
  const list=screen.getByRole('list',{name:'Unidades carregadas da casa'});
  expect(within(list).getByText('Guarda da Fênix')).toBeInTheDocument();
  expect(within(list).getByText('90')).toBeInTheDocument();
  expect(screen.getByRole('img',{name:'Brasão da Casa Ashkar'}))
   .toHaveAttribute('src','/cormyr/assets/dragoncoast-ashkar.webp');
  expect(screen.getByLabelText('Selecionar Navios do Lago')).toBeDisabled();
  expect(screen.getByLabelText('Selecionar Batedores Mistos')).toBeDisabled();
  expect(screen.getByLabelText('Selecionar Guarda da Fênix')).toBeChecked();
  expect(screen.getByLabelText('Selecionar Arqueiros de Cinzaria')).toBeChecked();
 });
 it('importa as duas tropas permitidas como snapshots, sem escrever na origem',async()=>{
  const onAddMany=vi.fn((_stacks:BattleStack[],_houseName:string)=>true);
  render(<BattleSourcePicker onAdd={vi.fn(()=>true)} onAddMany={onAddMany}/>);
  await selectAshkar();
  fireEvent.click(screen.getByRole('button',{name:'Carregar 2 unidades na batalha'}));
  await waitFor(()=>expect(onAddMany).toHaveBeenCalledOnce());
  const [stacks,name]=onAddMany.mock.calls[0]!;
  expect(name).toBe('Ashkar');
  expect(stacks).toHaveLength(2);
  expect(stacks.map(s=>s.source.unitId)).toEqual(['u1','u2']);
  expect(mocked.snapshot).toHaveBeenCalledTimes(2);
  expect(mocked.snapshot.mock.calls[0]![0].data).toMatchObject({
   houseId:'ashkar',side:'attacker',unitId:'u1',primaryTypeId:'infantry',
  });
  expect(await screen.findByText(/2 unidades copiadas para o exército/)).toBeInTheDocument();
 });
 it('respeita vagas de cada lado e não ultrapassa o limite do módulo',async()=>{
  render(<BattleSourcePicker onAdd={vi.fn(()=>true)} onAddMany={vi.fn(()=>true)}
   remainingBySide={{attacker:1,defender:5}}/>);
  await selectAshkar();
  expect(screen.getByRole('button',{name:'Carregar 1 unidades na batalha'}))
   .toBeEnabled();
  expect(screen.getByText(/1 vagas disponíveis/)).toBeInTheDocument();
 });
 it('Casa histórica sem ficha militar não cria unidades fictícias',async()=>{
  mocked.units.mockResolvedValue({houseId:'phelles',sourceVersion:null,
   sourceStatus:'no-military-sheet',units:[]});
  render(<BattleSourcePicker onAdd={vi.fn(()=>true)} onAddMany={vi.fn(()=>true)}/>);
  await screen.findByRole('option',{name:'Crownlands (1)'});
  fireEvent.change(screen.getByLabelText('Região das casas'),{target:{value:'crownlands'}});
  fireEvent.change(screen.getByLabelText('Casa de origem militar'),{target:{value:'phelles'}});
  expect(await screen.findByText(/sem ficha militar importada/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Carregar 0 unidades na batalha'}))
   .toBeDisabled();
  expect(mocked.snapshot).not.toHaveBeenCalled();
 });
 it('importa os exércitos de cenário da planilha sem dizer que foram comprados',async()=>{
  mocked.units.mockResolvedValue({
   houseId:'ashkar',sourceVersion:null,sourceStatus:'scenario-roster',
   units:[{...army[0],id:'1k8vvnu2V1cD73zkeQlnqE81Z6dpUaOfK:painel:32',
    sourceStatus:'Compra proposta'}],
  });
  render(<BattleSourcePicker onAdd={vi.fn(()=>true)} onAddMany={vi.fn(()=>true)}/>);
  await selectAshkar();
  expect(screen.getByText(/Unidades da planilha carregadas para batalha/))
   .toBeInTheDocument();
  expect(screen.getByText(/sem compra, custo ou baixa oficial/))
   .toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Casa Selecionada'}))
   .toBeInTheDocument();
  expect(screen.getByText(/Exército documental de treinamento/))
   .toBeInTheDocument();
  expect(screen.getByText(/Compra proposta/)).toBeInTheDocument();
 });

});
