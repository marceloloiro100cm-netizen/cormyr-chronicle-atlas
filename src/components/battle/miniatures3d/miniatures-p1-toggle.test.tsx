import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MiniatureBoardToggle} from './MiniatureBoardToggle';
import {miniatureDemo} from '@/lib/battle/visual3d/demo';

// No WebGL needed to verify state/permission, the engine callback stays external.
vi.mock('./MiniatureViewport',()=>({
 MiniatureViewport:({selectedId,onHexClick}:{
  selectedId?:string|null;onHexClick?:(hex:{q:number;r:number})=>void;
 })=><div data-testid="p1-3d-view">
  <span>Unidade selecionada: {selectedId}</span>
  <button onClick={()=>onHexClick?.({q:3,r:3})}>Selecionar no 3D</button>
 </div>,
}));
afterEach(()=>{cleanup();});
const demo=miniatureDemo();
function board(allowed:boolean,click=vi.fn()){
 return <MiniatureBoardToggle allowed={allowed} map={demo.map}
  tokens={demo.tokens} selectedId="demo-infantry" onHexClick={click}
  fallback={<div data-testid="p1-2d-view">Tabuleiro 2D</div>}/>;
}
describe('P1: troca segura 2D/3D',()=>{
 it('preserva unidade selecionada e encaminha o mesmo clique ao responsável',()=>{
  const click=vi.fn();
  render(board(true,click));
  fireEvent.click(screen.getByRole('button',{name:'Miniaturas 3D (teste)'}));
  expect(screen.getByText('Unidade selecionada: demo-infantry')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Selecionar no 3D'}));
  expect(click).toHaveBeenCalledWith({q:3,r:3});
  fireEvent.click(screen.getByRole('button',{name:'Mapa 2D'}));
  expect(screen.getByTestId('p1-2d-view')).toBeInTheDocument();
 });
 it('revoga 3D imediatamente, sem reativação automática em outra sessão',()=>{
  const {rerender}=render(board(true));
  fireEvent.click(screen.getByRole('button',{name:'Miniaturas 3D (teste)'}));
  expect(screen.getByTestId('p1-3d-view')).toBeInTheDocument();
  rerender(board(false));
  expect(screen.getByTestId('p1-2d-view')).toBeInTheDocument();
  rerender(board(true));
  expect(screen.getByTestId('p1-2d-view')).toBeInTheDocument();
  expect(screen.queryByTestId('p1-3d-view')).toBeNull();
 });
});
