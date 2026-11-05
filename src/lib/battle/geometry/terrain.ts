import type { BattleMap, Hex, MapTile, Terrain } from '../domain/types';
import { hexKey } from './hex';
export const TERRAIN:Readonly<Record<Terrain,{cost:number;blocksMovement:boolean;blocksSight:boolean;coverBP:number}>>={
  plain:{cost:1,blocksMovement:false,blocksSight:false,coverBP:10000},
  forest:{cost:2,blocksMovement:false,blocksSight:true,coverBP:8000},
  hill:{cost:2,blocksMovement:false,blocksSight:false,coverBP:9000},
  rock:{cost:Infinity,blocksMovement:true,blocksSight:true,coverBP:0},
};
export const tileAt=(map:BattleMap,hex:Hex):MapTile|undefined=>
  map.tiles.find(t=>hexKey(t)===hexKey(hex));
export const tileIndex=(map:BattleMap):Map<string,MapTile>=>
  new Map(map.tiles.map(t=>[hexKey(t),t]));
