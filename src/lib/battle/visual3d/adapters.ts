/** Read-only projections. Never import or mutate any battle reducer here. */
import type {WarBattle} from '../got/types';
import type {WarTerrainId,WarTerrainTile,WarVisibility,WarWeather} from '../got/terrain';
import {terrainEffect,terrainMoveCost} from '../got/terrain';
import type {CrzBattleState} from '@/lib/crusade/battle-state';
import {crzCapable} from '@/lib/crusade/battle-state';
import {crzFootprintCells} from '@/lib/crusade/geometry';
import {dndMilitaryType} from '@/lib/crusade/dnd-military';
import type {VisualSquareMap,VisualTerrain,VisualToken,MiniatureKind} from './tokens';
import {classifyMiniature} from './tokens';
import {classifyCreatureArtwork} from './creature-visuals';
export {classifyCreatureArtwork} from './creature-visuals';

export function gotVisualTerrain(id:WarTerrainId):VisualTerrain{
 if(['stream','river','small-lake','large-lake'].includes(id))return 'water';
 if(['sparse-forest','dense-forest'].includes(id))return 'forest';
 if(id==='hill')return 'hill';
 if(id==='mountain')return 'mountain';
 if(id==='wall')return 'rock';
 if(id==='ruins')return 'ruins';
 if(['hamlet','small-town','large-town','small-city','large-city'].includes(id))return 'settlement';
 if(id==='desert')return 'desert';
 if(id==='marsh')return 'marsh';
 if(id==='road')return 'road';
 if(['island','coast'].includes(id))return 'coast';
 return 'plain';
}
/** Only official GOT terrain metadata is eligible for rules annotation.
 * This is a summary, not a replacement for orders, situational modifiers or pathfinding.
 */
export function gotTerrainNotes(tile:WarTerrainTile,weather?:WarWeather,
 visibility?:WarVisibility):readonly string[]{
 const rules=terrainEffect(tile),notes:string[]=[];
 if(weather&&visibility)notes.push('Custo de entrada: '+terrainMoveCost(tile,visibility,weather)+' casa(s) · considerando clima e visibilidade');
 else if(rules.slow>0)notes.push('Terreno lento: '+rules.slow+' nível(is) base');
 if(rules.cover>0)notes.push('Cobertura ao defender: +'+rules.cover);
 if(rules.highGroundBonusDice>0)notes.push('Vantagem de altura condicional: +'+rules.highGroundBonusDice+' dado(s)');
 if(rules.blocked)notes.push('Terreno bloqueado · consulte exceções do motor');
 if(rules.noCavalry)notes.push('Restrição de cavalaria');
 if(rules.noSiege)notes.push('Restrição de cerco');
 if(rules.naval)notes.push('Área com regras navais');
 return notes;
}
/** Bridges/roads are only graphic annotations. A river bridge is not treated
 * as new navigable terrain by the renderer; the GOT engine remains authoritative.
 */
export function gotVisualMap(battle:Pick<WarBattle,'width'|'height'|'tiles'> &
 Partial<Pick<WarBattle,'weather'|'visibility'>>):VisualSquareMap{
 const terrain=new Map(battle.tiles.map(t=>[t.x+','+t.y,t] as const));
 return {grid:'square',width:battle.width,height:battle.height,
  tiles:Array.from({length:battle.width*battle.height},(_,i)=>{
   const q=i%battle.width,r=Math.floor(i/battle.width),tile=terrain.get(q+','+r);
   return {q,r,terrain:tile?.bridge?'bridge':tile?.road?'road':
     gotVisualTerrain(tile?.terrain??'plain'),
    ...(tile?.road?{road:true}:{}),...(tile?.bridge?{bridge:true}:{}),
    ...(tile?{ruleNotes:gotTerrainNotes(tile,battle.weather,battle.visibility)}:{})};
  })};
}
export function gotVisualTokens(battle:Pick<WarBattle,'units'>):VisualToken[]{
 return battle.units.filter(unit=>unit.health>0&&
  !['destroyed','escaped','surrendered'].includes(unit.condition)).map(unit=>{
  const art=classifyMiniature(unit.naval?'warships':unit.typeId);
  return {id:unit.id,side:unit.side,name:unit.name,position:{
   q:unit.position.x,r:unit.position.y},...art,
   count:unit.health,metricLabel:'Saúde',naval:unit.naval,
   tactical:{
    health:'Saúde '+unit.health+'/'+unit.maxHealth,
    defense:'Defesa '+unit.defense,
    morale:unit.condition==='organized'?'Organizada':
     unit.condition==='disorganized'?'Desorganizada':unit.condition==='routed'?
     'Em retirada':unit.condition,
    attack:'Dano corpo a corpo '+unit.meleeDamage,
   }};
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
 return classifyCreatureArtwork(template);
}
export function crzVisualTokens(state:CrzBattleState):VisualToken[]{
 return state.stacks.filter(crzCapable).map(s=>{
  const art=creatureMiniatureKind(s.template);
  const footprintCells=state.simulationProfile==='dnd-v3'?
   crzFootprintCells(state.map,s.position,s.size):[s.position];
  const flying=Boolean(s.template.flags.flying);
  return {id:s.id,side:s.side,name:s.name,position:{...s.position},
   ...art,count:s.alive,metricLabel:'Vivos',
   tactical:{
    health:'PV '+s.hpPool,
    defense:'CA '+s.acBase,
    movement:'Deslocamento '+(s.movementHex*3)+' m',
    morale:'Vivos '+s.alive+'/'+s.initialCount,
   },
   footprintCells:footprintCells.map(p=>({q:p.q,r:p.r})),
   flying};
 });
}
