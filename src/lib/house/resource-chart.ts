import { balances } from './engine';
import { RESOURCE_KEYS, type HouseState } from './types';
/** Baseline of a dynamic scale, not a clipping limit. */
export const HOUSE_CHART_MAX=100;
export function houseResourceChart(state:HouseState) {
 const b=balances(state);
 const scale=Math.max(HOUSE_CHART_MAX,...RESOURCE_KEYS.flatMap(r=>[
   b.total[r],b.allocated[r]+b.committed[r],0,
 ]));
 return RESOURCE_KEYS.map(resource=>{
   const total=b.total[resource],allocated=Math.max(0,b.allocated[resource]),
     committed=Math.max(0,b.committed[resource]),available=Math.max(0,b.available[resource]),
     deficit=Math.max(0,-b.available[resource]);
   return {resource,total,allocated,committed,available,deficit,scale,plotted:Math.max(0,total)};
 });
}
