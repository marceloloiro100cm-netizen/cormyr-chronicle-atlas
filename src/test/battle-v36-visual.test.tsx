import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {createV3Game,v3UseCommander} from '@/lib/battle/v3/engine';
import {v36Timeline,v36Casualties,v36CommanderResources,v36CommanderIcon}
 from '@/lib/battle/v3/presentation-v36';
import {v3NewCommanderProgress} from '@/lib/battle/v3/commander-progression';
import {V3_COMMANDERS} from '@/lib/battle/v3/commanders';

const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'purple-dragon' as const,defenderCommander:'purple-dragon' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('Cruzada V3.6 — interface tática sem mutação das regras',()=>{
 it('projeta a iniciativa real e identifica previsões da próxima rodada',()=>{
  const game=createV3Game(options),timeline=v36Timeline(game.battle,14);
  expect(timeline[0]?.id).toBe(game.battle.activeUnitId);
  expect(timeline[0]?.current).toBe(true);
  expect(timeline[0]?.round).toBe(1);
  expect(timeline.slice(1).filter(x=>x.round===1).map(x=>x.id))
   .toEqual(game.battle.activationQueue.slice(0,7));
  expect(timeline.some(x=>x.round===2)).toBe(true);
  expect(new Set(timeline.map(x=>x.round+'-'+x.id)).size).toBe(timeline.length);
  expect(game.battle.events).toHaveLength(0);
 });
 it('mostra as dez insígnias originais, com cargas táticas e não mana inventada',()=>{
  expect(new Set(V3_COMMANDERS.map(c=>v36CommanderIcon(c.id))).size).toBe(10);
  const initial=v36CommanderResources('tillet',v3NewCommanderProgress(),0);
  expect(initial).toMatchObject({remaining:1,capacity:1});
  expect(v36CommanderResources('tillet',v3NewCommanderProgress(),1).remaining).toBe(0);
  const game=createV3Game(options);
  const total=v36Casualties(game.battle,'attacker');
  expect(total.casualties).toBe(0);
  expect(total.alive).toBe(total.initial);
  const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId)!;
  const id=game.commanders[active.side];
  const c=V3_COMMANDERS.find(c=>c.id===id)!;
  const target=game.battle.stacks.find(s=>s.side===(c.powerTarget==='ally'?active.side:
   active.side==='attacker'?'defender':'attacker'))!;
  const after=v3UseCommander(game,target.id);
  expect(v36CommanderResources(id,undefined,after.powerUses?.[active.side]??0).remaining).toBe(0);
 });
 it('inicia com mapa ilustrado e alterna entre visual tático e alto contraste',()=>{
  render(<BattleV3Game/>);
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const track=screen.getByRole('region',{name:'Fila de iniciativa da Cruzada'});
  expect(within(track).getAllByRole('listitem').length).toBeGreaterThan(1);
  expect(screen.getByRole('region',{name:'Comandante na mesa de guerra'}))
   .toHaveTextContent('Tendas dos Tillets');
  const switcher=screen.getByRole('group',{name:'Estilo visual do mapa'});
  const map=screen.getByRole('group',{name:/Mapa hexagonal/});
  expect(map).toHaveClass('battlefield-illustrated');
  fireEvent.click(within(switcher).getByRole('button',{name:'Alto contraste'}));
  expect(map).toHaveClass('battlefield-contrast');
  fireEvent.click(within(switcher).getByRole('button',{name:'Tático'}));
  expect(map).not.toHaveClass('battlefield-illustrated');
  expect(map).not.toHaveClass('battlefield-contrast');
  fireEvent.click(within(switcher).getByRole('button',{name:'Ilustrado'}));
  expect(map).toHaveClass('battlefield-illustrated');
 });
 it('mantém as ordens funcionais na barra inferior sem mutar casas oficiais',()=>{
  render(<BattleV3Game/>);
  fireEvent.change(screen.getByLabelText('Controle do adversário'),{target:{value:'human'}});
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const rail=screen.getByRole('region',{name:'Barra inferior de ações de batalha'});
  expect(within(rail).getByRole('button',{name:'Fim de turno'})).toBeEnabled();
  expect(within(rail).getByRole('button',{name:/Mover/})).toBeEnabled();
  const turn=screen.getByText(/Rodada 1 ·/);
  expect(turn).toBeInTheDocument();
  fireEvent.click(within(rail).getByRole('button',{name:'Fim de turno'}));
  expect(within(rail).getByRole('button',{name:'Fim de turno'})).toBeInTheDocument();
  expect(screen.getByText(/Simulação: as fichas das casas continuam intactas/)).toBeInTheDocument();
 });
});
