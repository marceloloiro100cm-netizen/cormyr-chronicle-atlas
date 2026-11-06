import type {BattleMap,MapTile,Terrain} from '../domain/types';
import {createScenario,type BattleScenarioId} from '../geometry/map-fixtures';
import {axialToOffset,hexKey,hexNeighbors} from '../geometry/hex';
import {assertBattleMap} from '../geometry/map-validation';

/** Ambientes ORIGINAIS de treino: nenhuma alteração em mapa oficial, casas ou banco. */
export const V38_THEATRE_VERSION='CCA-V38-THEATRE-1' as const;
export type V38TheatreId=
 'crownlands'|'stonelands'|'dragon-coast'|'volkumburgh'|'ashkar-savanna';
export type V38Theatre=Readonly<{
 id:V38TheatreId;name:string;subtitle:string;description:string;icon:string;
 accent:string;sky:string;earth:string;hill:string;forest:string;rock:string;
}>;
export const V38_THEATRES:readonly V38Theatre[]=[
 {id:'crownlands',name:'Terras da Coroa',subtitle:'Estrada de Suzail',
  description:'Campos, bosques e ruínas de estrada. Defesa de passagem e terreno misto.',
  icon:'♛',accent:'#e8bf78',sky:'#3b5248',earth:'#8a926d',hill:'#b99a6f',
  forest:'#426d4f',rock:'#797a72'},
 {id:'stonelands',name:'Stonelands',subtitle:'Gargantas de fronteira',
  description:'Rochas intransponíveis, elevações e desfiladeiros com corredores de avanço.',
  icon:'◆',accent:'#d3b5a1',sky:'#4e5260',earth:'#81796d',hill:'#b29a8a',
  forest:'#495c52',rock:'#6d6770'},
 {id:'dragon-coast',name:'Dragon Coast',subtitle:'Estrada costeira',
  description:'Vegetação úmida e entulho costeiro, com acesso tático limitado pelas rochas.',
  icon:'⚓',accent:'#8fc2be',sky:'#264e59',earth:'#808c7d',hill:'#949d91',
  forest:'#426f67',rock:'#59696b'},
 {id:'volkumburgh',name:'Volkumburgh',subtitle:'Bosques do interior',
  description:'Floresta densa, cercas de pedra e colinas sob tempo fechado.',
  icon:'♜',accent:'#b2bd8a',sky:'#283c35',earth:'#667b58',hill:'#8a8968',
  forest:'#2f5b47',rock:'#5c6a60'},
 {id:'ashkar-savanna',name:'Terras de Ashkar',subtitle:'Savana vulcânica',
  description:'Dunas baixas, capões de vegetação e afloramentos de basalto.',
  icon:'♨',accent:'#f2b578',sky:'#805347',earth:'#d19c63',hill:'#bd784b',
  forest:'#777b48',rock:'#50494c'},
] as const;

export type V38Decoration='camp'|'cairn'|'palisade'|'treefall'|'coastal-debris'|
 'rock-wall'|'scrub'|'dunes'|'basalt'|'watchfire'|'none';
const entry=(id:V38TheatreId):V38Theatre=>{
 const found=V38_THEATRES.find(x=>x.id===id);
 if(!found)throw new Error('Teatro de batalha desconhecido.');
 return found;
};
export function v38TheatreFromMap(map:BattleMap):V38Theatre|null{
 const found=V38_THEATRES.find(x=>map.id.startsWith('v38-'+x.id+'-'));
 return found??null;
}
const hash=(column:number,row:number,salt:number)=>
 ((column+3)*37+(row+5)*53+(column*row)*7+salt*11)%37;
