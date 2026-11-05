import type { BattleState, Side } from './types';
/** Retorna apenas estado terminal, distinguindo mortos de debandados. */
export function battleOutcome(stacks:BattleState['stacks']):{winner:Side|null;reason:string}|null{
 const able=(side:Side)=>stacks.some(s=>s.side===side&&s.currentHp>0&&s.moraleState!=='routed');
 const a=able('attacker'),b=able('defender');
 if(a&&b)return null;
 if(!a&&!b)return {winner:null,reason:'mutual-defeat'};
 const defeatedSide:Side=a?'defender':'attacker';
 const allKilled=stacks.filter(s=>s.side===defeatedSide).every(s=>s.currentHp<=0);
 return {winner:a?'attacker':'defender',reason:allKilled?'elimination':'rout'};
}
