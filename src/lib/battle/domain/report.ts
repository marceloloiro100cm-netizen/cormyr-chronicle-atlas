import type { BattleState,Side } from './types';
import { livingCount,casualtyCount } from './morale';
export type BattleReportLine=Readonly<{
  id:string;name:string;side:Side;initial:number;alive:number;casualties:number;
  initialHp:number;remainingHp:number;damageDealt:number;damageReceived:number;
  routed:boolean;
}>;
export function battleReport(state:BattleState):{
  name:string;rounds:number;winner:Side|null;reason:string|undefined;units:BattleReportLine[];
  bySide:Record<Side,{initial:number;alive:number;casualties:number;damageDealt:number;damageReceived:number}>;
}{
  const units:BattleReportLine[]=state.stacks.map(stack=>{
    let dealt=0,received=0;
    for(const e of state.events){
      if(e.type!=='DAMAGE'&&e.type!=='RETALIATION')continue;
      const value=e.delta['damage'];
      const attackerId=e.delta['attackerId'],defenderId=e.delta['defenderId'];
      if(typeof value!=='number')continue;
      if(attackerId===stack.id)dealt+=value;
      if(defenderId===stack.id)received+=value;
    }
    return {id:stack.id,name:stack.name,side:stack.side,initial:stack.initialCount,
      alive:livingCount(stack),casualties:casualtyCount(stack),
      initialHp:stack.initialCount*stack.hpPerSoldier,remainingHp:stack.currentHp,
      damageDealt:dealt,damageReceived:received,routed:stack.moraleState==='routed'};
  });
  const summary=(side:Side)=>{
    const lines=units.filter(u=>u.side===side);
    return {initial:lines.reduce((n,u)=>n+u.initial,0),alive:lines.reduce((n,u)=>n+u.alive,0),
      casualties:lines.reduce((n,u)=>n+u.casualties,0),
      damageDealt:lines.reduce((n,u)=>n+u.damageDealt,0),
      damageReceived:lines.reduce((n,u)=>n+u.damageReceived,0)};
  };
  return {name:state.name,rounds:state.round,winner:state.winner,reason:state.resultReason,units,
    bySide:{attacker:summary('attacker'),defender:summary('defender')}};
}
