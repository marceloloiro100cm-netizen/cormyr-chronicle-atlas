import type {WarPosition} from './types';
import type {WarTerrainTile} from './terrain';
/** Optional digital supercover sightline across 10m battlefield squares.
 * The book leaves exact sightline geometry to the narrator. This
 * approximation treats WALL and MOUNTAIN as opaque between two units,
 * while woods/towns provide their printed cover, not an automatic block.
 */
export function traceWarSightline(from:WarPosition,to:WarPosition):readonly WarPosition[]{
 if(!Number.isInteger(from.x)||!Number.isInteger(from.y)||
  !Number.isInteger(to.x)||!Number.isInteger(to.y))
  throw new Error('Linha de visão exige coordenadas de quadrados inteiras.');
 const result:WarPosition[]=[];
 const dx=to.x-from.x,dy=to.y-from.y;
 const nx=Math.abs(dx),ny=Math.abs(dy);
 const sx=Math.sign(dx),sy=Math.sign(dy);
 let x=from.x,y=from.y,ix=0,iy=0;
 result.push({x,y});
 // Supercover: on a corner intersection also include the two
 // adjacent orthogonal cells, so diagonal rays cannot see through
 // touching opaque corners.
 while(ix<nx||iy<ny){
  const tx=(1+2*ix)*ny,ty=(1+2*iy)*nx;
  if(tx===ty&&ix<nx&&iy<ny){
   result.push({x:x+sx,y});
   result.push({x,y:y+sy});
   x+=sx;y+=sy;ix++;iy++;
  }else if(tx<ty&&ix<nx){
   x+=sx;ix++;
  }else{
   y+=sy;iy++;
  }
  result.push({x,y});
 }
 return result;
}
export function canSeeWarTarget(
 from:WarPosition,to:WarPosition,
 tiles:readonly WarTerrainTile[],
):boolean{
 const path=traceWarSightline(from,to);
 const opaque=new Set(tiles.filter(t=>
  t.terrain==='wall'||t.terrain==='mountain').map(t=>t.x+':'+t.y));
 const end=to.x+':'+to.y,origin=from.x+':'+from.y;
 // Cover on the target cell modifies Defense; it does not hide
 // the target merely by being terrain in its own square.
 return !path.some(p=>{
  const key=p.x+':'+p.y;
  return key!==origin&&key!==end&&opaque.has(key);
 });
}
