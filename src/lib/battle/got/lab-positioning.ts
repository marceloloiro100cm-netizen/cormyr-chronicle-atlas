import {modelWarLabDeployments,type WarLabDeployment} from './lab-deployment';
import type {WarPosition} from './types';

/** Custom deployment is only applied to the narrator's synthetic battle board.
 * The four read-only source slots keep their IDs and source metadata.
 */
export function positionedWarLabDeployments(
 extraPerSide:number,
 placements:Readonly<Record<string,WarPosition>>,
 width=12,height=7,
):readonly WarLabDeployment[]{
 const original=modelWarLabDeployments(extraPerSide,width,height);
 const deployed=original.map(u=>({...u,position:{...(placements[u.id]??u.position)}}));
 const occupied=new Set<string>();
 for(const u of deployed){
  const {x,y}=u.position;
  if(!Number.isInteger(x)||!Number.isInteger(y)||
   x<0||x>=width||y<0||y>=height)throw new Error('Unidade fora do campo de '+width+' × '+height+' quadrados.');
  const key=x+':'+y;
  if(occupied.has(key))throw new Error('Duas tropas não podem iniciar no mesmo quadrado.');
  occupied.add(key);
 }
 return deployed;
}
export function positionWarLabUnit(
 extraPerSide:number,
 placements:Readonly<Record<string,WarPosition>>,
 unitId:string,
 position:WarPosition,
 width=12,height=7,
):Readonly<Record<string,WarPosition>>{
 const slots=modelWarLabDeployments(extraPerSide,width,height);
 if(!slots.some(u=>u.id===unitId))throw new Error('Selecione uma tropa da lista.');
 const result={...placements,[unitId]:{...position}};
 positionedWarLabDeployments(extraPerSide,result,width,height);
 return result;
}
