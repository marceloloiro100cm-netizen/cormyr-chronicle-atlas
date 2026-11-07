/** Efeitos numéricos de terreno do capítulo 10, Tabela 10-3.
 * A tabela é codificada em metadados originais, sem transcrever a prosa do livro.
 */
export type WarTerrainId=
 'plain'|'pasture'|'road'|'stream'|'river'|'small-lake'|'large-lake'|
 'hill'|'hamlet'|'small-town'|'large-town'|'small-city'|'large-city'|
 'coast'|'desert'|'sparse-forest'|'dense-forest'|'island'|'mountain'|
 'wall'|'ruins'|'marsh';
export type WarWeather='clear'|'light-rain'|'heavy-rain'|'light-snow'|'heavy-snow';
export type WarVisibility='clear'|'dim'|'dark';
export type WarTerrainTile=Readonly<{
 x:number;y:number;terrain:WarTerrainId;
 road?:boolean;bridge?:boolean;
}>;
export type WarTerrainEffect=Readonly<{
 slow:0|1|2;cover:number;highGroundBonusDice:number;
 blocked:boolean;water:boolean;naval:boolean;noCavalry:boolean;noSiege:boolean;
}>;
const base=(effects:Partial<WarTerrainEffect>={}):WarTerrainEffect=>({
 slow:0,cover:0,highGroundBonusDice:0,blocked:false,water:false,
 naval:false,noCavalry:false,noSiege:false,...effects,
});
export const WAR_TERRAIN:Readonly<Record<WarTerrainId,WarTerrainEffect>>={
 plain:base(),pasture:base(),road:base(),stream:base({slow:1}),
 river:base({blocked:true,water:true,naval:true}),
 'small-lake':base({slow:1,water:true,naval:true}),
 'large-lake':base({blocked:true,water:true,naval:true}),
 hill:base({slow:1,highGroundBonusDice:1}),
 hamlet:base({slow:1}),
 'small-town':base({slow:1,cover:1}),
 'large-town':base({slow:1,cover:2}),
 'small-city':base({slow:1,cover:2,noCavalry:true}),
 'large-city':base({slow:1,cover:5,noCavalry:true}),
 coast:base({naval:true}),desert:base({slow:1}),
 'sparse-forest':base({cover:2}), 'dense-forest':base({cover:5}),
 island:base({naval:true}),
 mountain:base({slow:2,highGroundBonusDice:2,noCavalry:true,noSiege:true}),
 wall:base({blocked:true,cover:5}),
 ruins:base({cover:2}),marsh:base({slow:1}),
};
export function terrainAt(
 tiles:readonly WarTerrainTile[],position:{x:number;y:number},
):WarTerrainTile{
 return tiles.find(t=>t.x===position.x&&t.y===position.y)??{
  x:position.x,y:position.y,terrain:'plain',
 };
}
export function terrainEffect(tile:WarTerrainTile):WarTerrainEffect{
 const effect=WAR_TERRAIN[tile.terrain];
 return {
  ...effect,
  blocked:effect.blocked&&!((tile.bridge&&tile.terrain==='river')),
  slow:tile.road?(effect.slow===2?1:0):tile.bridge&&tile.terrain==='river'?1:effect.slow,
  noCavalry:effect.noCavalry&&!(tile.road&&tile.terrain==='mountain'),
 };
}
export function visibilityPenalty(
 visibility:WarVisibility,weather:WarWeather,ranged:boolean,
):number{
 const finalVisibility=weather==='heavy-snow'?'dark':visibility;
 return (finalVisibility==='dark'?(ranged?4:2):finalVisibility==='dim'?(ranged?2:1):0);
}
export function weatherAttackModifier(weather:WarWeather):number{
 return ['heavy-rain','light-snow','heavy-snow'].includes(weather)?-2:0;
}
export function movementSlow(tile:WarTerrainTile,visibility:WarVisibility,weather:WarWeather):number{
 const tier=terrainEffect(tile).slow;
 const dark=visibility==='dark'||weather==='heavy-snow';
 return dark?Math.min(2,tier+1):tier;
}
export function terrainHighGround(
 attacker:WarTerrainTile,defender:WarTerrainTile,
):number{
 const high=terrainEffect(attacker).highGroundBonusDice;
 return high>terrainEffect(defender).highGroundBonusDice?high:0;
}
