import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {BattleSquareLegend} from '@/components/battle/BattleSquareLegend';
import {BattleGotGame} from '@/components/battle/BattleGotGame';
import {CrzBoard} from '@/components/battle/BattleCrzLab';
import {CRZ_TRAINING_DEFAULTS,crzTrainingReady} from '@/lib/crusade/training-demo';
import {crzReplayBegin} from '@/lib/crusade/replay';
import {SQUARE_TERRAIN_PRESENTATION,SQUARE_MAP_CONTRACT}
 from '@/lib/battle/geometry/square-presentation';

afterEach(()=>{cleanup();vi.restoreAllMocks();window.localStorage.clear();});

describe('Contrato visual comum — mapas quadrados dos três sistemas',()=>{
 it('expõe a mesma paleta, legenda de movimento e alerta de regras independentes',()=>{
  render(<BattleSquareLegend/>);
  const legend=screen.getByRole('group',{name:'Legenda comum de mapas quadrados'});
  expect(within(legend).getByText(SQUARE_MAP_CONTRACT)).toBeInTheDocument();
  expect(within(legend).getByText('Floresta')).toBeInTheDocument();
  expect(within(legend).getByText(/Verde: mover/)).toBeInTheDocument();
  expect(within(legend).getByText(/Vermelho: atacar/)).toBeInTheDocument();
  expect(SQUARE_TERRAIN_PRESENTATION.plain.color).toMatch(/^#[0-9a-f]{6}$/i);
 });
 it('Adaptado e D&D renderizam quadrados e exatamente a mesma cor base',()=>{
  const a=render(<BattleBoard map={createScenario('plain-open',11,'square')}/>);
  const aTile=a.container.querySelector('[data-battle-cell-shape="square"]');
  expect(aTile?.getAttribute('fill')).toBe(SQUARE_TERRAIN_PRESENTATION.plain.color);
  expect(a.container.querySelectorAll('[data-battle-cell-shape="hex"]')).toHaveLength(0);
  expect(within(a.container).getByRole('group',{name:'Legenda comum de mapas quadrados'}))
   .toBeInTheDocument();
  a.unmount();
  const state=crzReplayBegin(crzTrainingReady({
   ...CRZ_TRAINING_DEFAULTS,grid:'square',scenario:'plain-open',
  })).state;
  const b=render(<CrzBoard state={state} selectedId={null} hoveredId={null}
   moves={[]} attacks={[]} objectives={[]} onTile={vi.fn()}/>);
  const dndTile=b.container.querySelector('[data-crz-cell-shape="square"]');
  expect(dndTile?.getAttribute('fill')).toBe(SQUARE_TERRAIN_PRESENTATION.plain.color);
  expect(b.container.querySelectorAll('[data-crz-cell-shape="hex"]')).toHaveLength(0);
  expect(within(b.container).getByRole('group',{name:'Legenda comum de mapas quadrados'}))
   .toBeInTheDocument();
 });
 it('GOT usa a mesma legenda em tabuleiro quadrado sem trocar o motor',()=>{
  render(<BattleGotGame onBack={vi.fn()}/>);
  expect(screen.getByRole('group',{name:'Legenda comum de mapas quadrados'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Iniciar simulação pelo livro/}));
  const map=screen.getByRole('region',{name:/Mapa em quadrados/});
  expect(within(map).getByRole('group',{name:'Legenda comum de mapas quadrados'}))
   .toBeInTheDocument();
  const plain=within(map).getByRole('button',{name:/Quadrado 0,0/});
  expect(plain.getAttribute('data-terrain')).toBe('plain');
  expect(plain).toHaveAttribute('style');
 });
});
