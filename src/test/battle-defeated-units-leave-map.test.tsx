import {describe,it,expect,vi} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {CrzBoard} from '@/components/battle/BattleCrzLab';
import {createV3Game,v3PlayCommand} from '@/lib/battle/v3/engine';
import {getLegalActions,applyBattleCommand} from '@/lib/battle/domain/turns';
import {hexKey,hexNeighbors} from '@/lib/battle/geometry/hex';
import {crzReplayBegin} from '@/lib/crusade/replay';
import {crzHexKey} from '@/lib/crusade/geometry';
import {crzTrainingReady,CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';
import type {BattleState,BattleCommand} from '@/lib/battle/domain/types';

const opts={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'tillet' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};

describe('V4 · unidade destruída ou em debandada não permanece no campo',()=>{
 it('PTE/V3: oculta tanto pilhas com zero PV como tropas que abandonaram a batalha',()=>{
  const {battle}=createV3Game(opts);
  const [living,dead,routed]=battle.stacks;
  const stacks=[living!,{...dead!,currentHp:0},
   {...routed!,moraleState:'routed' as const}];
  render(<BattleBoard map={battle.map} stacks={stacks}
   activeId={living!.id} selectedId={dead!.id} hoveredId={routed!.id}
   attackKeys={[dead!.id,routed!.id]} theme="cormyr"/>);
  const map=screen.getByRole('group',{name:/Mapa hexagonal/});
  expect(within(map).getByRole('button',{name:new RegExp(living!.name)}))
   .toBeInTheDocument();
  expect(within(map).queryByRole('button',{name:new RegExp(dead!.name)}))
   .not.toBeInTheDocument();
  // Duas pilhas de Guarda da Coroa têm o mesmo nome: conferir o HEX do ID retirado.
  const routedTile=map.querySelector('[data-crz-hex="'+crzHexKey(routed!.position)+'"]');
  expect(routedTile).toBeInTheDocument();
  expect(routedTile).not.toHaveTextContent(routed!.id.slice(0,8));
  expect(routedTile?.querySelector('circle[r="16"]')).toBeNull();
  expect(map.querySelectorAll('[data-battle-hover-ring]')).toHaveLength(0);
  expect(map.querySelectorAll('[data-battle-attack-ring]')).toHaveLength(0);
  expect(map.querySelectorAll('[data-battle-selected-ring]')).toHaveLength(0);
  // O desenho não exclui os registros das unidades do estado tático.
  expect(stacks).toHaveLength(3);
  expect(stacks[1]!.currentHp).toBe(0);
  expect(stacks[2]!.moraleState).toBe('routed');
 });
 it('PTE/V3: ataque letal remove imediatamente o token, mas preserva evento e baixas',()=>{
  const game=createV3Game(opts),battle=game.battle;
  const actor=battle.stacks.find(s=>s.side==='attacker'&&s.rangeHex===1)!;
  const enemy=battle.stacks.find(s=>s.side==='defender')!;
  const occupied=new Set(battle.stacks.map(s=>hexKey(s.position)));
  const nextHex=hexNeighbors(actor.position).find(h=>
   battle.map.tiles.some(tile=>hexKey(tile)===hexKey(h)&&tile.terrain!=='rock')&&
   !occupied.has(hexKey(h)))!;
  expect(nextHex).toBeDefined();
  const positioned:BattleState={...battle,activeUnitId:actor.id,
   stacks:battle.stacks.map(s=>s.id===enemy.id?
    {...s,currentHp:1,position:nextHex}:s)};
  const command=getLegalActions(positioned).find(
   (c):c is Extract<BattleCommand,{type:'ATTACK'}>=>
    c.type==='ATTACK'&&c.targetId===enemy.id);
  expect(command).toBeDefined();
  const result=v3PlayCommand({...game,battle:positioned},command!);
  const defeated=result.battle.stacks.find(s=>s.id===enemy.id)!;
  expect(defeated.currentHp).toBe(0);
  expect(result.battle.events.some(e=>e.type==='DAMAGE'&&
   e.delta['defenderId']===enemy.id)).toBe(true);
  render(<BattleBoard map={result.battle.map} stacks={result.battle.stacks}
   activeId={result.battle.activeUnitId} theme="cormyr"/>);
  expect(within(screen.getByRole('group',{name:/Mapa hexagonal/}))
   .queryByRole('button',{name:new RegExp(enemy.name)}))
   .not.toBeInTheDocument();
  expect(result.battle.stacks).toHaveLength(battle.stacks.length);
 });
 it('PTE/V3: hexágono de tropa em debandada deixa de bloquear movimento legal',()=>{
  const {battle}=createV3Game(opts);
  const actor=battle.stacks.find(s=>s.id===battle.activeUnitId)!;
  const chosen=getLegalActions(battle).find(
   (c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE');
  expect(chosen).toBeDefined();
  const displaced=battle.stacks.find(s=>s.id!==actor.id)!;
  const retreating:BattleState={...battle,stacks:battle.stacks.map(s=>
   s.id===displaced.id?{...s,position:chosen!.to,moraleState:'routed' as const}:s)};
  expect(getLegalActions(retreating)).toContainEqual(chosen);
  const after=applyBattleCommand(retreating,chosen!);
  expect(after.stacks.find(s=>s.id===actor.id)?.position).toEqual(chosen!.to);
  expect(after.stacks.find(s=>s.id===displaced.id)?.moraleState).toBe('routed');
 });
 it('CRZ: destruição e debandada removem o token, mas não o histórico do combate',()=>{
  const state=crzReplayBegin(crzTrainingReady({
   ...CRZ_TRAINING_DEFAULTS,opponent:'human',
  })).state;
  const [living,dead,routed]=state.stacks;
  const changed={...state,stacks:state.stacks.map(s=>
   s.id===dead!.id?{...s,alive:0,hpPool:0,topHp:0,moraleState:'routed' as const}:
   s.id===routed!.id?{...s,moraleState:'routed' as const}:s)};
  render(<CrzBoard state={changed} selectedId={dead!.id}
   hoveredId={routed!.id} moves={[]} attacks={[dead!.id,routed!.id]}
   objectives={[]} onTile={vi.fn()}/>);
  const map=screen.getByRole('group',{name:/Mapa CRZ 11 por 9/});
  expect(within(map).getByRole('button',{name:new RegExp(living!.name)}))
   .toBeInTheDocument();
  expect(within(map).queryByRole('button',{name:new RegExp(dead!.name)}))
   .not.toBeInTheDocument();
  expect(within(map).queryByRole('button',{name:new RegExp(routed!.name)}))
   .not.toBeInTheDocument();
  expect(map.querySelectorAll('[data-crz-hover-ring]')).toHaveLength(0);
  expect(map.querySelectorAll('[data-crz-selected-ring]')).toHaveLength(0);
  expect(map.querySelectorAll('[data-crz-attack-ring]')).toHaveLength(0);
  expect(changed.stacks).toHaveLength(state.stacks.length);
  expect(changed.events).toEqual(state.events);
 });
});