const terrainFor=(id:V38TheatreId,col:number,row:number,base:Terrain):Terrain=>{
 const seed=V38_THEATRES.findIndex(t=>t.id===id)+1;
 const v=hash(col,row,seed),r=(2*col+row+seed)%9;
 if(id==='crownlands'){
  if(v===4||v===27)return 'rock';
  if(r===2||r===3)return 'forest';
  if(v%9===0)return 'hill';
  return base==='rock'?'hill':base;
 }
 if(id==='stonelands'){
  if(v%7===0||v===14)return 'rock';
  if(v%4<=1)return 'hill';
  return base==='forest'?'plain':base;
 }
 if(id==='dragon-coast'){
  if(v===6||v===22)return 'rock';
  if(r===1||r===5)return 'forest';
  if(v%6===0)return 'hill';
  return base==='rock'?'plain':base;
 }
 if(id==='volkumburgh'){
  if(v===11||v===29)return 'rock';
  if(r<=3)return 'forest';
  if(v%5===0)return 'hill';
  return base==='rock'?'forest':base;
 }
 if(v===7||v===31)return 'rock';
 if(v%4<2)return 'hill';
 if(r===4)return 'forest';
 return base==='forest'?'plain':base;
};
/** Preserva zona de implantação, mas cria variedade dentro da malha já validada. */
export function createV38TheatreMap(id:V38TheatreId,scenario:BattleScenarioId,
 width:11|15=11):BattleMap{
 const theme=entry(id),base=createScenario(scenario,width);
 const tiles:MapTile[]=base.tiles.map(tile=>{
  const {column,row}=axialToOffset(tile);
  if(column<2||column>base.width-3)return tile; // zonas intocadas
  // Corredor central evita paredões totalmente fechados, sem remover riscos laterais.
  const onCorridor=row===Math.floor(base.height/2);
  const proposed=terrainFor(id,column,row,tile.terrain);
  return {...tile,terrain:onCorridor&&proposed==='rock'?'hill':proposed};
 });
 const map:BattleMap={...base,id:'v38-'+id+'-'+scenario,
  label:theme.name+' · '+theme.subtitle+' · '+base.label,tiles};
 assertBattleMap(map);
 return map;
}
/** Elemento puramente ilustrativo: a jogabilidade é determinada APENAS por tile.terrain. */
export function v38DecorationFor(map:BattleMap,tile:MapTile):V38Decoration{
 const theme=v38TheatreFromMap(map);
 if(!theme)return 'none';
 const {column,row}=axialToOffset(tile),h=hash(column,row,7);
 if(tile.terrain==='rock'){
  if(theme.id==='ashkar-savanna')return 'basalt';
  if(theme.id==='stonelands'||theme.id==='volkumburgh')return 'rock-wall';
  return 'palisade';
 }
 if(tile.terrain==='hill'){
  if(theme.id==='ashkar-savanna')return 'dunes';
  return h%3===0?'cairn':'none';
 }
 if(tile.terrain==='forest'){
  if(theme.id==='dragon-coast')return 'treefall';
  return theme.id==='ashkar-savanna'?'scrub':'none';
 }
 if(h%11===0){
  return theme.id==='dragon-coast'?'coastal-debris':
   theme.id==='ashkar-savanna'?'scrub':theme.id==='volkumburgh'?'watchfire':'camp';
 }
 return 'none';
}
export function v38TileCounts(map:BattleMap):Readonly<Record<Terrain,number>>{
 const total:{plain:number;forest:number;hill:number;rock:number}={
  plain:0,forest:0,hill:0,rock:0,
 };
 for(const tile of map.tiles)total[tile.terrain]++;
 return total;
}
export function v38PathReachable(map:BattleMap):boolean{
 const passable=new Set(map.tiles.filter(t=>t.terrain!=='rock').map(hexKey));
 const pending=[...map.deployment.attacker].filter(x=>passable.has(hexKey(x)));
 const visited=new Set(pending.map(hexKey));
 for(let index=0;index<pending.length;index++){
  const here=pending[index]!;
  for(const next of hexNeighbors(here)){
   const key=hexKey(next);
   if(!passable.has(key)||visited.has(key))continue;
   visited.add(key);pending.push(next);
  }
 }
 return map.deployment.defender.some(x=>visited.has(hexKey(x)));
}
