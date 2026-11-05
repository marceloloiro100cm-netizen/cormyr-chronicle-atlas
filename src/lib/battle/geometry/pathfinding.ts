import type { BattleMap, Hex } from '../domain/types';
import { hexDistance, hexKey, hexNeighbors } from './hex';
import { TERRAIN, tileIndex } from './terrain';
export type HexPath=Readonly<{to:Hex;cost:number;steps:number;path:readonly Hex[]}>;
export type PathContext=Readonly<{
  occupied?:readonly Hex[];
  enemies?:readonly Hex[]; // só inimigos vivos e não debandados em zona de controle
}>;
type Candidate={to:Hex;cost:number;steps:number;path:Hex[];trace:string};
function better(a:Candidate,b:Candidate):boolean{
  return a.cost<b.cost || (a.cost===b.cost&&(
    a.steps<b.steps||(a.steps===b.steps&&a.trace<b.trace)
  ));
}
/** Dijkstra/A* de custo não uniforme; estável para 165 hexágonos. */
export function reachablePaths(map:BattleMap,from:Hex,budget:number,context:PathContext={}):HexPath[]{
  if(!Number.isInteger(budget)||budget<0||budget>6)
    throw new Error('Orçamento de movimento inválido.');
  const tiles=tileIndex(map),start=hexKey(from),tile=tiles.get(start);
  if(!tile||tile.terrain==='rock')throw new Error('Origem não caminhável.');
  const occupied=new Set((context.occupied??[]).map(hexKey));occupied.delete(start);
  const enemy=new Set((context.enemies??[]).map(hexKey));
  const best=new Map<string,Candidate>([[start,{to:from,cost:0,steps:0,path:[from],trace:''}]]);
  const frontier:Candidate[]=[best.get(start)!];
  while(frontier.length){
    frontier.sort((a,b)=>a.cost-b.cost||a.steps-b.steps||a.trace.localeCompare(b.trace));
    const current=frontier.shift()!;
    const currentKey=hexKey(current.to);
    if(best.get(currentKey)!==current)continue;
    const zoc=currentKey!==start&&hexNeighbors(current.to).some(h=>enemy.has(hexKey(h)));
    if(zoc)continue;
    hexNeighbors(current.to).forEach((next,index)=>{
      const key=hexKey(next),target=tiles.get(key);
      if(!target||TERRAIN[target.terrain].blocksMovement||occupied.has(key))return;
      const cost=current.cost+TERRAIN[target.terrain].cost;
      if(cost>budget)return;
      const candidate={to:next,cost,steps:current.steps+1,
        path:[...current.path,next],trace:current.trace+String(index)};
      const prev=best.get(key);
      if(!prev||better(candidate,prev)){
        best.set(key,candidate);frontier.push(candidate);
      }
    });
  }
  return [...best.values()].filter(c=>hexKey(c.to)!==start)
    .sort((a,b)=>a.cost-b.cost||a.steps-b.steps||a.to.q-b.to.q||a.to.r-b.to.r)
    .map(c=>({to:c.to,cost:c.cost,steps:c.steps,path:c.path}));
}
export function findPath(map:BattleMap,from:Hex,to:Hex,budget:number,context:PathContext={}):HexPath|null{
  if(hexDistance(from,to)===0)return {to,cost:0,steps:0,path:[from]};
  return reachablePaths(map,from,budget,context).find(item=>hexKey(item.to)===hexKey(to))??null;
}
