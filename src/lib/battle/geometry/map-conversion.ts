/** Conversão explícita e reversível de mapas táticos entre geometrias.
 * Não altera partidas ativas, fichas ou registros; opera exclusivamente em BattleMap.
 * Terrenos e zonas de implantação são preservados pela coluna/linha visual.
 */
import type {BattleMap,Hex,MapTile} from '../domain/types';
import {hexKey} from './hex';
import {gridFromOffset,gridKind,gridToOffset,type GridKind} from './grid';
import {validateBattleMap} from './map-validation';

export type GridConversionPreview=Readonly<{
 from:GridKind;to:GridKind;
 source:BattleMap;converted:BattleMap;
 tilesPreserved:number;
 attackerZonesPreserved:number;
 defenderZonesPreserved:number;
 repositionedCoordinates:number;
 issues:readonly string[];
}>;

export function previewBattleMapGridConversion(map:BattleMap,to:GridKind):GridConversionPreview{
 const from=gridKind(map);
 const {grid:_previousGrid,...base}=map;
 const nextShape:BattleMap={...base,...(to==='square'?{grid:'square' as const}:{})};
 const convertedPoint=(p:Hex):Hex=>{
  const {column,row}=gridToOffset(map,p);
  return gridFromOffset(nextShape,column,row);
 };
 const tiles:MapTile[]=map.tiles.map(t=>({...convertedPoint(t),terrain:t.terrain}));
 const deployment={
  attacker:map.deployment.attacker.map(convertedPoint),
  defender:map.deployment.defender.map(convertedPoint),
 };
 const converted:BattleMap={...nextShape,tiles,deployment};
 const sourceIssues=validateBattleMap(map).map(issue=>'Origem: '+issue);
 const targetIssues=validateBattleMap(converted).map(issue=>'Destino: '+issue);
 const issues=[...sourceIssues,...targetIssues];
 const terrainOriginal=new Map(map.tiles.map(t=>{
  const {column,row}=gridToOffset(map,t);
  return [column+','+row,t.terrain] as const;
 }));
 const terrainPreserved=converted.tiles.filter(t=>{
  const {column,row}=gridToOffset(converted,t);
  return terrainOriginal.get(column+','+row)===t.terrain;
 }).length;
 const tilesPreserved=terrainPreserved;
 if(tilesPreserved!==map.tiles.length)issues.push('A conversão alteraria terrenos.');
 const originalZone=(side:'attacker'|'defender')=>
  new Set(map.deployment[side].map(p=>{
   const {column,row}=gridToOffset(map,p);
   return column+','+row;
  }));
 const preserved=(side:'attacker'|'defender')=>{
  const fromZone=originalZone(side);
  return converted.deployment[side].filter(p=>{
   const {column,row}=gridToOffset(converted,p);
   return fromZone.has(column+','+row);
  }).length;
 };
 const attackerZonesPreserved=preserved('attacker');
 const defenderZonesPreserved=preserved('defender');
 if(attackerZonesPreserved!==map.deployment.attacker.length||
    defenderZonesPreserved!==map.deployment.defender.length)
  issues.push('A conversão alteraria as zonas de implantação.');
 const sourceTiles=new Map(map.tiles.map(t=>{
  const {column,row}=gridToOffset(map,t);
  return [column+','+row,hexKey(t)] as const;
 }));
 const repositionedCoordinates=converted.tiles.filter(t=>{
  const {column,row}=gridToOffset(converted,t);
  return sourceTiles.get(column+','+row)!==hexKey(t);
 }).length;
 return {from,to,source:map,converted,tilesPreserved,attackerZonesPreserved,
  defenderZonesPreserved,repositionedCoordinates,issues};
}
/** Aplica apenas mapas que passam por validação integral após a conversão. */
export function convertBattleMapGrid(map:BattleMap,to:GridKind):BattleMap{
 const preview=previewBattleMapGridConversion(map,to);
 if(preview.issues.length)throw new Error('Conversão bloqueada: '+preview.issues.join('; '));
 return preview.converted;
}
