import type {BattleMap,BattleStack,Hex} from '../domain/types';
import {gridKind} from '../geometry/grid';
import {livingCount} from '../domain/morale';

export type MiniatureKind='infantry'|'archer'|'cavalry'|'goblin';
export type VisualStack=Pick<BattleStack,'id'|'side'|'name'|'position'|'primaryTypeId'|'initialCount'|'hpPerSoldier'|'currentHp'|'moraleState'>;
export type VisualToken=Readonly<{id:string;side:BattleStack['side'];name:string;position:Hex;kind:MiniatureKind;fallback:boolean;count:number}>;
/** Explicit presentation mapping, never a military profile or a rules inference. */
export function classifyMiniature(typeId:string):{kind:MiniatureKind;fallback:boolean}{
 if(typeId==='infantry')return {kind:'infantry',fallback:false};
 if(typeId==='archers')return {kind:'archer',fallback:false};
 if(typeId==='cavalry')return {kind:'cavalry',fallback:false};
 // Goblin exists only in the isolated visual fixture, not in the V3 catalog.
 return {kind:'infantry',fallback:true};
}
export function canUseMiniatures(narrator:boolean,sessionEnabled:boolean,map:BattleMap):boolean{
 return narrator&&sessionEnabled&&gridKind(map)==='square';
}
/** One world unit = one cell, NOT a physical metre or a new game scale. */
export function squareWorldPosition(map:BattleMap,hex:Hex):[number,number,number]{
 if(gridKind(map)!=='square'||!Number.isInteger(hex.q)||!Number.isInteger(hex.r)||
  !map.tiles.some(tile=>tile.q===hex.q&&tile.r===hex.r))throw new Error('Quadrado 3D inválido.');
 return [hex.q-(map.width-1)/2,0,hex.r-(map.height-1)/2];
}
export function visualTokens(map:BattleMap,stacks:readonly VisualStack[]):VisualToken[]{
 if(gridKind(map)!=='square')return [];
 return stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&
  Number.isFinite(s.currentHp)&&s.hpPerSoldier>0&&
  map.tiles.some(t=>t.q===s.position.q&&t.r===s.position.r)).map(s=>({
   id:s.id,side:s.side,name:s.name,position:{...s.position},...classifyMiniature(s.primaryTypeId),count:livingCount(s),
  }));
}