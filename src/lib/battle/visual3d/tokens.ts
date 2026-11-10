import type {BattleMap,BattleStack,Hex} from '../domain/types';
import {gridKind} from '../geometry/grid';

/** Canonical military identifiers; never alter house/game profiles to fit artwork. */
export const CORMYR_MINIATURE_TYPES=[
 'support','archers','scouts','cavalry','criminals','crusaders','engineers','special',
 'personal-guard','garrison','guerrillas','infantry','sailors','mercenaries',
 'warships','levies','raiders',
] as const;
export type CormyrMiniatureType=typeof CORMYR_MINIATURE_TYPES[number];
export type MiniatureKind=CormyrMiniatureType|'archer'|'goblin'|'dragon'|'undead'|
 'construct'|'beast'|'giant'|'humanoid'|'generic';
export type VisualTerrain='plain'|'forest'|'hill'|'rock'|'water'|'settlement';
export type VisualSquareMap=Readonly<{
 grid?:'square';width:number;height:number;
 tiles:readonly Readonly<Hex&{terrain:VisualTerrain}>[];
}>;
export type VisualStack=Pick<BattleStack,
 'id'|'side'|'name'|'position'|'primaryTypeId'|'initialCount'|'hpPerSoldier'|'currentHp'|'moraleState'>;
/** Optional render-only details. All sizes are visual footprint cells, never metres. */
export type VisualToken=Readonly<{
 id:string;side:BattleStack['side'];name:string;position:Hex;kind:MiniatureKind;
 fallback:boolean;count:number;houseLabel?:string;footprint?:number;
 flying?:boolean;naval?:boolean;metricLabel?:'Saúde'|'Vivos'|'Soldados';
 footprintCells?:readonly Hex[];
}>;
export const isCormyrKind=(typeId:string):typeId is CormyrMiniatureType=>
 (CORMYR_MINIATURE_TYPES as readonly string[]).includes(typeId);
/** 'archer' is the preserved demo model key. Goblin is never a Cormyr troop. */
export function classifyMiniature(typeId:string):{kind:MiniatureKind;fallback:boolean}{
 if(typeId==='archers')return {kind:'archer',fallback:false};
 if(isCormyrKind(typeId))return {kind:typeId,fallback:false};
 return {kind:'generic',fallback:true};
}
export function canUseMiniatures(narrator:boolean,sessionEnabled:boolean,map:VisualSquareMap):boolean{
 return narrator&&sessionEnabled&&map.grid==='square';
}
/** Geometric unit is a square; physical rules remain independent (D&D 3 m, GOT 10 m). */
export function squareWorldPosition(map:VisualSquareMap,hex:Hex):[number,number,number]{
 if(map.grid!=='square'||!Number.isInteger(hex.q)||!Number.isInteger(hex.r)||
  !map.tiles.some(tile=>tile.q===hex.q&&tile.r===hex.r))
  throw new Error('Quadrado 3D inválido.');
 return [hex.q-(map.width-1)/2,0,hex.r-(map.height-1)/2];
}
export function visualTokens(map:BattleMap,stacks:readonly VisualStack[],
 houses?:Partial<Record<'attacker'|'defender',string>>):VisualToken[]{
 if(gridKind(map)!=='square')return [];
 return stacks.filter(s=>s.currentHp>0&&s.moraleState!=='routed'&&
  Number.isFinite(s.currentHp)&&s.hpPerSoldier>0&&
  map.tiles.some(t=>t.q===s.position.q&&t.r===s.position.r)).map(s=>({
   id:s.id,side:s.side,name:s.name,position:{...s.position},...classifyMiniature(s.primaryTypeId),
   count:Math.min(s.initialCount,Math.ceil(s.currentHp/s.hpPerSoldier)),
   ...(houses?.[s.side]?{houseLabel:houses[s.side]}:{}),
   ...(s.primaryTypeId==='warships'?{naval:true}:{}),
  }));
}
