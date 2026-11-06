/** CRZ-1.0 · caminhos em hexágonos e legalidade de alvos.
 * Geometria pública PTE reutilizada, mas nenhum turno ou cálculo PTE importado.
 * Normativo 03 §§6.1–6.2 e 11/17.
 */
import type {Hex} from '../battle/domain/types';
import {hexDistance,hexKey,hexNeighbors} from '../battle/geometry/hex';
import {tileIndex} from '../battle/geometry/terrain';
import {lineOfSight} from '../battle/geometry/visibility';
import type {CrzBattleState,CrzBattleUnit} from './battle';
import {crzAlive,crzBattleRules} from './battle';
import {crzClamp} from './stack';
export type CrzReachable=Readonly<{to:Hex;cost:number;path:readonly Hex[]}>;
const stable=(a:Hex,b:Hex)=>a.r-b.r||a.q-b.q;
function adjacentEnemy(state:CrzBattleState,unit:CrzBattleUnit,h:Hex):boolean{
 return state.stacks.some(other=>other.side!==unit.side&&crzAlive(other)&&
  hexDistance(h,other.position)===1);
}
export function crzReachable(state:CrzBattleState,unit:CrzBattleUnit):readonly CrzReachable[]{
 const rules=crzBattleRules(state);
 if(!crzAlive(unit)||unit.activation.moved||unit.activation.attacked)return [];
 const tiles=tileIndex(state.map);
 const occupied=new Set(state.stacks.filter(s=>s.id!==unit.id&&crzAlive(s))
  .map(s=>hexKey(s.position)));
 const slow=unit.effects.filter(e=>e.stat==='movement')
  .reduce((sum,e)=>sum+e.modifier,0);
 const budget=crzClamp(unit.movementHex+slow,0,rules.movement.maxBudget);
 const origin=hexKey(unit.position);
 const best=new Map<string,CrzReachable>();
 const queue:CrzReachable[]=[{to:unit.position,cost:0,path:[unit.position]}];
 best.set(origin,queue[0]!);
 while(queue.length){
  queue.sort((a,b)=>a.cost-b.cost||stable(a.to,b.to));
  const cursor=queue.shift()!;
  if(best.get(hexKey(cursor.to))!==cursor)continue;
  if(cursor.cost>0&&rules.movement.zocEnabled&&adjacentEnemy(state,unit,cursor.to))
   continue; // sair da ZOC de origem é permitido; entrar encerra movimento.
  for(const next of hexNeighbors(cursor.to).sort(stable)){
   const key=hexKey(next),tile=tiles.get(key);
   if(!tile||occupied.has(key)||tile.terrain==='rock')continue;
   const cost=tile.terrain==='forest'?rules.movement.forestCost:
    tile.terrain==='hill'?rules.movement.hillCost:1;
   const total=cursor.cost+cost;
   if(total>budget)continue;
   const prev=best.get(key);
   if(prev&&prev.cost<=total)continue;
   const item={to:next,cost:total,path:[...cursor.path,next]};
   best.set(key,item);queue.push(item);
  }
 }
 return [...best.values()].filter(x=>hexKey(x.to)!==origin)
  .sort((a,b)=>a.cost-b.cost||stable(a.to,b.to));
}
export type CrzTargetOption=Readonly<{
 targetId:string;distance:number;kind:'melee'|'ranged';
 flanking:boolean;engaged:boolean;coverAc:number;
}>;
export function crzAttackOptions(state:CrzBattleState,actor:CrzBattleUnit):
 readonly CrzTargetOption[]{
 if(!crzAlive(actor)||actor.activation.attacked)return [];
 const rules=crzBattleRules(state);
 const engaged=adjacentEnemy(state,actor,actor.position);
 return state.stacks.filter(s=>s.side!==actor.side&&crzAlive(s))
  .flatMap(target=>{
   const distance=hexDistance(actor.position,target.position);
   let kind:'melee'|'ranged';
   if(distance===1&&actor.meleeRoutine)kind='melee';
   else if(actor.rangedRoutine&&distance>=1&&distance<=actor.rangeHex){
    // §17.11: um arqueiro sem arma corpo a corpo pode disparar engajado.
    if(distance===1&&actor.meleeRoutine)return [];
    if(rules.ranged.engaged==='forbidden'&&engaged)return [];
    if(!lineOfSight(state.map,actor.position,target.position).clear)return [];
    kind='ranged';
   }else return [];
   const allies=state.stacks.filter(s=>s.side===actor.side&&crzAlive(s)&&
    hexDistance(s.position,target.position)===1);
   const terrain=tileIndex(state.map).get(hexKey(target.position))?.terrain;
   const coverAc=kind==='ranged'?
    terrain==='forest'?rules.hit.coverAcBonus.forest:
    terrain==='hill'?rules.hit.coverAcBonus.hill:0:0;
   return [{targetId:target.id,distance,kind,
    flanking:allies.length>=2,engaged,coverAc}];
  });
}
