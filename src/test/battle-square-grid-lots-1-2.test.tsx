import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';
import {gridNeighbors,gridDistance,gridToOffset} from '@/lib/battle/geometry/grid';
import {findPath} from '@/lib/battle/geometry/pathfinding';
import {lineOfSight} from '@/lib/battle/geometry/visibility';
import {BattleBoard} from '@/components/battle/BattleBoard';
import {crzScenario,crzGridDistance,crzGridNeighbors,crzReachable,crzLineOfSight}
 from '@/lib/crusade/geometry';
import {crzPreset,crzRulesetHash,crzRequireKnownRuleset,CRZ_APPROVED_HASHES}
 from '@/lib/crusade/ruleset';
import {crzTrainingReady,CRZ_TRAINING_DEFAULTS} from '@/lib/crusade/training-demo';
import {crzReplayBegin,crzReplayRecord,crzVerifyReplay} from '@/lib/crusade/replay';
import {crzLegalCommands} from '@/lib/crusade/turns';

describe('Cormyr · Lotes 1–2 · migração de malha para quadrados',()=>{
 it('gera cenários quadrados válidos em 11×9 e 15×11, com 8 vizinhos',()=>{
  for(const width of [11,15] as const){
   for(const id of ['plain-open','contested-woods','border-hills','narrow-passage'] as const){
    const map=createScenario(id,width,'square');
    expect(map.grid).toBe('square');
    expect(validateBattleMap(map)).toEqual([]);
    expect(map.tiles).toHaveLength(map.width*map.height);
    expect(gridToOffset(map,{q:3,r:4})).toEqual({column:3,row:4});
    expect(gridNeighbors(map,{q:3,r:4})).toHaveLength(8);
    expect(gridDistance(map,{q:2,r:2},{q:4,r:4})).toBe(2);
   }
  }
 });
 it('mantém o formato hexadecimal histórico quando grid estiver ausente',()=>{
  const map=createScenario('plain-open');
  expect(map.grid).toBeUndefined();
  expect(gridNeighbors(map,map.tiles[40]!)).toHaveLength(6);
  expect(validateBattleMap(map)).toEqual([]);
 });
 it('cobra diagonal 1,5 e impede atravessar canto bloqueado',()=>{
  const original=createScenario('plain-open',11,'square');
  const from={q:2,r:2},to={q:3,r:3};
  expect(findPath(original,from,to,2)?.cost).toBe(1.5);
  expect(findPath(original,from,to,1)).toBeNull();
  const map={...original,tiles:original.tiles.map(t=>
   t.q===3&&t.r===2||t.q===2&&t.r===3?{...t,terrain:'rock' as const}:t)};
  expect(findPath(map,from,to,2)).toBeNull();
 });
 it('não permite disparo através de cobertura de esquina no quadrado',()=>{
  const original=createScenario('plain-open',11,'square');
  const a={q:2,r:2},b={q:4,r:4};
  expect(lineOfSight(original,a,b).clear).toBe(true);
  const blocked={...original,tiles:original.tiles.map(t=>t.q===3&&t.r===2?
   {...t,terrain:'rock' as const}:t)};
  expect(lineOfSight(blocked,a,b).clear).toBe(false);
 });
 it('desenha quadrados SVG sem alterar o tabuleiro legado',()=>{
  const {unmount}=render(<BattleBoard map={createScenario('plain-open',11,'square')}/>);
  const square=screen.getByRole('group',{name:/Mapa quadrado com/});
  expect(square.querySelectorAll('[data-battle-hex] > rect')).toHaveLength(99);
  unmount();
  const {container}=render(<BattleBoard map={createScenario('plain-open')}/>);
  expect(container.querySelectorAll('.battle-hex > polygon')).toHaveLength(99);
 });
 it('CRZ: valida malha quadrada, diagonal e bloqueio de tiro',()=>{
  const map=crzScenario('plain-open',11,'square');
  expect(map.grid).toBe('square');
  expect(crzGridNeighbors(map,{q:2,r:2})).toHaveLength(8);
  expect(crzGridDistance(map,{q:2,r:2},{q:3,r:3})).toBe(1);
  expect(crzReachable(map,{q:2,r:2},2).find(p=>p.to.q===3&&p.to.r===3)?.cost).toBe(1.5);
  const blocked={...map,tiles:map.tiles.map(t=>t.q===3&&t.r===2?
   {...t,terrain:'rock' as const}:t)};
  expect(crzLineOfSight(blocked,{q:2,r:2},{q:4,r:4})).toBe(false);
 });
 it('CRZ: hashes hex legados permanecem válidos e replay square verifica',()=>{
  const old=crzPreset('CRZ-5E');
  expect(crzRulesetHash(old)).toBe(CRZ_APPROVED_HASHES['CRZ-5E']);
  expect(crzRequireKnownRuleset('CRZ-5E',crzRulesetHash(old)).grid.kind).toBe('hex');
  const square=crzPreset('CRZ-5E','square');
  expect(crzRequireKnownRuleset('CRZ-5E',crzRulesetHash(square)).grid.kind).toBe('square');
  const ready=crzTrainingReady({...CRZ_TRAINING_DEFAULTS,grid:'square'});
  expect(ready.map.grid).toBe('square');
  const session=crzReplayBegin(ready);
  const first=crzLegalCommands(session.state).find(c=>c.type==='MOVE');
  expect(first).toBeDefined();
  const played=crzReplayRecord(session,first!);
  expect(crzVerifyReplay(played.replay).ok).toBe(true);
 });
});
