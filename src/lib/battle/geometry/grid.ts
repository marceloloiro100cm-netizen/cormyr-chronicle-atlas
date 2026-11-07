/** Malha tática versionada: mapas antigos sem grid permanecem hexagonais.
 * Coordenadas q/r são persistidas sem alterações; em square significam coluna/linha.
 */
import type {BattleMap,Hex} from '../domain/types';
import {hexDistance,hexNeighbors,axialToOffset,offsetToAxial} from './hex';

export type GridKind='hex'|'square';
const SQUARE_DIRECTIONS:readonly Hex[]=[
 {q:1,r:0},{q:0,r:1},{q:-1,r:0},{q:0,r:-1},
 {q:1,r:1},{q:-1,r:1},{q:-1,r:-1},{q:1,r:-1},
];
export const gridKind=(map:BattleMap):GridKind=>map.grid==='square'?'square':'hex';
export const gridToOffset=(map:BattleMap,h:Hex):{column:number;row:number}=>
 gridKind(map)==='square'?{column:h.q,row:h.r}:axialToOffset(h);
export const gridFromOffset=(map:BattleMap,column:number,row:number):Hex=>
 gridKind(map)==='square'?{q:column,r:row}:offsetToAxial(column,row);
export const gridDistance=(map:BattleMap,a:Hex,b:Hex):number=>
 gridKind(map)==='square'?Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r)):hexDistance(a,b);
export const gridNeighbors=(map:BattleMap,h:Hex):Hex[]=>
 gridKind(map)==='square'?SQUARE_DIRECTIONS.map(d=>({q:h.q+d.q,r:h.r+d.r})):hexNeighbors(h);
/** Diagonal é 1,5 pontos; terreno mantém custo 1/2, impedindo diagonais gratuitas. */
export const gridStepCost=(map:BattleMap,from:Hex,to:Hex,terrainCost:number):number=>
 terrainCost+(gridKind(map)==='square'&&from.q!==to.q&&from.r!==to.r?0.5:0);
/** Sem cortar esquinas: ambos os quadrados ortogonais precisam estar livres. */
export function gridAllowsStep(map:BattleMap,from:Hex,to:Hex,occupied:ReadonlySet<string>=new Set()):boolean{
 if(gridKind(map)!=='square'||from.q===to.q||from.r===to.r)return true;
 const orthogonal=[{q:to.q,r:from.r},{q:from.q,r:to.r}];
 return orthogonal.every(cell=>{
  const key=cell.q+','+cell.r;
  return !occupied.has(key)&&map.tiles.some(t=>t.q===cell.q&&t.r===cell.r&&t.terrain!=='rock');
 });
}
