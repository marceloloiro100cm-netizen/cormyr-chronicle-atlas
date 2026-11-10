import type {BattleMap,BattleStack,Hex} from '../domain/types';
import {gridKind} from '../geometry/grid';

/** Canonical military identifiers; never alter house/game profiles to fit artwork. */
export const CORMYR_MINIATURE_TYPES=[
 'support','archers','scouts','cavalry','criminals','crusaders','engineers','special',
 'personal-guard','garrison','guerrillas','infantry','sailors','mercenaries',
 'warships','levies','raiders',
] as const;
export type CormyrMiniatureType=typeof CORMYR_MINIATURE_TYPES[number];
export type CreatureMiniatureKind=
 'goblin'|'kobold'|'orc'|'dragon'|'undead'|'skeleton'|'zombie'|'spirit'|
 'construct'|'beast'|'giant'|'humanoid'|'elemental'|'fiend'|'celestial'|
 'aberration'|'ooze'|'plant'|'fey'|'insect'|'spider'|'serpent'|
 'troll'|'aquatic'|'swarm';
export type MiniatureKind=CormyrMiniatureType|'archer'|CreatureMiniatureKind|'generic';
export type VisualTerrain='plain'|'forest'|'hill'|'rock'|'water'|'settlement'|
 'desert'|'marsh'|'road'|'bridge'|'coast'|'ruins'|'mountain';
export type VisualSquareMap=Readonly<{
 grid?:'square'|undefined;width:number;height:number;
 tiles:readonly Readonly<Hex&{terrain:VisualTerrain;road?:boolean;bridge?:boolean;
  /** Optional rule notes supplied by the authoritative engine; never computed by 3D. */
  ruleNotes?:readonly string[]}>[];
}>;
export type VisualStack=Pick<BattleStack,
 'id'|'side'|'name'|'position'|'primaryTypeId'|'initialCount'|'hpPerSoldier'|'currentHp'|'moraleState'> &
 Partial<Pick<BattleStack,'attack'|'defense'|'movementHex'|'armor'>>;
/** The tactical inspector has display-only text; NEVER infer legal actions here. */
export type VisualTacticalInfo=Readonly<{
 health?:string;defense?:string;morale?:string;movement?:string;attack?:string;
}>;
/** Optional render-only details. All sizes are visual footprint cells, never metres. */
export type VisualToken=Readonly<{
 id:string;side:BattleStack['side'];name:string;position:Hex;kind:MiniatureKind;
 fallback:boolean;count:number;houseLabel?:string;footprint?:number;
 flying?:boolean;naval?:boolean;metricLabel?:'Saúde'|'Vivos'|'Soldados';
 footprintCells?:readonly Hex[];tactical?:VisualTacticalInfo;
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
   tactical:{
    health:'PV '+s.currentHp.toLocaleString('pt-BR'),
    morale:s.moraleState==='steady'?'Moral firme':s.moraleState==='shaken'?'Moral abalada':'Em retirada',
    ...(s.defense!==undefined?{defense:'Defesa '+s.defense}:{}),
    ...(s.armor!==undefined?{attack:'Armadura '+s.armor}:{}),
    ...(s.movementHex!==undefined?{movement:'Movimento '+s.movementHex+' quadrados'}:{}),
   },
   ...(houses?.[s.side]?{houseLabel:houses[s.side]}:{}),
   ...(s.primaryTypeId==='warships'?{naval:true}:{}),
  }));
}
