import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SpyPlayerDossiers} from '@/components/house/espionage/spy-dossier-panel';

const state=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/espionage/spy-dossier.functions',()=>({
 readSpyDossiersBrowser:state.read,
 readSpyIntelligenceOptionsBrowser:vi.fn(),
 readSpyIntelligencePendingBrowser:vi.fn(),
 adjustSpyIntelligence:vi.fn(),
 retrySpyIntelligence:vi.fn(),
}));
afterEach(()=>{cleanup();state.read.mockReset();});

const dossier={
 id:'d2d7368a-5c91-4392-8f45-76a70b17f6b3',
 ownerHouseId:'goldfin',targetHouseId:'harcourt',
 ownerHouseName:'Goldfin',targetHouseName:'Harcourt',
 targetRegion:'horselands',updatedAt:'2026-11-04T18:00:00.000Z',
 findings:[
  {id:'4a85e7fd-5541-4c15-b092-4e8ea89dc27c',objective:'house_resources',
   key:'defense',snapshot:{value:35},discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
  {id:'93788c0b-08e9-43d9-826b-f90ee14e5128',objective:'house_resources',
   key:'law',snapshot:{value:28},discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
  {id:'82ec9b4e-85fa-44b4-9e6b-942d6a2f23cc',objective:'house_resources',
   key:'wealth',snapshot:{value:41},discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
  {id:'5b6283fa-d06c-46d8-992d-68c571683bf4',objective:'army',
   key:'guard-1',snapshot:{name:'Guarda de Harcourt',types:['Infantaria'],strength:100},
   discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
  {id:'dc846bdd-1f87-438d-8aab-a2d7b65c14dd',objective:'possessions',
   key:'holding:castle-1',snapshot:{name:'Castelo de Harcourt',category:'fortification'},
   discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
 ],
 history:[],adminHistory:[],
};
const mount=(houseId='goldfin')=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}>
  <SpyPlayerDossiers houseId={houseId}/>
 </QueryClientProvider>);
};
describe('Dossiês · contrato visual do jogador e ausência de inventário total',()=>{
 it('consulta apenas a Casa selecionada e mostra os sete atributos sem preencher os ocultos',async()=>{
  state.read.mockResolvedValue([dossier]);mount();
  expect((await screen.findAllByText('Casa Harcourt')).length).toBeGreaterThan(0);
  expect(state.read).toHaveBeenCalledWith('goldfin');
  expect(screen.getByText('Recursos: 3/7')).toBeInTheDocument();
  expect(screen.getAllByText('Desconhecido')).toHaveLength(4);
  expect(screen.getByText('35')).toBeInTheDocument();
  expect(screen.queryByText('500')).toBeNull();
 });
 it('separa Exército e Posses em abas e nunca informa total real',async()=>{
  state.read.mockResolvedValue([dossier]);mount();
  await screen.findAllByText('Casa Harcourt');
  fireEvent.click(screen.getByRole('button',{name:/^Exército \(1\)$/}));
  expect(screen.getByText('Guarda de Harcourt')).toBeInTheDocument();
  expect(screen.getByText('Força registrada: 100')).toBeInTheDocument();
  expect(screen.getByText(/quantidade real de unidades militares/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/^Posses \(1\)$/}));
  expect(screen.getByText('Castelo de Harcourt')).toBeInTheDocument();
  expect(screen.queryByText('Guarda de Harcourt')).toBeNull();
  expect(screen.getByText(/quantidade real de posses/)).toBeInTheDocument();
 });
 it('permite atualizar os dossiês após uma decisão oficial sem trocar de Casa',async()=>{
  state.read.mockResolvedValue([dossier]);mount();
  await screen.findByRole('button',{name:'Atualizar dossiês'});
  expect(state.read).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Atualizar dossiês'}));
  await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));
  expect(state.read).toHaveBeenLastCalledWith('goldfin');
 });
 it('pagina muitos dossiês e aplica filtro sem expor registros de outras páginas',async()=>{
  const list=Array.from({length:13},(_,i)=>({
   ...dossier,id:`dossier-${i}`,
   targetHouseName:`Harcourt ${String(i+1).padStart(2,'0')}`,
  }));
  state.read.mockResolvedValue(list);mount();
  await screen.findByText('Página 1 de 2');
  expect(screen.queryByText('Casa Harcourt 13')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Próxima'}));
  expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  expect(screen.getAllByText('Casa Harcourt 13').length).toBeGreaterThan(0);
  fireEvent.change(screen.getByPlaceholderText('Pesquisar casa nobre'),{
   target:{value:'Harcourt 01'},
  });
  expect(screen.getByText('1 dossiê(s) encontrado(s)')).toBeInTheDocument();
  expect(screen.queryByText('Página 2 de 2')).toBeNull();
  expect(screen.queryByText('Casa Harcourt 13')).toBeNull();
 });
 it('não apresenta dossiês que a RPC não retornou',async()=>{
  state.read.mockResolvedValue([]);mount('ashkar');
  await screen.findByText(/Nenhum dossiê encontrado/);
  expect(state.read).toHaveBeenCalledWith('ashkar');
  expect(screen.queryByText('Casa Harcourt')).toBeNull();
 });
});
