/** Isolated Narrator-only visual previews. Never load the private 300-creature catalogue. */
import type {VisualSquareMap,VisualToken,VisualTerrain,VisualFeature} from './tokens';
import {MONSTER_MINIATURE_KINDS,type MonsterMiniatureKind} from './monster-kinds';

export type AdvancedPreview=Readonly<{
 title:string;note:string;map:VisualSquareMap;tokens:readonly VisualToken[];
}>;
const names:Readonly<Record<MonsterMiniatureKind,string>>={
 goblin:'Goblin',dragon:'Dragão',undead:'Morto-vivo',construct:'Constructo',
 beast:'Fera',giant:'Gigante',humanoid:'Humanoide',
 hobgoblin:'Hobgoblin',bugbear:'Bugbear',orc:'Orc',ogre:'Ogro',
 troll:'Troll',kobold:'Kobold','dragon-young':'Dragão jovem',
 'dragon-elder':'Dragão ancião',dracolich:'Dracolich',
 skeleton:'Esqueleto',zombie:'Zumbi',wraith:'Espectro',lich:'Lich',
 vampire:'Vampiro','stone-golem':'Golem de pedra',
 'iron-golem':'Golem de ferro','animated-armor':'Armadura animada',
 wolf:'Lobo',bear:'Urso',spider:'Aranha gigante',
 elemental:'Elemental',fiend:'Ínfero',celestial:'Celestial',
};
function squareMap(id:string,width:number,height:number,
 terrain:(q:number,r:number)=>VisualTerrain,
 feature?:(q:number,r:number)=>VisualFeature|undefined):VisualSquareMap{
 return {grid:'square',width,height,
  tiles:Array.from({length:width*height},(_,i)=>{
   const q=i%width,r=Math.floor(i/width),detail=feature?.(q,r);
   return {q,r,terrain:terrain(q,r),...(detail?{feature:detail}:{})};
  })};
}
function fakeFootprint(q:number,r:number,size:number,width:number,height:number){
 const startX=Math.max(0,Math.min(width-size,q-Math.floor(size/2)));
 const startY=Math.max(0,Math.min(height-size,r-Math.floor(size/2)));
 return Array.from({length:size*size},(_,i)=>({
  q:startX+i%size,r:startY+Math.floor(i/size),
 }));
}
/** 30 distinct silhouettes across two 15-model pages. Positions are illustrative only. */
export function monsterGalleryPage(page:1|2):AdvancedPreview{
 const types=MONSTER_MINIATURE_KINDS.slice((page-1)*15,page*15);
 const map=squareMap('monster-sculpture-'+page,15,11,
  (q,r)=>r===9&&q>9?'hill':q===0&&r>7?'forest':'plain');
 const tokens:VisualToken[]=types.map((kind,i)=>{
  const q=1+(i%5)*3,r=1+Math.floor(i/5)*3;
  const big=['dragon-elder','dracolich','giant','dragon','ogre'].includes(kind);
  return {id:'demo-creature-'+kind,side:(i%2?'defender':'attacker'),
   name:names[kind],kind,position:{q,r},count:1,fallback:false,
   ...(big?{footprintCells:fakeFootprint(q,r,3,map.width,map.height)}:{}),
   ...(kind.startsWith('dragon')?{flying:true}:{}),
   ...(kind==='dragon-elder'?{cosmeticTint:'red' as const}:{})};
 });
 return {title:page===1?'Monstros I · 15 arquétipos':'Monstros II · 15 arquétipos',
  note:'Amostras originais e fictícias; não são fichas, ações ou criaturas importadas.',
  map,tokens};
}
export function navalVisualPreview():AdvancedPreview{
 const map=squareMap('visual-only-naval',15,11,
  (q,r)=>q<2||q>12?'plain':q===7&&r>=4&&r<=6?'plain':'water',
  (q,r)=>q===1||q===13?'coast':q===7&&r>=4&&r<=6?'island':undefined);
 const tokens:VisualToken[]=[
  {id:'demo-naval-a1',side:'attacker',name:'Galeão azul',kind:'warships',
   position:{q:4,r:2},count:1,fallback:false,naval:true,navalStyle:'galleon'},
  {id:'demo-naval-a2',side:'attacker',name:'Galera azul',kind:'warships',
   position:{q:5,r:7},count:1,fallback:false,naval:true,navalStyle:'galley'},
  {id:'demo-naval-b1',side:'defender',name:'Galeão vermelho',kind:'warships',
   position:{q:10,r:3},count:1,fallback:false,naval:true,navalStyle:'galleon'},
  {id:'demo-naval-b2',side:'defender',name:'Galera vermelha',kind:'warships',
   position:{q:10,r:8},count:1,fallback:false,naval:true,navalStyle:'galley'},
  {id:'demo-naval-coast',side:'attacker',name:'Marinheiros na costa',kind:'sailors',
   position:{q:1,r:5},count:20,fallback:false},
 ];
 return {title:'Litoral e navios · prévia visual',
  note:'Somente maquete de costa e embarcações. Regras navais ainda não implementadas no motor.',
  map,tokens};
}
export function specialTerrainPreview():AdvancedPreview{
 const map=squareMap('visual-only-special',15,11,
  (q,r)=>r===5&&q>=3&&q<=11?'water':
   q>11?'forest':r>=8?'hill':'plain',
  (q,r)=>r===5&&q===7?'bridge':
   r===3&&q>=3&&q<=9?'road':
   q===12&&r===4?'wall':
   q===11&&r===7?'ruins':
   q===3&&r===7?'marsh':
   q===2&&r===2?'fort':undefined);
 const tokens:VisualToken[]=[
  {id:'demo-special-infantry',side:'attacker',name:'Infantaria',
   kind:'infantry',position:{q:4,r:3},count:70,fallback:false},
  {id:'demo-special-archers',side:'defender',name:'Arqueiros',
   kind:'archer',position:{q:10,r:7},count:50,fallback:false},
  {id:'demo-special-dragon',side:'defender',name:'Dragão de grande porte',
   kind:'dragon-elder',position:{q:8,r:8},count:1,fallback:false,
   cosmeticTint:'blue',flying:true,footprintCells:fakeFootprint(8,8,4,15,11)},
 ];
 return {title:'Pontes, muralhas e criaturas grandes',
  note:'Ilustração tridimensional. Obstáculos, voo e áreas ocupadas seguem os motores, não este cenário.',
  map,tokens};
}
