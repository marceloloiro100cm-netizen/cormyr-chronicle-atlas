import {activationOrder,initiative} from '../domain/turns';
import {livingCount} from '../domain/morale';
import type {BattleState,BattleStack,Side} from '../domain/types';
import {commander,type CommanderId} from './commanders';
import {v3CommanderPowerLimit,type V3CommanderProgress} from './commander-progression';

export type V36TimelineEntry=Readonly<{
 id:string;name:string;side:Side;count:number;initiative:number;
 round:number;current:boolean;waiting:boolean;
}>;
/** Deriva a fila real de ativação; a rodada futura é apenas previsão, nunca evento oficial. */
export function v36Timeline(battle:BattleState,max=12):readonly V36TimelineEntry[]{
 const byId=new Map(battle.stacks.map(s=>[s.id,s]));
 if(battle.phase!=='active'||!battle.activeUnitId)return [];
 const current=[battle.activeUnitId];
 const pending=battle.activationQueue.filter(id=>id!==battle.activeUnitId);
 const waiting=battle.waitingQueue.filter(id=>!current.includes(id)&&!pending.includes(id));
 const nextRound=activationOrder(battle.stacks);
 const ids=[...current,...pending,...waiting];
 const mapped=(id:string,round:number,wait:boolean):V36TimelineEntry|null=>{
  const stack=byId.get(id);
  return stack&&stack.currentHp>0&&stack.moraleState!=='routed'?{
   id:stack.id,name:stack.name,side:stack.side,
   count:livingCount(stack),initiative:initiative(stack),
   round,current:round===battle.round&&id===battle.activeUnitId,waiting:wait,
  }:null;
 };
 const items=ids.map(id=>mapped(id,battle.round,waiting.includes(id)))
  .filter((x):x is V36TimelineEntry=>x!==null);
 if(items.length<max){
  for(const id of nextRound){
   if(items.length>=max)break;
   const item=mapped(id,battle.round+1,false);
   if(item)items.push({...item,current:false});
  }
 }
 return items.slice(0,Math.max(1,Math.min(24,max)));
}
export function v36CommanderIcon(id:CommanderId):string{
 return ({
  tillet:'✥',noble:'♜',knight:'♞','war-mage':'✧','purple-dragon':'♛',
  ranger:'➶',priest:'✚',engineer:'⚒',quartermaster:'⚖','ashkar-raider':'♨',
 } satisfies Record<CommanderId,string>)[id];
}
export function v36CommanderResources(id:CommanderId,progress:V3CommanderProgress|undefined,used:number){
 const capacity=v3CommanderPowerLimit(id,progress);
 return {name:commander(id).name,style:commander(id).style,
  remaining:Math.max(0,capacity-used),capacity};
}
export function v36Casualties(battle:BattleState,side:Side):Readonly<{
 initial:number;alive:number;casualties:number;
}>{
 const own=battle.stacks.filter(s=>s.side===side);
 const initial=own.reduce((n,s)=>n+s.initialCount,0);
 const alive=own.reduce((n,s)=>n+livingCount(s),0);
 return {initial,alive,casualties:Math.max(0,initial-alive)};
}
export function v36UnitStatus(stack:BattleStack):string{
 if(stack.moraleState==='routed')return 'Em retirada';
 if(stack.moraleState==='shaken')return 'Moral abalada';
 if(stack.defenseGuard)return 'Defesa total';
 if(stack.waitedThisRound)return 'Aguardando';
 return 'Em formação';
}
