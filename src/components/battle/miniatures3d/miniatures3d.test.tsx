import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {miniatureDemo} from '@/lib/battle/visual3d/demo';
import {V3MiniatureBoard} from './V3MiniatureBoard';
import {MiniatureDemo} from './MiniatureDemo';
import {BattleV3Game} from '../BattleV3Game';

vi.mock('./MiniatureScene',()=>({default:({onHexClick,onFailure}:any)=><div data-testid="canvas-mock">
 <button onClick={()=>onHexClick({q:4,r:2})}>Quadrado mock</button>
 <button onClick={onFailure}>Perder contexto mock</button>
</div>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const {map}=miniatureDemo();
describe('V3 3D: opt-in e fallback',()=>{
 it('inicia em 2D e não solicita WebGL',()=>{
  const get=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  render(<V3MiniatureBoard narrator sessionEnabled map={map}/>);
  expect(screen.getByRole('group',{name:/Mapa quadrado com 11/})).toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();expect(screen.queryByTestId('canvas-mock')).toBeNull();
 });
 it('jogador nunca recebe o controle 3D',()=>{
  render(<V3MiniatureBoard narrator={false} sessionEnabled map={map}/>);
  expect(screen.queryByRole('button',{name:'Miniaturas 3D (teste)'})).toBeNull();
 });
 it('sem WebGL retorna ao mapa 2D acessível',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const click=vi.fn();render(<V3MiniatureBoard narrator sessionEnabled map={map} onHexClick={click}/>);
  fireEvent.click(screen.getByRole('button',{name:'Miniaturas 3D (teste)'}));
  await waitFor(()=>expect(screen.getByText(/3D indisponível/)).toBeInTheDocument());
  fireEvent.keyDown(screen.getByRole('button',{name:/Quadrado 0, 0;/}),{key:'Enter'});
  expect(click).toHaveBeenCalledWith({q:0,r:0});
 });
 it('renderer mock encaminha o callback original e recupera contexto perdido',async()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({getExtension:()=>null} as any);
  const click=vi.fn();render(<V3MiniatureBoard narrator sessionEnabled map={map} onHexClick={click}/>);
  fireEvent.click(screen.getByRole('button',{name:'Miniaturas 3D (teste)'}));
  fireEvent.click(await screen.findByRole('button',{name:'Quadrado mock'}));
  expect(click).toHaveBeenCalledWith({q:4,r:2});
  fireEvent.click(screen.getByRole('button',{name:'Perder contexto mock'}));
  expect(screen.getByRole('group',{name:/Mapa quadrado com/})).toBeInTheDocument();
 });
 it('demo e habilitação não aparecem para jogadores',()=>{
  render(<MiniatureDemo narrator={false}/>);expect(screen.queryByText('Ver protótipo 3D')).toBeNull();
  render(<BattleV3Game/>);expect(screen.queryByRole('checkbox',{name:/Habilitar miniaturas/})).toBeNull();
 });
 it('V3 mantém inspector e arena ampliada em 2D, sem a habilitação 3D por sessão',()=>{
  render(<BattleV3Game narrator/>);
  expect(screen.queryByRole('checkbox',{name:/Habilitar miniaturas/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  expect(screen.getByRole('dialog',{name:'Batalha em tela ampliada'})).toBeInTheDocument();
  expect(screen.getByRole('group',{name:/Mapa quadrado com/})).toBeInTheDocument();
  expect(screen.queryByTestId('canvas-mock')).toBeNull();
  expect(screen.getByRole('region',{name:'Campo de batalha V3'}).querySelector('.crusade-v4-inspector')).not.toBeNull();
 });
});