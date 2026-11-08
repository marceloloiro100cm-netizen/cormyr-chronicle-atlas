/** CRZ-1.0 · geometrias puras da arena, independentes do redutor PTE.
 * Referência 03 §§2.2, 3, 6.1, 11; pointy-top odd-r / axial.
 */
import {z} from 'zod';
export type CrzSide='attacker'|'defender';
export type CrzHex=Readonly<{q:number;r:number}>;
export type CrzTerrain='plain'|'forest'|'hill'|'rock';
export type CrzTile=CrzHex&Readonly<{terrain:CrzTerrain}>;
export type CrzMap=Readonly<{
 id:string;label:string;schemaVersion:2;width:11|15;height:9|11;
 /** Ausente nos mapas legados; a origem q/r passa a ser coluna/linha em square. */
 grid?:'square'|undefined;
 tiles:readonly CrzTile[];
 deployment:Readonly<Record<CrzSide,readonly CrzHex[]>>;
}>;
export type CrzScenarioId='plain-open'|'contested-woods'|'border-hills'|'narrow-passage';
const hexSchema=z.object({q:z.number().int().safe(),r:z.number().int().safe()}).strict();
const tileSchema=hexSchema.safeExtend({terrain:z.enum(['plain','forest','hill','rock'])});
export const crzMapSchema=z.object({
 id:z.string().min(1).max(100),label:z.string().min(1).max(150),
 schemaVersion:z.literal(2),width:z.union([z.literal(11),z.literal(15)]),
  grid:z.literal('square').optional(),
 height:z.union([z.literal(9),z.literal(11)]),
 tiles:z.array(tileSchema).max(165),
 deployment:z.object({
  attacker:z.array(hexSchema).min(5).max(32),
  defender:z.array(hexSchema).min(5).max(32),
 }).strict(),
}).strict();
export const CRZ_DIRECTIONS:readonly CrzHex[]=[
 {q:1,r:0},{q:1,r:-1},{q:0,r:-1},
 {q:-1,r:0},{q:-1,r:1},{q:0,r:1},
] as const;
export const crzHexKey=(h:CrzHex):string=>h.q+','+h.r;
export const crzOffsetToAxial=(column:number,row:number):CrzHex=>({
 q:column-Math.floor((row-(row&1))/2),r:row,
});
export const crzAxialToOffset=(h:CrzHex):{column:number;row:number}=>({
 column:h.q+Math.floor((h.r-(h.r&1))/2),row:h.r,
});
export const crzDistance=(a:CrzHex,b:CrzHex):number=>Math.max(
 Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
export const crzNeighbors=(h:CrzHex):CrzHex[]=>CRZ_DIRECTIONS.map(d=>({
 q:h.q+d.q,r:h.r+d.r,
}));
/** Mapa quadrado: 8 vizinhos, diagonais custando +0,5, sem atravessar esquinas. */
const CRZ_SQUARE_DIRECTIONS:readonly CrzHex[]=[
 {q:1,r:0},{q:0,r:1},{q:-1,r:0},{q:0,r:-1},
 {q:1,r:1},{q:-1,r:1},{q:-1,r:-1},{q:1,r:-1},
];
export const crzGridToOffset=(map:CrzMap,h:CrzHex):{column:number;row:number}=>
 map.grid==='square'?{column:h.q,row:h.r}:crzAxialToOffset(h);
export const crzGridFromOffset=(map:CrzMap,column:number,row:number):CrzHex=>
 map.grid==='square'?{q:column,r:row}:crzOffsetToAxial(column,row);
export const crzGridDistance=(map:CrzMap,a:CrzHex,b:CrzHex):number=>
 map.grid==='square'?Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r)):crzDistance(a,b);
export const crzGridNeighbors=(map:CrzMap,h:CrzHex):CrzHex[]=>
 (map.grid==='square'?CRZ_SQUARE_DIRECTIONS:CRZ_DIRECTIONS).map(d=>({q:h.q+d.q,r:h.r+d.r}));
export const crzAllowsStep=(map:CrzMap,from:CrzHex,to:CrzHex,occupied:ReadonlySet<string>):boolean=>{
 if(map.grid!=='square'||from.q===to.q||from.r===to.r)return true;
 return [{q:to.q,r:from.r},{q:from.q,r:to.r}].every(h=>
  !occupied.has(crzHexKey(h))&&map.tiles.some(t=>crzHexKey(t)===crzHexKey(h)&&t.terrain!=='rock'));
};

export const crzTerrainCost=(terrain:CrzTerrain):number=>
 terrain==='rock'?Infinity:terrain==='plain'?1:2;
export const crzMapIndex=(map:CrzMap):Map<string,CrzTile>=>
 new Map(map.tiles.map(t=>[crzHexKey(t),t]));
