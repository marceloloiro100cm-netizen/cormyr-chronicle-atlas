import {WAR_FORT_PROFILES,type WarFortKind} from './fortifications';
import {WAR_TERRAIN,terrainEffect,type WarTerrainId,type WarTerrainTile} from './terrain';
import type {WarPosition,WarSide} from './types';

/** Construtor de mapas do modo Game of Thrones.
 * Reúne terrenos da Tabela 10-3 e fortificações do capítulo 10 em peças
 * prontas. Nada aqui cria regra: os efeitos descritos são lidos das mesmas
 * tabelas que o motor usa ao resolver movimento, Defesa e ataques.
 */
export type WarTerrainGroup='Campo'|'Elevação'|'Vegetação'|'Água'|'Povoado'|'Obstáculo';
export type WarTerrainInfo=Readonly<{
 id:WarTerrainId;label:string;glyph:string;color:string;group:WarTerrainGroup;
}>;
export const WAR_TERRAIN_CATALOG:readonly WarTerrainInfo[]=[
 {id:'plain',label:'Planície',glyph:'',color:'#d4c69e',group:'Campo'},
 {id:'pasture',label:'Pasto',glyph:'⁘',color:'#c6cf93',group:'Campo'},
 {id:'road',label:'Estrada',glyph:'═',color:'#cbb388',group:'Campo'},
 {id:'desert',label:'Deserto',glyph:'∴',color:'#e6cf8e',group:'Campo'},
 {id:'hill',label:'Colina',glyph:'◠',color:'#c4a36f',group:'Elevação'},
 {id:'mountain',label:'Montanha',glyph:'▲',color:'#8d8780',group:'Elevação'},
 {id:'sparse-forest',label:'Floresta esparsa',glyph:'♣',color:'#8fae7a',group:'Vegetação'},
 {id:'dense-forest',label:'Floresta densa',glyph:'♣♣',color:'#66886b',group:'Vegetação'},
 {id:'marsh',label:'Pântano',glyph:'≋',color:'#7f9a78',group:'Vegetação'},
 {id:'stream',label:'Riacho',glyph:'~',color:'#9cc7d6',group:'Água'},
 {id:'river',label:'Rio',glyph:'≈',color:'#4f8fb5',group:'Água'},
 {id:'small-lake',label:'Lago pequeno',glyph:'≈',color:'#6aa7c4',group:'Água'},
 {id:'large-lake',label:'Mar ou lago grande',glyph:'≈≈',color:'#3d7aa3',group:'Água'},
 {id:'coast',label:'Litoral',glyph:'⌇',color:'#e4d7a6',group:'Água'},
 {id:'island',label:'Ilha',glyph:'◍',color:'#b9c98f',group:'Água'},
 {id:'hamlet',label:'Vilarejo',glyph:'⌂',color:'#d6b48c',group:'Povoado'},
 {id:'small-town',label:'Vila pequena',glyph:'⌂',color:'#c99f78',group:'Povoado'},
 {id:'large-town',label:'Vila grande',glyph:'⌂⌂',color:'#b98a66',group:'Povoado'},
 {id:'small-city',label:'Cidade pequena',glyph:'▙',color:'#a87d62',group:'Povoado'},
 {id:'large-city',label:'Cidade grande',glyph:'▙▟',color:'#96705a',group:'Povoado'},
 {id:'wall',label:'Muralha',glyph:'▦',color:'#787478',group:'Obstáculo'},
 {id:'ruins',label:'Ruínas',glyph:'▚',color:'#a39c8c',group:'Obstáculo'},
];
const INFO=new Map(WAR_TERRAIN_CATALOG.map(t=>[t.id,t] as const));
export const warTerrainInfo=(id:WarTerrainId):WarTerrainInfo=>INFO.get(id)??WAR_TERRAIN_CATALOG[0]!;
export const WAR_TERRAIN_COLORS:Readonly<Record<string,string>>=
 Object.fromEntries(WAR_TERRAIN_CATALOG.map(t=>[t.id,t.color]));
export const WAR_TERRAIN_GLYPHS:Readonly<Record<string,string>>=
 Object.fromEntries(WAR_TERRAIN_CATALOG.map(t=>[t.id,t.glyph]));
