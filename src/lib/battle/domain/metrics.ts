import type {BattleState,BattleStack,Side} from './types';
import {livingCount} from './morale';

type Force=Readonly<{count:number;startHp:number;remainingHp:number;strength:number}>;
export type RelativeBalance='próximo'|'vantagem atacante'|'vantagem defensor';
export type TacticalMetrics=Readonly<{
 attacker:Force;defender:Force;balance:RelativeBalance;
 pressureRatio:number;rounds:number;commands:number;attacks:number;movements:number;
 casualties:Readonly<Record<Side,number>>;completed:boolean;
}>;

/** Indicadores descritivos. Não atribuem probabilidade de vitória nem alteram o motor. */
export function battleTacticalMetrics(state:BattleState):TacticalMetrics{
 const side=(id:Side):Force=>{
  const stacks=state.stacks.filter(s=>s.side===id);
  const startHp=stacks.reduce((n,s)=>n+s.initialCount*s.hpPerSoldier,0);
  const remainingHp=stacks.reduce((n,s)=>n+s.currentHp,0);
  const strength=stacks.reduce((n,s)=>
   n+Math.round(s.initialCount*s.hpPerSoldier*(100+s.attack*4+s.defense*2+s.armor*3)/100),0);
  return {count:stacks.reduce((n,s)=>n+s.initialCount,0),startHp,remainingHp,strength};
 };
 const attacker=side('attacker'),defender=side('defender');
 const ratio=attacker.strength&&defender.strength?
  attacker.strength/defender.strength:1;
 const balance:RelativeBalance=ratio>1.3?'vantagem atacante':
  ratio<1/1.3?'vantagem defensor':'próximo';
 const commands=state.events.filter(e=>e.type!=='RETALIATION');
 const casualties=(id:Side)=>state.stacks.filter(s=>s.side===id).reduce((n,s)=>
  n+Math.max(0,s.initialCount-livingCount(s)),0);
 return {attacker,defender,balance,pressureRatio:Math.round(ratio*100)/100,
  rounds:state.round,commands:commands.length,
  attacks:commands.filter(e=>e.type==='DAMAGE').length,
  movements:commands.filter(e=>e.type==='MOVE').length,
  casualties:{attacker:casualties('attacker'),defender:casualties('defender')},
  completed:state.phase==='completed'||state.phase==='archived'};
}
export function formatSessionDuration(seconds:number):string{
 const safe=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;
 return Math.floor(safe/60)+' min '+(safe%60)+' s';
}
