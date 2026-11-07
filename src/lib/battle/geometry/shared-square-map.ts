import {createScenario} from './map-fixtures';
import type {BattleMap,Terrain} from '../domain/types';
import type {CrzMap} from '@/lib/crusade/geometry';
import type {WarTerrainTile} from '@/lib/battle/got/terrain';

/** Shared *visual/topological* square battlefield; combat mechanics stay
 * independent. A portable terrain ID never copies damage, Defense or speed.
 */
export type SharedSquareTerrain='plain'|'forest'|'hill'|'rock';
export type SharedSquareMap=Readonly<{
 schemaVersion:1;kind:'cormyr-square-map';grid:'square';
 width:11|15;height:9|11;name:string;
 cells:readonly Readonly<{x:number;y:number;terrain:SharedSquareTerrain}>[];
}>;
const allowed=new Set(['plain','forest','hill','rock']);
const rec=(v:unknown):v is Record<string,unknown>=>
 typeof v==='object'&&v!==null&&!Array.isArray(v);
export function validateSharedSquareMap(v:unknown):SharedSquareMap{
 if(!rec(v)||v['kind']!=='cormyr-square-map'||v['schemaVersion']!==1||
  v['grid']!=='square'||(v['width']!==11&&v['width']!==15)||
  (v['height']!==9&&v['height']!==11)||
  (v['width']===11&&v['height']!==9)||
  (v['width']===15&&v['height']!==11)||
  typeof v['name']!=='string'||!v['name'].trim()||
  v['name'].length>120||!Array.isArray(v['cells'])||
  v['cells'].length!==v['width']*v['height'])
  throw new Error('Mapa compartilhado inválido: use quadrados 11×9 ou 15×11.');
 const keys=new Set<string>();
 for(const c of v['cells']){
  if(!rec(c)||!Number.isInteger(c['x'])||!Number.isInteger(c['y'])||
   (c['x'] as number)<0||(c['x'] as number)>=v['width']||
   (c['y'] as number)<0||(c['y'] as number)>=v['height']||
   !allowed.has(c['terrain'] as string))
   throw new Error('Mapa compartilhado contém quadrado ou terreno inválido.');
  const key=c['x']+':'+c['y'];
  if(keys.has(key))throw new Error('Mapa compartilhado contém quadrados duplicados.');
  keys.add(key);
 }
 return v as SharedSquareMap;
}
export function serializeSharedSquareMap(map:SharedSquareMap):string{
 validateSharedSquareMap(map);
 return JSON.stringify(map);
}
export function parseSharedSquareMap(json:string):SharedSquareMap{
 if(!json.trim()||json.length>100000)
  throw new Error('O mapa compartilhado deve ter menos de 100 KB.');
 let raw:unknown;
 try{raw=JSON.parse(json) as unknown;}
 catch{throw new Error('JSON de mapa compartilhado inválido.');}
 return validateSharedSquareMap(raw);
}
function make(width:11|15,name:string,cells:SharedSquareMap['cells']):SharedSquareMap{
 return validateSharedSquareMap({kind:'cormyr-square-map',schemaVersion:1,
  grid:'square',width,height:width===11?9:11,name,cells});
}
export function sharedFromBattleMap(map:BattleMap):SharedSquareMap{
 if(map.grid!=='square'||(map.width!==11&&map.width!==15)||
  map.tiles.length!==map.width*map.height)
  throw new Error('Somente mapas quadrados 11×9 ou 15×11 podem ser compartilhados.');
 return make(map.width,map.label,map.tiles.map(t=>({
  x:t.q,y:t.r,terrain:t.terrain,
 })));
}
export function sharedFromCrzMap(map:CrzMap):SharedSquareMap{
 if(map.grid!=='square'||map.tiles.length!==map.width*map.height)
  throw new Error('O mapa CRZ precisa estar em quadrados.');
 return make(map.width,map.label,map.tiles.map(t=>({
  x:t.q,y:t.r,terrain:t.terrain,
 })));
}
export function sharedToBattleMap(portable:SharedSquareMap):BattleMap{
 const map=validateSharedSquareMap(portable);
 const preset=createScenario('plain-open',map.width,'square');
 const terrain=new Map(map.cells.map(c=>[c.x+':'+c.y,c.terrain]));
 return {...preset,id:'shared-square',label:map.name,
  tiles:preset.tiles.map(t=>({...t,terrain:terrain.get(t.q+':'+t.r)??'plain'})),
  deployment:{
   attacker:preset.deployment.attacker.filter(p=>
    terrain.get(p.q+':'+p.r)!=='rock'),
   defender:preset.deployment.defender.filter(p=>
    terrain.get(p.q+':'+p.r)!=='rock'),
  }};
}
/** GOT has a richer terrain catalog. Only these reversible four terrain IDs
 * can be exported. The interpretation of cover and movement remains mode-local.
 */
const FROM_GOT:Readonly<Record<string,SharedSquareTerrain>>={
 plain:'plain','dense-forest':'forest',hill:'hill',wall:'rock',
};
export function sharedFromGotTiles(
 width:11|15,height:9|11,tiles:readonly WarTerrainTile[],name:string,
):SharedSquareMap{
 const byPos=new Map(tiles.map(t=>[t.x+':'+t.y,t]));
 if(tiles.some(t=>!(t.terrain in FROM_GOT)))
  throw new Error('Este mapa GOT contém terrenos especiais que exigem conversão manual.');
 const cells=Array.from({length:width*height},(_,i)=>{
  const x=i%width,y=Math.floor(i/width),tile=byPos.get(x+':'+y);
  return {x,y,terrain:tile?FROM_GOT[tile.terrain]!:'plain'};
 });
 return make(width,name,cells);
}
export function sharedToGotTiles(portable:SharedSquareMap):WarTerrainTile[]{
 const map=validateSharedSquareMap(portable);
 const toGot:Readonly<Record<SharedSquareTerrain,WarTerrainTile['terrain']>>={
  plain:'plain',forest:'dense-forest',hill:'hill',rock:'wall',
 };
 return map.cells.filter(c=>c.terrain!=='plain').map(c=>({
  x:c.x,y:c.y,terrain:toGot[c.terrain],
 }));
}
export function sharedToCrzMap(portable:SharedSquareMap):CrzMap{
 const map=validateSharedSquareMap(portable);
 const battle=sharedToBattleMap(map);
 return {id:'shared-crz',label:map.name,schemaVersion:2,grid:'square',
  width:map.width,height:map.height,
  tiles:battle.tiles.map(t=>({...t,terrain:t.terrain as Terrain})),
  deployment:battle.deployment};
}