/** Efeitos do terreno em frases curtas, lidos da tabela usada pelo motor. */
export function terrainRules(id:WarTerrainId,tile?:Pick<WarTerrainTile,'road'|'bridge'>):readonly string[]{
 const e=terrainEffect({x:0,y:0,terrain:id,...(tile?.road?{road:true}:{}),...(tile?.bridge?{bridge:true}:{})});
 const rules:string[]=[];
 if(e.blocked)rules.push(e.naval?'Intransponível a pé (só navios)':'Intransponível');
 if(e.slow)rules.push('Movimento −'+e.slow*10+' m');
 if(e.cover)rules.push('Defesa +'+e.cover+' ao Defender');
 if(e.highGroundBonusDice)rules.push('Terreno alto: +'+e.highGroundBonusDice+'B contra quem está abaixo');
 if(e.noCavalry)rules.push('Sem cavalaria');
 if(e.noSiege)rules.push('Sem armas de cerco');
 if(e.naval&&!e.blocked)rules.push('Permite navios');
 if(id==='wall'||id==='mountain')rules.push('Bloqueia a linha de tiro');
 if(tile?.bridge)rules.push('Ponte: travessia liberada');
 return rules.length?rules:['Sem efeito'];
}
export const fortRules=(kind:WarFortKind):string=>
 'Defesa +'+WAR_FORT_PROFILES[kind].defense+' · abriga até '+WAR_FORT_PROFILES[kind].capacity+
 (WAR_FORT_PROFILES[kind].capacity===1?' tropa':' tropas');
/** Escopo do campo (cada quadrado tem 10 m). O tiro de longo alcance vale 200 m. */
export const WAR_FIELD_SIZES=[
 {id:'small',label:'Pequeno · 120 m',width:12,height:7},
 {id:'medium',label:'Médio · 200 m',width:20,height:10},
 {id:'large',label:'Grande · 280 m',width:28,height:12},
] as const;
export type WarFieldSizeId=typeof WAR_FIELD_SIZES[number]['id'];
export type WarMapFort=Readonly<{id:string;kind:WarFortKind;side:WarSide;cells:readonly WarPosition[]}>;
export type WarMapDraft=Readonly<{
 width:number;height:number;tiles:readonly WarTerrainTile[];forts:readonly WarMapFort[];
}>;
export const emptyWarMap=(width:number,height:number):WarMapDraft=>({width,height,tiles:[],forts:[]});
const key=(p:WarPosition):string=>p.x+':'+p.y;
const inside=(d:Pick<WarMapDraft,'width'|'height'>,p:WarPosition):boolean=>
 Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<d.width&&p.y<d.height;
const FOOTPRINTS:Readonly<Record<WarFortKind,readonly (readonly [number,number])[]>>={
 tower:[[0,0]],temporary:[[0,0]],hall:[[0,0],[0,1]],
 'small-castle':[[0,-1],[0,0],[0,1]],
 castle:[[0,0],[0,-1],[0,1],[-1,0],[1,0]],
 'superior-castle':[[0,-2],[0,-1],[0,0],[0,1],[0,2],[1,-2],[1,-1],[1,0],[1,1],[1,2]],
};
/** Quadrados que a construção ocupa, deslocados para caber no mapa. */
export function fortFootprint(kind:WarFortKind,at:WarPosition,
 size:Pick<WarMapDraft,'width'|'height'>):readonly WarPosition[]{
 const shape=FOOTPRINTS[kind];
 const xs=shape.map(s=>s[0]),ys=shape.map(s=>s[1]);
 const x=Math.max(-Math.min(...xs),Math.min(size.width-1-Math.max(...xs),at.x));
 const y=Math.max(-Math.min(...ys),Math.min(size.height-1-Math.max(...ys),at.y));
 return shape.map(([dx,dy])=>({x:x+dx,y:y+dy})).filter(p=>inside(size,p));
}
export function paintWarTerrain(draft:WarMapDraft,terrain:WarTerrainId,at:WarPosition,
 extra:{road?:boolean;bridge?:boolean}={}):WarMapDraft{
 if(!inside(draft,at)||!(terrain in WAR_TERRAIN))return draft;
 const rest=draft.tiles.filter(t=>t.x!==at.x||t.y!==at.y);
 const plainTile=terrain==='plain'&&!extra.road&&!extra.bridge;
 const blocked=terrainEffect({x:0,y:0,terrain,...(extra.bridge?{bridge:true}:{})}).blocked;
 return {...draft,
  tiles:plainTile?rest:[...rest,{x:at.x,y:at.y,terrain,
   ...(extra.road?{road:true}:{}),...(extra.bridge?{bridge:true}:{})}],
  // Uma construção não fica de pé sobre terreno intransponível.
  forts:blocked?draft.forts.filter(f=>!f.cells.some(c=>key(c)===key(at))):draft.forts};
}
export function removeWarFortAt(draft:WarMapDraft,at:WarPosition):WarMapDraft{
 return {...draft,forts:draft.forts.filter(f=>!f.cells.some(c=>key(c)===key(at)))};
}
export function placeWarFort(draft:WarMapDraft,kind:WarFortKind,side:WarSide,at:WarPosition):WarMapDraft{
 if(!inside(draft,at)||!(kind in WAR_FORT_PROFILES))return draft;
 const cells=fortFootprint(kind,at,draft);
 const taken=new Set(cells.map(key));
 const forts=draft.forts.filter(f=>!f.cells.some(c=>taken.has(key(c))));
 let n=1;
 while(forts.some(f=>f.id===side+'-'+kind+'-'+n))n++;
 return {...draft,
  // O terreno sob a construção precisa ser transitável para abrigar tropas.
  tiles:draft.tiles.filter(t=>!taken.has(key(t))||!terrainEffect(t).blocked),
  forts:[...forts,{id:side+'-'+kind+'-'+n,kind,side,cells}]};
}
export const fortAt=(draft:Pick<WarMapDraft,'forts'>,at:WarPosition):WarMapFort|null=>
 draft.forts.find(f=>f.cells.some(c=>key(c)===key(at)))??null;
