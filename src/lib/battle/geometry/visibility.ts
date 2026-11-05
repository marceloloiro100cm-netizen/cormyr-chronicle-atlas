import type { BattleMap, Hex } from '../domain/types';
import { hexDistance, hexKey } from './hex';
import { TERRAIN, tileIndex } from './terrain';
function cubeRound(q:number,r:number):Hex{
  const s=-q-r;let rq=Math.round(q),rr=Math.round(r),rs=Math.round(s);
  const dq=Math.abs(rq-q),dr=Math.abs(rr-r),ds=Math.abs(rs-s);
  if(dq>dr&&dq>ds)rq=-rr-rs;
  else if(dr>ds)rr=-rq-rs;
  return {q:rq,r:rr};
}
/** Supercover conservador: amostra centro e ambos os lados de arestas colineares. */
export function hexRaySupercover(from:Hex,to:Hex):Hex[]{
  const distance=hexDistance(from,to);
  if(!distance)return [];
  const result=new Map<string,Hex>();
  const add=(h:Hex)=>{if(hexKey(h)!==hexKey(from)&&hexKey(h)!==hexKey(to))result.set(hexKey(h),h);};
  for(let step=1;step<distance*12;step++){
    const t=step/(distance*12);
    const q=from.q+(to.q-from.q)*t,r=from.r+(to.r-from.r)*t;
    add(cubeRound(q,r));
    // Um tiro exatamente sobre fronteira não passa entre duas barreiras.
    add(cubeRound(q+1e-8,r-1e-8));
    add(cubeRound(q-1e-8,r+1e-8));
    add(cubeRound(q+1e-8,r+1e-8));
    add(cubeRound(q-1e-8,r-1e-8));
  }
  return [...result.values()];
}
export function lineOfSight(map:BattleMap,from:Hex,to:Hex):{
  clear:boolean;blocker:Hex|null;traversed:readonly Hex[];
}{
  const tiles=tileIndex(map);
  if(!tiles.has(hexKey(from))||!tiles.has(hexKey(to)))
    return {clear:false,blocker:null,traversed:[]};
  const traversed=hexRaySupercover(from,to);
  const blocker=traversed.find(h=>{
    const tile=tiles.get(hexKey(h));
    return !tile||TERRAIN[tile.terrain].blocksSight;
  })??null;
  return {clear:!blocker,blocker,traversed};
}
