import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {miniatureCatalog} from '@/lib/battle/visual3d/demo';
import {MiniatureBoardToggle} from './MiniatureBoardToggle';
import {MiniatureDemo} from './MiniatureDemo';
import {BattleGotGame} from '../BattleGotGame';
import {BattleCrzLab} from '../BattleCrzLab';

afterEach(()=>{cleanup();vi.restoreAllMocks();window.localStorage.clear();});
const scene=miniatureCatalog();
describe('Miniaturas lotes 2–4: UX e controle de acesso',()=>{
 it('galeria completa fica isolada do motor e disponível ao Narrador',()=>{
  render(<MiniatureDemo narrator/>);
  fireEvent.click(screen.getByRole('button',{name:'Ver protótipo 3D'}));
  fireEvent.click(screen.getByRole('button',{name:'17 unidades'}));
  expect(screen.getByRole('button',{name:'17 unidades'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getAllByRole('button',{name:/Quadrado/}).length).toBeGreaterThan(10);
 });
 it('sem permissão permanece exclusivamente em 2D',()=>{
  render(<MiniatureBoardToggle allowed={false} map={scene.map}
   tokens={scene.tokens} onHexClick={vi.fn()} fallback={<p>Tabuleiro seguro 2D</p>}/>);
  expect(screen.getByText('Tabuleiro seguro 2D')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Miniaturas 3D (teste)'})).toBeNull();
 });
 it('inicia em 2D mesmo quando a sessão permite 3D',()=>{
  render(<MiniatureBoardToggle allowed map={scene.map}
   tokens={scene.tokens} onHexClick={vi.fn()} fallback={<p>Tabuleiro seguro 2D</p>}/>);
  expect(screen.getByText('Tabuleiro seguro 2D')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Mapa 2D'})).toHaveAttribute('aria-pressed','true');
 });
 it('GOT não apresenta habilitação 3D em treino de jogador',()=>{
  render(<BattleGotGame onBack={vi.fn()} playerSandbox/>);
  expect(screen.queryByRole('checkbox',{name:/Habilitar miniaturas 3D/})).toBeNull();
 });
 it('GOT permite Narrador habilitar a vista sem iniciar batalha',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  expect(screen.getByRole('checkbox',{name:/Habilitar miniaturas 3D/})).toBeInTheDocument();
 });
 it('D&D não libera 3D para treino dos jogadores',()=>{
  render(<BattleCrzLab mode="dnd" playerSandbox onBack={vi.fn()}/>);
  fireEvent.click(screen.getByText('Montar exércitos e ajustar cenário'));
  expect(screen.queryByRole('checkbox',{name:/Habilitar miniaturas 3D/})).toBeNull();
 });
 it('D&D mantém a habilitação 3D restrita ao Narrador',()=>{
  render(<BattleCrzLab mode="dnd" onBack={vi.fn()}/>);
  fireEvent.click(screen.getByText('Montar exércitos e ajustar cenário'));
  expect(screen.getByRole('checkbox',{name:/Habilitar miniaturas 3D/})).toBeInTheDocument();
 });
});
