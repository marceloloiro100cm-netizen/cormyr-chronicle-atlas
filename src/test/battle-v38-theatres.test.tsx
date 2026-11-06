import {describe,it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {BattleV3Game} from '@/components/battle/BattleV3Game';
import {createV3Game} from '@/lib/battle/v3/engine';
import {createScenario,SCENARIOS,type BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';
import {tileAt} from '@/lib/battle/geometry/terrain';
import {getLegalActions} from '@/lib/battle/domain/turns';
import {hexKey} from '@/lib/battle/geometry/hex';
import {V38_THEATRES,V38_THEATRE_VERSION,
 createV38TheatreMap,v38PathReachable,v38TileCounts,
 v38DecorationFor,v38TheatreFromMap}
 from '@/lib/battle/v3/theatres-v38';

const cases=Object.keys(SCENARIOS) as BattleScenarioId[];
const options={
 attackerHouseId:'evenhand-model',defenderHouseId:'ashkar-model',
 attackerCommander:'purple-dragon' as const,defenderCommander:'ashkar-raider' as const,
 scenario:'plain-open' as const,opponent:'human' as const,
};
describe('Cruzada V3.8 — mapas regionais gráficos e terrenos auditados',()=>{
 it('expõe cinco regiões distintas e um contrato explícito de treinamento',()=>{
  expect(V38_THEATRE_VERSION).toBe('CCA-V38-THEATRE-1');
  expect(V38_THEATRES).toHaveLength(5);
  expect(new Set(V38_THEATRES.map(t=>t.id)).size).toBe(5);
  expect(V38_THEATRES.map(t=>t.name)).toEqual([
   'Terras da Coroa','Stonelands','Dragon Coast','Volkumburgh','Terras de Ashkar',
  ]);
 });
 for(const region of V38_THEATRES){
  for(const scenario of cases){
   it(`${region.name} · ${scenario}: valida 11×9 e 15×11 sem bloquear o avanço`,()=>{
    for(const width of [11,15] as const){
     const original=createScenario(scenario,width);
     const originalCopy=JSON.stringify(original);
     const map=createV38TheatreMap(region.id,scenario,width);
     const again=createV38TheatreMap(region.id,scenario,width);
     expect(map).toEqual(again);
     expect(validateBattleMap(map)).toEqual([]);
     expect(v38PathReachable(map)).toBe(true);
     expect(map.tiles).toHaveLength(width*(width===11?9:11));
     expect(map.schemaVersion).toBe(2);
     expect(v38TheatreFromMap(map)?.id).toBe(region.id);
     expect(v38TileCounts(map).rock).toBeLessThan(map.tiles.length/3);
     for(const side of ['attacker','defender'] as const){
      expect(map.deployment[side]).toEqual(original.deployment[side]);
      for(const hex of map.deployment[side])
       expect(tileAt(map,hex)?.terrain).toBe(tileAt(original,hex)?.terrain);
     }
     expect(JSON.stringify(original)).toBe(originalCopy);
     expect(map.tiles.map(tile=>hexKey(tile))).toEqual(original.tiles.map(tile=>hexKey(tile)));
    }
   });
  }
 }
 it('distingue obstáculos bloqueadores de detalhes meramente decorativos',()=>{
  for(const theatre of V38_THEATRES){
   const map=createV38TheatreMap(theatre.id,'border-hills');
   const decorated=map.tiles.filter(t=>v38DecorationFor(map,t)!=='none');
   expect(decorated.length).toBeGreaterThan(3);
   for(const tile of decorated){
    const deco=v38DecorationFor(map,tile);
    if(['palisade','rock-wall','basalt'].includes(deco))
     expect(tile.terrain).toBe('rock');
    if(deco==='dunes')expect(tile.terrain).toBe('hill');
   }
  }
  expect(v38TheatreFromMap(createScenario('plain-open'))).toBeNull();
 });
 it('a arena V3.8 gera mapas fictícios e mantém a iniciativa e as ações legais',()=>{
  for(const theatre of V38_THEATRES){
   const game=createV3Game({...options,theatre:theatre.id});
   expect(game.mode).toBe('PTE-3.0-SANDBOX');
   expect(game.battle.phase).toBe('active');
   expect(game.battle.map.id).toBe('v38-'+theatre.id+'-plain-open');
   expect(game.battle.stacks.every(s=>s.source.kind==='fictional')).toBe(true);
   expect(game.battle.stacks.every(s=>s.position&&
    tileAt(game.battle.map,s.position)?.terrain!=='rock')).toBe(true);
   expect(game.battle.activeUnitId).toBeTruthy();
   expect(getLegalActions(game.battle).some(c=>c.type==='END_ACTIVATION')).toBe(true);
  }
  expect(createV3Game(options).battle.map.id).toBe('plain-open');
 });
 it('seleciona a região na preparação e apresenta os elementos regionais no mapa',()=>{
  const {container}=render(<BattleV3Game/>);
  const chooser=within(screen.getByRole('region',{name:'Teatros temáticos de Cormyr'}));
  const selected=chooser.getByRole('button',{name:/Terras de Ashkar/});
  fireEvent.click(selected);
  expect(selected).toHaveAttribute('aria-pressed','true');
  expect(chooser.getByRole('status')).toHaveTextContent('obstáculos rochosos');
  fireEvent.click(screen.getByRole('button',{name:'Batalhar'}));
  const map=screen.getByRole('group',{name:/Mapa hexagonal/});
  expect(map).toHaveClass('battlefield-illustrated');
  expect(screen.getByRole('note')).toHaveTextContent('Terras de Ashkar');
  expect(container.querySelectorAll('.crusade-v38-decoration').length).toBeGreaterThan(0);
  expect(screen.getByText(/Simulação: as fichas das casas continuam intactas/)).toBeInTheDocument();
 });
 it('não modifica partidas base ou mapas de outros jogadores sem teatro selecionado',()=>{
  const first=createV3Game(options);
  const second=createV3Game({...options,theatre:'crownlands'});
  const third=createV3Game(options);
  expect(first).toEqual(third);
  expect(second.battle.map).not.toEqual(first.battle.map);
  expect(first.battle.map.id).toBe(options.scenario);
  expect(second.battle.map.schemaVersion).toBe(first.battle.map.schemaVersion);
 });
});