/** O que este mapa muda na batalha, em linguagem de mesa. */
export function mapRuleSummary(draft:WarMapDraft):readonly string[]{
 const lines:string[]=[];
 const counts=new Map<string,{tile:WarTerrainTile;n:number}>();
 for(const tile of draft.tiles){
  const id=tile.terrain+(tile.bridge?'+ponte':'')+(tile.road?'+estrada':'');
  counts.set(id,{tile,n:(counts.get(id)?.n??0)+1});
 }
 for(const {tile,n} of counts.values()){
  const rules=terrainRules(tile.terrain,tile);
  if(rules[0]==='Sem efeito')continue;
  lines.push(warTerrainInfo(tile.terrain).label+(tile.bridge?' com ponte':tile.road?' com estrada':'')+
   ' ('+n+'): '+rules.join(' · '));
 }
 for(const fort of draft.forts)lines.push(WAR_FORT_PROFILES[fort.kind].label+' do '+
  (fort.side==='attacker'?'Atacante':'Defensor')+': '+fortRules(fort.kind));
 return lines;
}
const fill=(xs:readonly number[],ys:readonly number[],terrain:WarTerrainId,
 extra:{road?:boolean;bridge?:boolean}={}):WarTerrainTile[]=>
 xs.flatMap(x=>ys.map(y=>({x,y,terrain,...extra})));
const range=(from:number,to:number):number[]=>
 Array.from({length:Math.max(0,to-from+1)},(_,i)=>from+i);
export type WarMapPreset=Readonly<{
 id:string;label:string;hint:string;build:(width:number,height:number)=>WarMapDraft;
}>;
/** Cenários prontos. O Atacante entra pela esquerda; o Defensor ocupa a direita. */
export const WAR_MAP_PRESETS:readonly WarMapPreset[]=[
 {id:'open',label:'Campo aberto',hint:'Sem obstáculos: decide a tropa.',
  build:(w,h)=>emptyWarMap(w,h)},
 {id:'hills',label:'Colinas do defensor',hint:'O Defensor atira de cima: +1B em terreno alto.',
  build:(w,h)=>({...emptyWarMap(w,h),tiles:fill(range(w-4,w-2),range(0,h-1),'hill')})},
 {id:'river',label:'Travessia do rio',hint:'Um rio corta o campo; só as pontes atravessam.',
  build:(w,h)=>{
   const x=Math.floor(w/2),bridges=new Set([Math.floor(h/4),Math.floor(3*h/4)]);
   return {...emptyWarMap(w,h),tiles:range(0,h-1).map(y=>({x,y,terrain:'river' as const,
    ...(bridges.has(y)?{bridge:true}:{})}))};
  }},
 {id:'forest',label:'Floresta',hint:'Bosques no centro dão cobertura a quem se defende.',
  build:(w,h)=>{
   const c=Math.floor(w/2);
   return {...emptyWarMap(w,h),tiles:[
    ...fill(range(c-2,c-1),range(0,Math.floor(h/2)-1),'dense-forest'),
    ...fill(range(c,c+1),range(Math.floor(h/2)+1,h-1),'dense-forest'),
    ...fill([c-3,c+2],range(1,h-2),'sparse-forest')]};
  }},
 {id:'pass',label:'Desfiladeiro',hint:'Montanhas fecham os flancos; a luta afunila no centro.',
  build:(w,h)=>{
   const from=Math.floor(w/3),to=w-1-Math.floor(w/3),band=Math.max(1,Math.floor((h-3)/2));
   return {...emptyWarMap(w,h),tiles:[
    ...fill(range(from,to),range(0,band-1),'mountain'),
    ...fill(range(from,to),range(h-band,h-1),'mountain')]};
  }},
 {id:'coast',label:'Litoral',hint:'Mar ao sul e faixa de praia.',
  build:(w,h)=>({...emptyWarMap(w,h),tiles:[
   ...fill(range(0,w-1),[h-1],'large-lake'),...fill(range(0,w-1),[h-2],'coast')]})},
 {id:'tower',label:'Torre de vigia',hint:'Uma torre sobre a colina abriga uma tropa: Defesa +3.',
  build:(w,h)=>placeWarFort({...emptyWarMap(w,h),
   tiles:fill(range(w-4,w-2),range(Math.floor(h/2)-1,Math.floor(h/2)+1),'hill')},
   'tower','defender',{x:w-3,y:Math.floor(h/2)})},
 {id:'castle',label:'Castelo',hint:'Castelo atrás de muralha com portão: Defesa +8 para até 5 tropas.',
  build:(w,h)=>{
   const mid=Math.floor(h/2),wall=w-6;
   return placeWarFort({...emptyWarMap(w,h),
    tiles:fill([wall],range(0,h-1).filter(y=>Math.abs(y-mid)>0),'wall')},
    'castle','defender',{x:w-3,y:mid});
  }},
 {id:'town',label:'Vila murada',hint:'Casas dão cobertura e um salão guarda a praça.',
  build:(w,h)=>{
   const mid=Math.floor(h/2);
   return placeWarFort({...emptyWarMap(w,h),tiles:[
    ...fill(range(w-5,w-2),range(mid-2,mid+2).filter(y=>y>=0&&y<h),'small-town'),
    ...fill([w-6],range(0,h-1).filter(y=>Math.abs(y-mid)>1),'wall')]},
    'hall','defender',{x:w-3,y:mid-1});
  }},
];
export type WarDeployRow=Readonly<{id:string;side:WarSide;position:WarPosition;typeId:string}>;
const GARRISON_PRIORITY=['archers','scouts','guerrillas','garrison','infantry','personal-guard',
 'crusaders','mercenaries','levies','sailors','raiders','criminals','support','special'];
