import type {Hex} from '../domain/types';
import type {VisualSquareMap,VisualToken} from './tokens';

/** Renderer-only commands; never serialize a proposed click as an engine action. */
export type VisualAction='move'|'attack';
export type VisualPendingAction=Readonly<{
 type:VisualAction;target:Hex;key:string;label:string;actorId:string|null;
}>;
export const visualKey=(h:Hex)=>h.q+','+h.r;
export function tokenAtCell(tokens:readonly VisualToken[],hex:Hex):VisualToken|undefined{
 return tokens.find(t=>(t.footprintCells?.length?t.footprintCells:[t.position])
  .some(p=>p.q===hex.q&&p.r===hex.r));
}
/** Only legal moves/attacks, as explicitly provided by the ORIGINAL battle engine,
 * require confirmation. Ordinary inspecting/selecting never triggers a move.
 */
export function proposeVisualAction(args:{
 hex:Hex;tokens:readonly VisualToken[];moveKeys:readonly string[];
 attackKeys:readonly string[];actorId?:string|null;actionEnabled:boolean;
}):VisualPendingAction|null{
 const {hex,tokens,moveKeys,attackKeys,actorId=null,actionEnabled}=args;
 if(!actionEnabled)return null;
 const target=tokenAtCell(tokens,hex);
 if(target&&attackKeys.includes(target.id))return {
  type:'attack',target:{q:hex.q,r:hex.r},key:visualKey(hex),
  label:target.name,actorId,
 };
 if(moveKeys.includes(visualKey(hex))&&!target)return {
  type:'move',target:{q:hex.q,r:hex.r},key:visualKey(hex),
  label:'Quadrado '+hex.q+','+hex.r,actorId,
 };
 return null;
}
export function pendingStillLegal(pending:VisualPendingAction,{
 tokens,moveKeys,attackKeys,actorId,actionEnabled,
}:{
 tokens:readonly VisualToken[];moveKeys:readonly string[];
 attackKeys:readonly string[];actorId?:string|null;actionEnabled:boolean;
}):boolean{
 if(!actionEnabled||pending.actorId!==(actorId??null))return false;
 const result=proposeVisualAction({hex:pending.target,tokens,moveKeys,attackKeys,
  actorId:actorId??null,actionEnabled});
 return result!==null&&result.type===pending.type&&result.key===pending.key&&
  result.label===pending.label;
}
export function visualMapCenter(map:VisualSquareMap):{x:number;z:number}{
 return {x:0,z:0};
}
export function visualCellTarget(map:VisualSquareMap,hex:Hex):{x:number;z:number}{
 return {x:hex.q-(map.width-1)/2,z:hex.r-(map.height-1)/2};
}
export function tokenFocusPoint(map:VisualSquareMap,token:VisualToken):{x:number;z:number}{
 const cells=token.footprintCells?.length?token.footprintCells:[token.position];
 return {x:cells.reduce((sum,p)=>sum+p.q,0)/cells.length-(map.width-1)/2,
  z:cells.reduce((sum,p)=>sum+p.r,0)/cells.length-(map.height-1)/2};
}
/** Camera fit without game distance conversion. It uses visual squares, not metres. */
export function cameraBaseFit(width:number,height:number,viewportWidth:number,viewportHeight:number,top:boolean):number{
 const projectedWidth=top?width:(width+height)/Math.SQRT2;
 const projectedHeight=top?height:(width+height)*.72/Math.SQRT2;
 return Math.max(5,Math.min(150,Math.min(
  viewportWidth/(projectedWidth*1.14+1),
  viewportHeight/(projectedHeight*1.14+1),
 )));
}
