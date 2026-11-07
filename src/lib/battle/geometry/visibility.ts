import type { BattleMap, Hex } from '../domain/types';
import { hexDistance, hexKey } from './hex';
import {gridKind} from './grid';
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
/** Conservador: segmento centro-a-centro incluindo as células tocadas
 * num vértice; evita atravessar uma barreira posicionada na esquina.
 */
function squareRaySupercover(map:BattleMap,from:Hex,to:Hex):Hex[]{
 const x0=from.q+0.5,y0=from.r+0.5,x1=to.q+0.5,y1=to.r+0.5;
 const dx=x1-x0,dy=y1-y0,eps=1e-9;
 const crosses=(h:Hex):boolean=>{
  let lo=0,hi=1;
  for(const [p,d,min,max] of [[x0,dx,h.q,h.q+1],[y0,dy,h.r,h.r+1]] as const){
   if(Math.abs(d)<eps){if(p<min-eps||p>max+eps)return false;continue;}
   const a=(min-p)/d,b=(max-p)/d;
   lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
   if(lo>hi+eps)return false;
  }
  return true;
 };
 return map.tiles.filter(t=>hexKey(t)!==hexKey(from)&&hexKey(t)!==hexKey(to)&&crosses(t))
  // Los, replay e UI devem receber somente coordenadas, nunca o objeto Tile.
  .map(t=>({q:t.q,r:t.r}))
  .sort((a,b)=>(a.q-from.q)**2+(a.r-from.r)**2-(b.q-from.q)**2-(b.r-from.r)**2);
}

export function lineOfSight(map:BattleMap,from:Hex,to:Hex):{
  clear:boolean;blocker:Hex|null;traversed:readonly Hex[];
}{
  const tiles=tileIndex(map);
  if(!tiles.has(hexKey(from))||!tiles.has(hexKey(to)))
    return {clear:false,blocker:null,traversed:[]};
  const traversed=gridKind(map)==='square'?squareRaySupercover(map,from,to):hexRaySupercover(from,to);
  const blocker=traversed.find(h=>{
    const tile=tiles.get(hexKey(h));
    return !tile||TERRAIN[tile.terrain].blocksSight;
  })??null;
  return {clear:!blocker,blocker,traversed};
}
