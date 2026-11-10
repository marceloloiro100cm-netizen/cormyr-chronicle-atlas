import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MiniatureViewport} from './MiniatureViewport';
import {miniatureDemo} from '@/lib/battle/visual3d/demo';

vi.mock('./MiniatureScene',()=>({default:({onHexClick,onFailure}:{
 onHexClick:(hex:{q:number;r:number})=>void;onFailure:()=>void;
})=><section data-testid="p0-scene-mock">
 <button onClick={()=>onHexClick({q:4,r:2})}>Destino verde mock</button>
 <button onClick={()=>onHexClick({q:6,r:6})}>Alvo vermelho mock</button>
 <button onClick={()=>onHexClick({q:3,r:3})}>Inspecionar unidade mock</button>
 <button onClick={onFailure}>Falha WebGL mock</button>
 </section>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const demo=miniatureDemo();

function show(props:Partial<React.ComponentProps<typeof MiniatureViewport>>={}){
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as any);
 const onHexClick=props.onHexClick??vi.fn();
 const rendered=render(<MiniatureViewport map={demo.map} tokens={demo.tokens}
  activeId="demo-infantry" selectedId="demo-infantry"
  moveKeys={['4,2']} attackKeys={['demo-goblin']}
  canIssueCommands onHexClick={onHexClick}
  fallback={<div>Tabuleiro 2D preservado</div>}
  {...props}/>);
 return {onHexClick,rendered};
}
describe('P0 do mapa 3D — segurança e gerenciamento',()=>{
 it('não envia movimento legal até confirmação explícita',async()=>{
  const click=vi.fn();show({onHexClick:click});
  fireEvent.click(await screen.findByRole('button',{name:'Destino verde mock'}));
  expect(click).not.toHaveBeenCalled();
  expect(screen.getByRole('group',{name:'Confirmar comando 3D'})).toBeInTheDocument();
  expect(screen.getByText(/Mover para Quadrado 4,2/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Confirmar movimento'}));
  expect(click).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledWith({q:4,r:2});
 });
 it('permite cancelar ataque, sem chamar motor de batalha',async()=>{
  const click=vi.fn();show({onHexClick:click});
  fireEvent.click(await screen.findByRole('button',{name:'Alvo vermelho mock'}));
  expect(screen.getByText(/Atacar Goblin/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(click).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:'Confirmar ataque'})).toBeNull();
 });
 it('ação legal de habilidade é nomeada corretamente, sem confundir com ataque',async()=>{
  const click=vi.fn();show({targetAction:'ability',onHexClick:click});
  fireEvent.click(await screen.findByRole('button',{name:'Alvo vermelho mock'}));
  expect(screen.getByRole('button',{name:'Confirmar habilidade'})).toBeInTheDocument();
  expect(click).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Confirmar habilidade'}));
  expect(click).toHaveBeenCalledWith({q:6,r:6});
 });
 it('selecionar ou inspecionar uma unidade continua sendo um clique simples',async()=>{
  const click=vi.fn();show({onHexClick:click});
  fireEvent.click(await screen.findByRole('button',{name:'Inspecionar unidade mock'}));
  expect(click).toHaveBeenCalledWith({q:3,r:3});
  expect(screen.queryByRole('group',{name:'Confirmar comando 3D'})).toBeNull();
 });
 it('revogação de ação legal descarta a confirmação pendente',async()=>{
  const click=vi.fn();const {rendered}=show({onHexClick:click});
  fireEvent.click(await screen.findByRole('button',{name:'Destino verde mock'}));
  expect(screen.getByRole('button',{name:'Confirmar movimento'})).toBeInTheDocument();
  rendered.rerender(<MiniatureViewport map={demo.map} tokens={demo.tokens}
   activeId="demo-infantry" selectedId="demo-infantry"
   moveKeys={[]} attackKeys={[]} canIssueCommands={false}
   onHexClick={click} fallback={<div>Tabuleiro 2D preservado</div>}/>);
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Confirmar movimento'})).toBeNull());
  expect(click).not.toHaveBeenCalled();
 });
 it('foco na unidade ativa não modifica as regras e tem retorno para centralizar',async()=>{
  const click=vi.fn();show({onHexClick:click});
  fireEvent.click(await screen.findByRole('button',{name:'Focar unidade ativa 3D'}));
  expect(screen.getByText(/Câmera focada em Infantaria/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Superior'}));
  fireEvent.click(screen.getByRole('button',{name:'Centralizar câmera 3D'}));
  expect(screen.getByText(/Mapa centralizado/)).toBeInTheDocument();
  expect(click).not.toHaveBeenCalled();
 });
 it('quando o contexto WebGL falha mantém os dados visíveis no 2D',async()=>{
  show();
  fireEvent.click(await screen.findByRole('button',{name:'Falha WebGL mock'}));
  expect(screen.getByText('Tabuleiro 2D preservado')).toBeInTheDocument();
  expect(screen.getByText(/3D indisponível neste dispositivo/)).toBeInTheDocument();
 });
});