export function crzValidateMap(raw:unknown):CrzMap{
 const map=crzMapSchema.parse(raw);
 const seen=new Set<string>();
 if(map.width===11&&map.height!==9||map.width===15&&map.height!==11)
  throw new Error('E_SETUP_MAP: dimensões incompatíveis.');
 if(map.tiles.length!==map.width*map.height)
  throw new Error('E_SETUP_MAP: grade incompleta.');
 for(const tile of map.tiles){
  const p=crzGridToOffset(map,tile),key=crzHexKey(tile);
  if(p.column<0||p.column>=map.width||p.row<0||p.row>=map.height||
     seen.has(key))throw new Error('E_SETUP_MAP: hexágono duplicado ou fora.');
  seen.add(key);
 }
 const index=crzMapIndex(map),allZones=new Set<string>();
 for(const side of ['attacker','defender'] as const){
  const local=new Set<string>();
  for(const h of map.deployment[side]){
   const key=crzHexKey(h),tile=index.get(key);
   if(!tile||tile.terrain==='rock'||local.has(key)||allZones.has(key))
    throw new Error('E_SETUP_MAP: zona sobreposta, rochosa ou fora do mapa.');
   allZones.add(key);local.add(key);
  }
 }
 for(const a of map.deployment.attacker){
  if(map.deployment.defender.some(h=>crzGridDistance(map,a,h)<2))
   throw new Error('E_SETUP_MAP: zonas começam adjacentes.');
 }
 const walkable=new Set(map.tiles.filter(t=>t.terrain!=='rock').map(crzHexKey));
 const pending=[...map.deployment.attacker],visited=new Set(pending.map(crzHexKey));
 for(let i=0;i<pending.length;i++){
  for(const next of crzGridNeighbors(map,pending[i]!)){
   const key=crzHexKey(next);
   if(!walkable.has(key)||visited.has(key)||!crzAllowsStep(map,pending[i]!,next,new Set()))continue;
   visited.add(key);pending.push(next);
  }
 }
 if(!map.deployment.defender.some(h=>visited.has(crzHexKey(h))))
  throw new Error('E_SETUP_MAP: lados desconectados.');
 return map;
}
/** Determinístico; não usa biblioteca gráfica ou dados privados do Cormyr. */
export function crzScenario(id:CrzScenarioId,width:11|15=11,grid:'hex'|'square'='hex'):CrzMap{
 const height:9|11=width===11?9:11,tiles:CrzTile[]=[];
 const mid=Math.floor(width/2),center=Math.floor(height/2);
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  let terrain:CrzTerrain='plain';
  if(id==='contested-woods'&&col>=3&&col<=width-4&&
    ((col+2*row)%5===0||(col+row)%7===0))terrain='forest';
  if(id==='border-hills'&&col>=3&&col<=width-4){
   if((col+row)%8===0)terrain='rock';
   else if((2*col+row)%4===0)terrain='hill';
  }
  if(id==='narrow-passage'&&col===mid&&Math.abs(row-center)>1)
   terrain='rock';
  tiles.push({...(grid==='square'?{q:col,r:row}:crzOffsetToAxial(col,row)),terrain});
 }
 return crzValidateMap({
  id:'crz-'+id,label:id,schemaVersion:2,width,height,tiles,
   ...(grid==='square'?{grid:'square' as const}:{}),
  deployment:{
   attacker:tiles.filter(t=>(grid==='square'?t.q:crzAxialToOffset(t).column)<=1)
    .map(t=>({q:t.q,r:t.r})),
   defender:tiles.filter(t=>(grid==='square'?t.q:crzAxialToOffset(t).column)>=width-2)
    .map(t=>({q:t.q,r:t.r})),
  },
 });
}
export type CrzPath=Readonly<{to:CrzHex;cost:number;steps:number;path:readonly CrzHex[]}>;
export function crzReachable(map:CrzMap,from:CrzHex,budget:number,
 occupied:readonly CrzHex[]=[],enemies:readonly CrzHex[]=[],flight=false):CrzPath[]{
 if(!Number.isSafeInteger(budget)||budget<0||budget>6)
  throw new Error('MOVE: orçamento inválido.');
 const tiles=crzMapIndex(map),fromKey=crzHexKey(from);
 if(!tiles.has(fromKey)||(!flight&&tiles.get(fromKey)?.terrain==='rock'))
  throw new Error('MOVE: origem inválida.');
 const blocked=new Set(occupied.map(crzHexKey));blocked.delete(fromKey);
 const enemySet=new Set(enemies.map(crzHexKey));
 type Candidate=CrzPath&{trace:string};
 const first:Candidate={to:from,cost:0,steps:0,path:[from],trace:''};
 const best=new Map<string,Candidate>([[fromKey,first]]);
 const frontier=[first];
 while(frontier.length){
  frontier.sort((a,b)=>a.cost-b.cost||a.steps-b.steps||
   (a.trace<b.trace?-1:a.trace>b.trace?1:0));
  const at=frontier.shift()!,key=crzHexKey(at.to);
  if(best.get(key)!==at)continue;
  // Entrar em ZOC finaliza movimento. Sair da ZOC de origem é livre.
  if(!flight&&key!==fromKey&&crzGridNeighbors(map,at.to).some(n=>enemySet.has(crzHexKey(n))))continue;
  for(const [i,next] of crzGridNeighbors(map,at.to).entries()){
   const nkey=crzHexKey(next),tile=tiles.get(nkey);
   // Em voo pode atravessar rocha, rios/barreiras equivalentes, floresta
   // e outras tropas; a célula ocupada continua proibida como destino.
   if(!tile||(!flight&&(tile.terrain==='rock'||blocked.has(nkey)||
      !crzAllowsStep(map,at.to,next,blocked))))continue;
   const cost=at.cost+(flight?1:crzTerrainCost(tile.terrain))+
     (map.grid==='square'&&at.to.q!==next.q&&at.to.r!==next.r?0.5:0);
   if(cost>budget)continue;
   const candidate:Candidate={to:next,cost,steps:at.steps+1,
    path:[...at.path,next],trace:at.trace+i};
   const prev=best.get(nkey);
   if(!prev||cost<prev.cost||(cost===prev.cost&&(
     candidate.steps<prev.steps||
     candidate.steps===prev.steps&&candidate.trace<prev.trace))){
    best.set(nkey,candidate);frontier.push(candidate);
   }
  }
 }
 return [...best.values()].filter(n=>crzHexKey(n.to)!==fromKey&&
   (!flight||!blocked.has(crzHexKey(n.to))))
  .sort((a,b)=>a.cost-b.cost||a.steps-b.steps||a.to.q-b.to.q||a.to.r-b.to.r)
  .map(({to,cost,steps,path})=>({to,cost,steps,path}));
}
function cubeRound(q:number,r:number):CrzHex{
 const s=-q-r;let rq=Math.round(q),rr=Math.round(r),rs=Math.round(s);
 const dq=Math.abs(rq-q),dr=Math.abs(rr-r),ds=Math.abs(rs-s);
 if(dq>dr&&dq>ds)rq=-rr-rs;
 else if(dr>ds)rr=-rq-rs;
 return {q:rq,r:rr};
}
/** Supercover quadrado conservador: testa todas as células tocadas pela reta. */
function crzSquareRay(map:CrzMap,from:CrzHex,to:CrzHex):CrzHex[]{
 const x0=from.q+0.5,y0=from.r+0.5,dx=to.q-from.q,dy=to.r-from.r,eps=1e-9;
 const crosses=(h:CrzHex)=>{
  let lo=0,hi=1;
  for(const [p,d,min,max] of [[x0,dx,h.q,h.q+1],[y0,dy,h.r,h.r+1]] as const){
   if(Math.abs(d)<eps){if(p<min-eps||p>max+eps)return false;continue;}
   const a=(min-p)/d,b=(max-p)/d;
   lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
   if(lo>hi+eps)return false;
  }
  return true;
 };
 return map.tiles.filter(t=>crzHexKey(t)!==crzHexKey(from)&&
  crzHexKey(t)!==crzHexKey(to)&&crosses(t));
}

export function crzLineOfSight(map:CrzMap,from:CrzHex,to:CrzHex):boolean{
 const index=crzMapIndex(map),distance=crzDistance(from,to);
 if(!index.has(crzHexKey(from))||!index.has(crzHexKey(to)))return false;
  if(map.grid==='square')return crzSquareRay(map,from,to).every(h=>{
   const terrain=index.get(crzHexKey(h))?.terrain;
   return Boolean(terrain&&terrain!=='forest'&&terrain!=='rock');
  });
 if(distance<=1)return true;
 const checked=new Set<string>();
 for(let i=1;i<distance*12;i++){
  const t=i/(distance*12);
  const q=from.q+(to.q-from.q)*t,r=from.r+(to.r-from.r)*t;
  for(const [a,b] of [[0,0],[1e-8,-1e-8],[-1e-8,1e-8],[1e-8,1e-8],[-1e-8,-1e-8]] as const){
   const h=cubeRound(q+a,r+b),key=crzHexKey(h);
   if(key===crzHexKey(from)||key===crzHexKey(to)||checked.has(key))continue;
   checked.add(key);
   const tile=index.get(key);
   if(!tile||tile.terrain==='forest'||tile.terrain==='rock')return false;
  }
 }
 return true;
}
