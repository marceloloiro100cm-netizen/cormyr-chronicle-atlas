/** Read-only projections. Never import or mutate any battle reducer here. */
import type {WarBattle} from '../got/types';
import type {WarTerrainId,WarTerrainTile} from '../got/terrain';
import type {CrzBattleState} from '@/lib/crusade/battle-state';
import {crzCapable} from '@/lib/crusade/battle-state';
import {crzFootprintCells} from '@/lib/crusade/geometry';
import {dndMilitaryType} from '@/lib/crusade/dnd-military';
import type {VisualSquareMap,VisualTerrain,VisualFeature,VisualToken,MiniatureKind} from './tokens';
import {dragonTintFromName} from './monster-kinds';
import type {DragonMiniatureTint} from './monster-kinds';
import {classifyMiniature} from './tokens';

export function gotVisualTerrain(id:WarTerrainId):VisualTerrain{
 if(['stream','river','small-lake','large-lake','coast'].includes(id))return 'water';
 if(['sparse-forest','dense-forest'].includes(id))return 'forest';
 if(['hill','mountain'].includes(id))return 'hill';
 if(['wall','ruins'].includes(id))return 'rock';
 if(['hamlet','small-town','large-town','small-city','large-city'].includes(id))return 'settlement';
 return 'plain';
}
/** Decorative feature only; road/bridge never changes movement costs here. */
export function gotVisualFeature(tile:WarTerrainTile):VisualFeature|undefined{
 if(tile.bridge&&tile.terrain==='river')return 'bridge';
 if(tile.road||tile.terrain==='road')return 'road';
 if(tile.terrain==='wall')return 'wall';
 if(tile.terrain==='ruins')return 'ruins';
 if(tile.terrain==='marsh')return 'marsh';
 if(tile.terrain==='island')return 'island';
 if(tile.terrain==='coast')return 'coast';
 return undefined;
}
export function gotVisualMap(battle:Pick<WarBattle,'width'|'height'|'tiles'>):VisualSquareMap{
 const source=new Map(battle.tiles.map(t=>[t.x+','+t.y,t]));
 return {grid:'square',width:battle.width,height:battle.height,
  tiles:Array.from({length:battle.width*battle.height},(_,i)=>{
   const q=i%battle.width,r=Math.floor(i/battle.width);
   const tile=source.get(q+','+r);
   const feature=tile?gotVisualFeature(tile):undefined;
   return {q,r,terrain:gotVisualTerrain(tile?.terrain??'plain'),
    ...(feature?{feature}:{})};
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
const norm=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export type CreatureArt=Readonly<{
 kind:MiniatureKind;fallback:boolean;cosmeticTint?:DragonMiniatureTint;
}>;
/** Classify published metadata / authorized local private metadata at runtime.
 * No private bestiary is serialized, bundled, logged, or exported.
 */
export function creatureMiniatureKind(template:{
 id:string;name:string;creatureType:string;tags:readonly string[];
}):CreatureArt{
 const military=dndMilitaryType(template.id);
 if(military)return classifyMiniature(military);
 const type=norm(template.creatureType);
 const text=norm([template.name,...template.tags].join(' '));
 const named=(re:RegExp)=>re.test(text);
 const dragon=type==='dragon'||named(/\b(dragon|dragao|drake|draco|dracolich)\b/);
 if(dragon){
  const cosmeticTint=dragonTintFromName(text);
  const kind:MiniatureKind=named(/\b(dracolich|draco-lich)\b/)?'dracolich':
   named(/\b(ancient|anciao|ancia|greatwyrm|elder|antigo)\b/)?'dragon-elder':
   named(/\b(young|jovem|filhote|wyrmling|juvenile)\b/)?'dragon-young':'dragon';
  return {kind,fallback:false,...(cosmeticTint?{cosmeticTint}:{})};
 }
 if(type==='undead'||named(/\b(morto.vivo|undead)\b/)){
  return {kind:named(/\b(lich|liches)\b/)?'lich':
   named(/\b(vampire|vampiro)\b/)?'vampire':
   named(/\b(wraith|specter|spectre|espectro|apari[cç]ao|fantasma)\b/)?'wraith':
   named(/\b(skeleton|esqueleto)\b/)?'skeleton':
   named(/\b(zombie|zumbi)\b/)?'zombie':'undead',fallback:false};
 }
 if(type==='construct'||named(/\b(constructo|construct|construto)\b/)){
  return {kind:named(/\b(iron.golem|golem.de.ferro)\b/)?'iron-golem':
   named(/\b(stone.golem|golem.de.pedra)\b/)?'stone-golem':
   named(/\b(animated.armor|armadura.animada)\b/)?'animated-armor':
   'construct',fallback:false};
 }
 if(named(/\b(hobgoblin)\b/))return {kind:'hobgoblin',fallback:false};
 if(named(/\b(bugbear)\b/))return {kind:'bugbear',fallback:false};
 if(named(/\b(goblin|goblinoide)\b/))return {kind:'goblin',fallback:false};
 if(named(/\b(kobold)\b/))return {kind:'kobold',fallback:false};
 if(named(/\b(ogre|ogro)\b/))return {kind:'ogre',fallback:false};
 if(named(/\b(troll)\b/))return {kind:'troll',fallback:false};
 if(named(/\b(orc|orco)\b/))return {kind:'orc',fallback:false};
 if(type==='giant'||named(/\b(gigante|giant)\b/))return {kind:'giant',fallback:false};
 if(type==='elemental')return {kind:'elemental',fallback:false};
 if(type==='fiend'||type==='demon'||type==='devil')return {kind:'fiend',fallback:false};
 if(type==='celestial')return {kind:'celestial',fallback:false};
 if(type==='beast'||type==='monstrosity'){
  return {kind:named(/\b(wolf|lobo|wolves|lobos)\b/)?'wolf':
   named(/\b(bear|urso|ursos)\b/)?'bear':
   named(/\b(spider|aranha)\b/)?'spider':'beast',fallback:false};
 }
 if(type==='humanoid')return {kind:'humanoid',fallback:false};
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
