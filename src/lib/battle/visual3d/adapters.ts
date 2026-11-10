/** Read-only projections. Never import or mutate any battle reducer here. */
import type {WarBattle} from '../got/types';
import type {WarTerrainId} from '../got/terrain';
import type {CrzBattleState} from '@/lib/crusade/battle-state';
import {crzCapable} from '@/lib/crusade/battle-state';
import {crzFootprintCells} from '@/lib/crusade/geometry';
import {dndMilitaryType} from '@/lib/crusade/dnd-military';
import type {VisualSquareMap,VisualTerrain,VisualToken,MiniatureKind} from './tokens';
import {classifyMiniature} from './tokens';

export function gotVisualTerrain(id:WarTerrainId):VisualTerrain{
 if(['stream','river','small-lake','large-lake','coast'].includes(id))return 'water';
 if(['sparse-forest','dense-forest'].includes(id))return 'forest';
 if(['hill','mountain'].includes(id))return 'hill';
 if(['wall','ruins'].includes(id))return 'rock';
 if(['hamlet','small-town','large-town','small-city','large-city'].includes(id))return 'settlement';
 return 'plain';
}
export function gotVisualMap(battle:Pick<WarBattle,'width'|'height'|'tiles'>):VisualSquareMap{
 const terrain=new Map(battle.tiles.map(t=>[t.x+','+t.y,gotVisualTerrain(t.terrain)]));
 return {grid:'square',width:battle.width,height:battle.height,
  tiles:Array.from({length:battle.width*battle.height},(_,i)=>{
   const q=i%battle.width,r=Math.floor(i/battle.width);
   return {q,r,terrain:terrain.get(q+','+r)??'plain'};
  })};
}
export function gotVisualTokens(battle:Pick<WarBattle,'units'>):VisualToken[]{
 return battle.units.filter(unit=>unit.health>0&&
  !['destroyed','escaped','surrendered'].includes(unit.condition)).map(unit=>{
  const art=classifyMiniature(unit.naval?'warships':unit.typeId);
  return {id:unit.id,side:unit.side,name:unit.name,position:{
   q:unit.position.x,r:unit.position.y},...art,
   count:unit.health,metricLabel:'Saúde',naval:unit.naval};
 });
}
export function crzVisualMap(state:CrzBattleState):VisualSquareMap{
 return {...(state.map.grid==='square'?{grid:'square' as const}:{}),
  width:state.map.width,height:state.map.height,
  tiles:state.map.tiles.map(t=>({q:t.q,r:t.r,terrain:t.terrain}))};
}
/** Stable, explicit creature family classification for visual display only. */
export function creatureMiniatureKind(template:{
 id:string;name:string;creatureType:string;tags:readonly string[];
}):{kind:MiniatureKind;fallback:boolean}{
 const military=dndMilitaryType(template.id);
 if(military)return classifyMiniature(military);
 const kind=template.creatureType.toLowerCase();
 const tags=template.tags.map(t=>t.toLowerCase());
 const name=template.name.toLowerCase();
 if(tags.some(t=>t.includes('goblin'))||/^(goblin|hobgoblin|bugbear)\b/i.test(name))
  return {kind:'goblin',fallback:false};
 if(kind==='dragon')return {kind:'dragon',fallback:false};
 if(kind==='undead')return {kind:'undead',fallback:false};
 if(kind==='construct')return {kind:'construct',fallback:false};
 if(kind==='beast'||kind==='monstrosity')return {kind:'beast',fallback:false};
 if(kind==='giant')return {kind:'giant',fallback:false};
 if(kind==='humanoid')return {kind:'humanoid',fallback:false};
 return {kind:'generic',fallback:true};
}
export function crzVisualTokens(state:CrzBattleState):VisualToken[]{
 return state.stacks.filter(crzCapable).map(s=>{
  const art=creatureMiniatureKind(s.template);
  const footprintCells=state.simulationProfile==='dnd-v3'?
   crzFootprintCells(state.map,s.position,s.size):[s.position];
  const flying=Boolean(s.template.flags.flying);
  return {id:s.id,side:s.side,name:s.name,position:{...s.position},
   ...art,count:s.alive,metricLabel:'Vivos',
   footprintCells:footprintCells.map(p=>({q:p.q,r:p.r})),
   flying};
 });
}
