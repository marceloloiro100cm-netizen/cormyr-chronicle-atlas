import type {VisualSquareMap,VisualTerrain,VisualToken} from './tokens';
import {CREATURE_VISUAL_FAMILIES} from './creature-visuals';

/** All scenes below are isolated visual fixtures: no rule, move validation, save
 * or Naval/D&D engine is invoked. They are NOT playable naval battles.
 */
export type ScenicDemoId='creatures'|'coast'|'fortress';
export type ScenicDemo=Readonly<{
 id:ScenicDemoId;label:string;notice:string;
 map:VisualSquareMap;tokens:readonly VisualToken[];
}>;
const square=(width:number,height:number,
 terrain:(q:number,r:number)=>VisualTerrain):VisualSquareMap=>({
 grid:'square',width,height,
 tiles:Array.from({length:width*height},(_,i)=>{
  const q=i%width,r=Math.floor(i/width);
  return {q,r,terrain:terrain(q,r)};
 }),
});
const figure=(id:string,name:string,kind:VisualToken['kind'],
 q:number,r:number,side:VisualToken['side']='attacker',
 options:Partial<VisualToken>={}):VisualToken=>({
 id,name,kind,side,position:{q,r},count:1,fallback:false,...options,
});
const labels:Record<string,string>={
 goblin:'Goblin',kobold:'Kobold',orc:'Orc',dragon:'Dragão',
 undead:'Morto-vivo',skeleton:'Esqueleto',zombie:'Zumbi',spirit:'Espírito',
 construct:'Constructo',beast:'Fera',giant:'Gigante',humanoid:'Humanoide',
 elemental:'Elemental',fiend:'Infernal',celestial:'Celestial',
 aberration:'Aberração',ooze:'Limo',plant:'Planta',fey:'Feérico',
 insect:'Inseto',spider:'Aranha',serpent:'Serpente',troll:'Troll',
 aquatic:'Criatura aquática',swarm:'Enxame',
};
export function creatureGalleryScene():ScenicDemo{
 const map=square(15,11,(q,r)=>q===0&&r%3===0?'hill':(q+r)%13===0?'forest':'plain');
 return {id:'creatures',label:'25 famílias de monstros',
  notice:'Modelos geométricos originais; nomes de famílias, sem fichas ou conteúdo protegido do bestiário.',
  map,tokens:CREATURE_VISUAL_FAMILIES.map((kind,i)=>
   figure('demo-creature-'+kind,labels[kind]??kind,kind,
    1+(i%5)*3,1+Math.floor(i/5)*2,i<13?'attacker':'defender',
    {...(['dragon','giant','troll'].includes(kind)?
     {footprintCells:Array.from({length:4},(_,n)=>({
       q:1+(i%5)*3+n%2,r:1+Math.floor(i/5)*2+Math.floor(n/2),
      }))}:{}),
     ...(kind==='spirit'||kind==='celestial'||kind==='dragon'?{flying:true}:{})})),
 };
}
export function coastalNavalScene():ScenicDemo{
 const map=square(15,11,(q,r)=>q>=7?'water':q===6?'coast':
  q===5?'desert':q===3&&r===5?'settlement':
  (q===2&&r>6)?'forest':(q+r)%11===0?'hill':'plain');
 return {id:'coast',label:'Costa e embarcações',
  notice:'Prévia visual naval, sem movimento ou combate naval: o motor terrestre permanece bloqueando navios.',
  map,tokens:[
   figure('demo-naval-one','Navio militar I','warships',10,3,'attacker',{naval:true,count:3}),
   figure('demo-naval-two','Navio militar II','warships',12,7,'defender',{naval:true,count:2}),
   figure('demo-naval-three','Escolta costeira','warships',8,6,'attacker',{naval:true,count:1}),
   figure('demo-coast-sailor','Marinheiros','sailors',3,3,'attacker',{count:80}),
   figure('demo-coast-guard','Guarnição costeira','garrison',4,8,'defender',{count:60}),
  ]};
}
export function ruinedBridgeScene():ScenicDemo{
 const map=square(15,11,(q,r)=>{
  if(q===7)return r===5?'bridge':'water';
  if(q===6||q===8)return 'road';
  if(q===3&&r>=3&&r<=5)return 'ruins';
  if(q===11&&r>=2&&r<=4)return 'rock';
  if(q===2&&r===8)return 'settlement';
  if(q>=10&&r>=7)return 'forest';
  if(q===11&&r===1)return 'mountain';
  if(q===4&&r>=8)return 'marsh';
  return 'plain';
 });
 const cells=Array.from({length:16},(_,i)=>({q:10+i%4,r:6+Math.floor(i/4)}));
 return {id:'fortress',label:'Ponte e fortaleza',
  notice:'Terrenos, pontes, ruínas e dragão 4×4 são apenas demonstração gráfica. Não alteram movimento, cobertura ou alcance.',
  map,tokens:[
   figure('demo-bridge-guard','Guarda da ponte','garrison',5,5,'attacker',{count:60}),
   figure('demo-bridge-archer','Arqueiros','archer',3,7,'attacker',{count:40}),
   figure('demo-bridge-giant','Gigante','giant',9,3,'defender',{count:1,
    footprintCells:[{q:8,r:3},{q:9,r:3},{q:8,r:4},{q:9,r:4}]}),
   figure('demo-bridge-dragon','Dragão colossal','dragon',11,7,'defender',
    {flying:true,count:1,footprintCells:cells}),
  ]};
}
export function scenicDemo(id:ScenicDemoId):ScenicDemo{
 switch(id){
  case 'creatures':return creatureGalleryScene();
  case 'coast':return coastalNavalScene();
  case 'fortress':return ruinedBridgeScene();
 }
}
