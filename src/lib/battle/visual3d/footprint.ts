import type {Hex} from '../domain/types';

/** Exterior edges of occupied squares, with shared interior edges omitted.
 * Coordinates are board-space and exist only to display a D&D creature footprint.
 */
export type FootprintEdge=Readonly<{q:number;r:number;side:'north'|'south'|'east'|'west'}>;
export function footprintPerimeter(cells:readonly Hex[]):readonly FootprintEdge[]{
 const positions=new Set(cells.map(c=>c.q+','+c.r));
 const edges:FootprintEdge[]=[];
 for(const {q,r} of cells){
  if(!positions.has(q+','+(r-1)))edges.push({q,r,side:'north'});
  if(!positions.has(q+','+(r+1)))edges.push({q,r,side:'south'});
  if(!positions.has((q-1)+','+r))edges.push({q,r,side:'west'});
  if(!positions.has((q+1)+','+r))edges.push({q,r,side:'east'});
 }
 return edges;
}
