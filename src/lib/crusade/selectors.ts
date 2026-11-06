/** Seletores apenas de leitura para a futura interface CRZ. Não executam comandos. */
import type {CrzBattleState} from './battle';
import {crzBattleRules,crzFind} from './battle';
import {crzReachable,crzAttackOptions,type CrzReachable,
 type CrzTargetOption} from './geometry';
import type {CrzLeader} from './battle';
export type CrzActionChoices=Readonly<{
 actorId:string|null;moves:readonly CrzReachable[];
 attacks:readonly CrzTargetOption[];
 canWait:boolean;canDefend:boolean;canEnd:boolean;
 abilities:readonly ('CHARGE'|'VOLLEY')[];
 leaderSpells:readonly CrzLeader['spells'][number][];
}>;
export function crzLegalActions(state:CrzBattleState):CrzActionChoices{
 const empty:CrzActionChoices={actorId:null,moves:[],attacks:[],
  canWait:false,canDefend:false,canEnd:false,abilities:[],leaderSpells:[]};
 if(state.phase!=='active'||!state.activeId)return empty;
 const actor=crzFind(state,state.activeId),rules=crzBattleRules(state);
 const canPrepare=!actor.activation.moved&&!actor.activation.attacked&&
  !actor.activation.activatedAbility;
 const leader=state.leaders[actor.side];
 const energyCost:{[K in CrzLeader['spells'][number]]:number}={
  bless:3,bane:3,shield_of_faith:2,cure_wounds:2,
 };
 const leaderSpells=canPrepare&&leader&&rules.leader.castsPerRound>0&&
  leader.castRound!==state.round?
  leader.spells.filter(spell=>leader.energy>=energyCost[spell]):[];
 const abilities:('CHARGE'|'VOLLEY')[]=[];
 if(!actor.activation.attacked&&!actor.activation.activatedAbility){
  if(actor.template.traits.includes('charge')&&actor.meleeRoutine&&
    actor.activation.movedPath.length>=3){
   const moves=actor.activation.movedPath.slice(1).map((h,i)=>{
    const prev=actor.activation.movedPath[i]!;
    return (h.q-prev.q)+','+(h.r-prev.r);
   });
   if(moves.every(d=>d===moves[0]))abilities.push('CHARGE');
  }
  if(actor.rangedRoutine&&(actor.usage['volley']??0)<
    rules.ability.rechargeUsesPerBattle)abilities.push('VOLLEY');
 }
 return {actorId:actor.id,moves:crzReachable(state,actor),
  attacks:crzAttackOptions(state,actor),
  canWait:canPrepare&&!actor.activation.waited&&rules.wait.maxPerRound>0,
  canDefend:canPrepare,canEnd:true,abilities,leaderSpells};
}
