import type {WarPosition,WarSide} from './types';
export type WarLabDeployment=Readonly<{
 id:string;side:WarSide;name:string;position:WarPosition;
}>;
const EXTRA_ROWS=[0,1,3,5,6] as const;
const SECOND_COLUMN_ROWS=[0,1,2,3,4,5,6] as const;
const MAX_EXTRA=EXTRA_ROWS.length+SECOND_COLUMN_ROWS.length;
/** Narrator laboratory placements on the existing 12×7 war map.
 * The four original slots stay unchanged for read-only House imports.
 * Additional positions are strictly model troops, never cloned House records.
 */
export function modelWarLabDeployments(
 extraPerSide:number,width=12,height=7,
):readonly WarLabDeployment[]{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<11||height<7)
  throw new Error('Mapa de implantação exige pelo menos 11 × 7 quadrados.');
 if(!Number.isInteger(extraPerSide)||extraPerSide<0||extraPerSide>MAX_EXTRA)
  throw new Error('O laboratório admite de 0 a 12 unidades extras por lado.');
 const basic:WarLabDeployment[]=[
  {id:'attacker-1',side:'attacker',name:'Vanguarda atacante',position:{x:1,y:2}},
  {id:'attacker-2',side:'attacker',name:'Apoio atacante',position:{x:1,y:4}},
  {id:'defender-1',side:'defender',name:'Vanguarda defensora',position:{x:width-2,y:2}},
  {id:'defender-2',side:'defender',name:'Apoio defensor',position:{x:width-2,y:4}},
 ];
 for(let i=0;i<extraPerSide;i++){
  const secondColumn=i>=EXTRA_ROWS.length;
  const row=secondColumn?SECOND_COLUMN_ROWS[i-EXTRA_ROWS.length]!:
   EXTRA_ROWS[i]!;
  basic.push({id:'attacker-'+(i+3),side:'attacker',
   name:'Reforço atacante '+(i+1),position:{x:secondColumn?2:1,y:row}});
  basic.push({id:'defender-'+(i+3),side:'defender',
   name:'Reforço defensor '+(i+1),position:{x:secondColumn?width-3:width-2,y:row}});
 }
 return basic;
}

