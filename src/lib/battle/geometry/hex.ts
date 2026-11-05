import type { Hex } from '../domain/types';
export const HEX_DIRECTIONS: readonly Hex[] = [
  {q:1,r:0},{q:1,r:-1},{q:0,r:-1},
  {q:-1,r:0},{q:-1,r:1},{q:0,r:1},
];
export const hexKey=(h:Hex):string=>h.q+','+h.r;
export const hexDistance=(a:Hex,b:Hex):number=>{
  const dq=a.q-b.q,dr=a.r-b.r;
  return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
};
export const hexNeighbors=(h:Hex):Hex[]=>
  HEX_DIRECTIONS.map(d=>({q:h.q+d.q,r:h.r+d.r}));
/** Pointy-top odd-r offset display grid ↔ axial storage. */
export const offsetToAxial=(column:number,row:number):Hex=>({
  q:column-Math.floor((row-(row&1))/2),r:row,
});
export const axialToOffset=(h:Hex):{column:number;row:number}=>({
  column:h.q+Math.floor((h.r-(h.r&1))/2),row:h.r,
});
export const insideMap=(h:Hex,width:number,height:number):boolean=>{
  if(!Number.isInteger(h.q)||!Number.isInteger(h.r))return false;
  const {column,row}=axialToOffset(h);
  return column>=0&&column<width&&row>=0&&row<height;
};
