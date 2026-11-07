import {describe,it,expect} from 'vitest';
import {offsetToAxial,axialToOffset,hexDistance,hexNeighbors,hexKey} from '@/lib/battle/geometry/hex';
import {createScenario} from '@/lib/battle/geometry/map-fixtures';
import {validateBattleMap} from '@/lib/battle/geometry/map-validation';
import {findPath,reachablePaths} from '@/lib/battle/geometry/pathfinding';
import {lineOfSight} from '@/lib/battle/geometry/visibility';
import type {BattleMap,Terrain} from '@/lib/battle/domain/types';
const edit=(map:BattleMap,col:number,row:number,terrain:Terrain):BattleMap=>{
  const hex=offsetToAxial(col,row);
  return {...map,tiles:map.tiles.map(t=>hexKey(t)===hexKey(hex)?{...t,terrain}:t)};
};
describe('Batalha V2 — lote 2, geometria',()=>{
 it('converte cada célula dos tamanhos permitidos sem perda e preserva seis vizinhos',()=>{
  for(const width of [11,15] as const){
    const map=createScenario('plain-open',width,'hex');
    expect(validateBattleMap(map)).toEqual([]);
    for(let col=0;col<width;col++)for(let row=0;row<map.height;row++){
      const axial=offsetToAxial(col,row);
      expect(axialToOffset(axial)).toEqual({column:col,row});
      expect(hexNeighbors(axial)).toHaveLength(6);
      expect(hexDistance(axial,axial)).toBe(0);
    }
  }
 });
 it('carrega quatro cenários com zonas e conectividade válidas',()=>{
   for(const id of ['plain-open','contested-woods','border-hills','narrow-passage'] as const){
     expect(validateBattleMap(createScenario(id,11,'hex'))).toEqual([]);
     expect(validateBattleMap(createScenario(id,15,'hex'))).toEqual([]);
   }
 });
 it('cobra terreno de destino e bloqueia montanhas e ocupantes',()=>{
   const map=edit(createScenario('plain-open',11,'hex'),2,2,'forest');
   const from=offsetToAxial(1,2),forest=offsetToAxial(2,2);
   expect(findPath(map,from,forest,1)).toBeNull();
   expect(findPath(map,from,forest,2)?.cost).toBe(2);
   const occupied=[forest];
   expect(reachablePaths(map,from,3,{occupied}).some(p=>hexKey(p.to)===hexKey(forest))).toBe(false);
   const rock=edit(map,2,2,'rock');
   expect(findPath(rock,from,forest,6)).toBeNull();
 });
 it('a zona de controle impede atravessamento depois de entrar na adjacência',()=>{
   const map=createScenario('plain-open',11,'hex');
   const from=offsetToAxial(2,4),enemy=offsetToAxial(5,4);
   const positions=reachablePaths(map,from,6,{occupied:[enemy],enemies:[enemy]});
   const near=positions.find(p=>hexKey(p.to)===hexKey(offsetToAxial(4,4)));
   expect(near).toBeDefined();
   expect(positions.every(p=>p.path.slice(1,-1).every(h=>hexNeighbors(h).every(n=>hexKey(n)!==hexKey(enemy))))).toBe(true);
 });
 it('mantém desempate de caminho repetível',()=>{
   const map=createScenario('plain-open',11,'hex'),from=offsetToAxial(2,3),to=offsetToAxial(4,5);
   expect(findPath(map,from,to,6)).toEqual(findPath(map,from,to,6));
 });
 it('floresta/rocha intermediária bloqueia, mas floresta-alvo não bloqueia',()=>{
   const map=createScenario('plain-open',11,'hex'),a=offsetToAxial(3,4),b=offsetToAxial(6,4),middle=offsetToAxial(4,4);
   expect(lineOfSight(map,a,b).clear).toBe(true);
   expect(lineOfSight(edit(map,4,4,'forest'),a,b).clear).toBe(false);
   expect(lineOfSight(edit(map,4,4,'rock'),a,b).clear).toBe(false);
   expect(lineOfSight(edit(map,6,4,'forest'),a,b).clear).toBe(true);
   expect(lineOfSight(edit(map,4,4,'forest'),a,b).blocker).toEqual(middle);
 });
 it('rejeita zonas sobrepostas e grade incompleta',()=>{
  const map=createScenario('plain-open',11,'hex');
  const bad={...map,deployment:{...map.deployment,defender:map.deployment.attacker}};
  expect(validateBattleMap(bad).some(s=>s.includes('sobrepostas'))).toBe(true);
  expect(validateBattleMap({...map,tiles:map.tiles.slice(1)}).some(s=>s.includes('incompleta'))).toBe(true);
 });
});