const MOUNTED=new Set(['cavalry']);
/** Ajusta as posições iniciais ao mapa: centraliza em campos altos, coloca a
 * guarnição dentro das construções do seu lado (atiradores primeiro) e tira
 * tropas de cima de rios, mares e muralhas. Com `keepManual`, só corrige
 * posições impossíveis e respeita o que o Narrador posicionou.
 */
export function autoDeployWarUnits(rows:readonly WarDeployRow[],draft:WarMapDraft,
 keepManual=false):Readonly<Record<string,WarPosition>>{
 const lift=keepManual?0:Math.max(0,Math.floor((draft.height-7)/2));
 const place=new Map(rows.map(r=>[r.id,{x:r.position.x,
  y:Math.min(draft.height-1,r.position.y+lift)}] as const));
 const at=new Map<string,string>();
 for(const [id,p] of place)at.set(key(p),id);
 const tiles=new Map(draft.tiles.map(t=>[key(t),t] as const));
 const passable=(p:WarPosition,typeId:string):boolean=>{
  const tile=tiles.get(key(p));
  if(!tile)return true;
  const e=terrainEffect(tile);
  if(typeId==='warships')return e.naval;
  return !e.blocked&&!(e.noCavalry&&MOUNTED.has(typeId));
 };
 const move=(id:string,to:WarPosition):void=>{
  const from=place.get(id)!;
  const other=at.get(key(to));
  if(other&&other!==id){place.set(other,from);at.set(key(from),other);}
  else at.delete(key(from));
  place.set(id,to);at.set(key(to),id);
 };
 if(!keepManual)for(const side of ['attacker','defender'] as const){
  const settled=new Set<string>();
  const cells=draft.forts.filter(f=>f.side===side).flatMap(f=>f.cells)
   .filter(c=>passable(c,'infantry'));
  const troops=rows.filter(r=>r.side===side&&GARRISON_PRIORITY.includes(r.typeId))
   .sort((a,b)=>GARRISON_PRIORITY.indexOf(a.typeId)-GARRISON_PRIORITY.indexOf(b.typeId)||
    a.id.localeCompare(b.id,undefined,{numeric:true}));
  for(const cell of cells){
   const holder=at.get(key(cell));
   if(holder&&settled.has(holder))continue;
   const next=troops.find(t=>!settled.has(t.id));
   if(!next)break;
   move(next.id,cell);settled.add(next.id);
  }
 }
 // Quem ficou sobre terreno impossível vai para o quadrado livre mais próximo.
 for(const row of rows){
  const here=place.get(row.id)!;
  if(passable(here,row.typeId))continue;
  let best:WarPosition|null=null,bestScore=Infinity;
  for(let y=0;y<draft.height;y++)for(let x=0;x<draft.width;x++){
   const p={x,y};
   if(at.has(key(p))||!passable(p,row.typeId))continue;
   const sameHalf=row.side==='attacker'?x<draft.width/2:x>=draft.width/2;
   const score=Math.max(Math.abs(x-here.x),Math.abs(y-here.y))+(sameHalf?0:draft.width);
   if(score<bestScore){best=p;bestScore=score;}
  }
  if(best)move(row.id,best);
 }
 return Object.fromEntries(place);
}
