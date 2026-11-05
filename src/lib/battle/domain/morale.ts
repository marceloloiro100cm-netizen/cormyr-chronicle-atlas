import type { BattleStack, Morale } from './types';
import { TRAINING_BONUS } from './profiles-v2';
import { clamp } from './rulebook-v2';

/** Inteiros, determinismo e nenhuma alteração na unidade oficial. */
export function livingCount(stack:BattleStack):number {
  return stack.currentHp<=0?0:Math.min(stack.initialCount,Math.ceil(stack.currentHp/stack.hpPerSoldier));
}
export function casualtyCount(stack:BattleStack):number {
  return stack.initialCount-livingCount(stack);
}
export function moraleThresholds(stack:BattleStack):{shaken:number;routed:number}{
  const bonus=5*TRAINING_BONUS[stack.training]+stack.moraleTypeModifier;
  return {shaken:clamp(40+bonus,30,65),routed:clamp(70+bonus,50,85)};
}
export function moraleAfterDamage(stack:BattleStack):Morale{
  if(stack.moraleState==='routed')return 'routed';
  if(stack.currentHp<=0)return stack.moraleState;
  const loss=Math.floor(100*casualtyCount(stack)/stack.initialCount);
  const thresholds=moraleThresholds(stack);
  if(loss>=thresholds.routed)return 'routed';
  if(stack.moraleState==='shaken'||loss>=thresholds.shaken)return 'shaken';
  return 'steady';
}
export function stateAfterDamage(stack:BattleStack,currentHp:number):BattleStack{
  if(!Number.isSafeInteger(currentHp)||currentHp<0||currentHp>stack.initialCount*stack.hpPerSoldier)
    throw new Error('Pontos de vida táticos inválidos.');
  const changed={...stack,currentHp};
  return {...changed,moraleState:moraleAfterDamage(changed)};
}
