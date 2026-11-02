import {afterEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {GmEventos} from '@/components/gm-panels';

const events=[...Array.from({length:100},(_,i)=>({
 id:i+1,kind:'mundanos',theme:i%2?'Estradas':'Corte',
 title:'Evento mundano '+String(i+1),hook:'Gancho mundano '+String(i+1),
 a:'Escolha A',b:'Escolha B',clue:'Pista'
})),...Array.from({length:100},(_,i)=>({
 id:i+1,kind:'misticos',theme:'Magia',
 title:'Evento místico '+String(i+1),hook:'Gancho místico '+String(i+1),
 a:'Escolha A',b:'Escolha B',clue:'Pista'
}))];
vi.mock('@tanstack/react-query',()=>({
 useQuery:()=>({data:{events,adventures:[]},error:null,isPending:false}),
}));
afterEach(()=>vi.restoreAllMocks());

describe('Eventos do narrador: sorteio real dos registros da lista',()=>{
 it('sorteia de 100 mundanos e marca somente o escolhido, mantendo decisões',()=>{
  vi.spyOn(Math,'random').mockReturnValue(0.42);
  render(<GmEventos/>);
  expect(screen.getByText('100 eventos encontrados')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Evento Aleatório'}));
  const card=screen.getByRole('article',{name:'Evento sorteado: Evento mundano 43'});
  expect(within(card).getByText('Evento mundano 43')).toBeInTheDocument();
  expect(screen.queryByText('Evento mundano 44')).not.toBeInTheDocument();
  expect(screen.getByRole('status').textContent).toMatch(/Evento sorteado: Mundano nº 043/);
  expect(within(card).getByText('Decisões e consequências')).toBeInTheDocument();
 });
 it('evita repetir o último sorteio enquanto existir outra opção',()=>{
  vi.spyOn(Math,'random').mockReturnValue(0);
  render(<GmEventos/>);
  const button=screen.getByRole('button',{name:'Evento Aleatório'});
  fireEvent.click(button);
  expect(screen.getByText('Evento mundano 1')).toBeInTheDocument();
  fireEvent.click(button);
  expect(screen.getByText('Evento mundano 2')).toBeInTheDocument();
  expect(screen.queryByText('Evento mundano 1')).not.toBeInTheDocument();
 });
 it('usa apenas os 100 eventos do tipo escolhido e permite voltar à lista por filtros',()=>{
  vi.spyOn(Math,'random').mockReturnValue(0.99);
  render(<GmEventos/>);
  fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'misticos'}});
  fireEvent.click(screen.getByRole('button',{name:'Evento Aleatório'}));
  expect(screen.getByText('Evento místico 100')).toBeInTheDocument();
  expect(screen.queryByText('Evento mundano 100')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar'),{target:{value:'Evento místico 5'}});
  expect(screen.getByText('Evento místico 5')).toBeInTheDocument();
  expect(screen.getByText('11 eventos encontrados')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));
  expect(screen.getByText('100 eventos encontrados')).toBeInTheDocument();
  expect(screen.getByText('Evento mundano 1')).toBeInTheDocument();
 });
});
