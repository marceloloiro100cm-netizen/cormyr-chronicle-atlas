import type {WarPosition,WarSide} from './types';
export type WarLabDeployment=Readonly<{
 id:string;side:WarSide;name:string;position:WarPosition;
}>;
const EXTRA_ROWS=[0,1,3,5,6] as const;
/** Narrator laboratory placements on the existing 12×7 war map.
 * The four original slots stay unchanged for read-only House imports.
 * Additional positions are strictly model troops, never cloned House records.
 */
export function modelWarLabDeployments(extraPerSide:number):readonly WarLabDeployment[]{
 if(!Number.isInteger(extraPerSide)||extraPerSide<0||extraPerSide>EXTRA_ROWS.length)
  throw new Error('O laboratório admite de 0 a 5 unidades extras por lado.');
 const basic:WarLabDeployment[]=[
  {id:'attacker-1',side:'attacker',name:'Vanguarda atacante',position:{x:1,y:2}},
  {id:'attacker-2',side:'attacker',name:'Apoio atacante',position:{x:1,y:4}},
  {id:'defender-1',side:'defender',name:'Vanguarda defensora',position:{x:10,y:2}},
  {id:'defender-2',side:'defender',name:'Apoio defensor',position:{x:10,y:4}},
 ];
 for(let i=0;i<extraPerSide;i++){
  const row=EXTRA_ROWS[i]!;
  basic.push({id:'attacker-'+(i+3),side:'attacker',
   name:'Reforço atacante '+(i+1),position:{x:1,y:row}});
  basic.push({id:'defender-'+(i+3),side:'defender',
   name:'Reforço defensor '+(i+1),position:{x:10,y:row}});
 }
 return basic;
}
