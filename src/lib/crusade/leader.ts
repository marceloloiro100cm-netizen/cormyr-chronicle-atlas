/** CRZ-1.0 · Líder fora do mapa, com ação restrita à ativação aliada.
 * Manual 03 §9. Lote 4 implementa subset auditável e recusa o resto.
 */
import {crzApplyDamage,crzHeal} from './stack';
import {crzCapable,crzLog,crzMoraleState,crzReplaceStack,
 type CrzBattleStack,type CrzBattleState,type CrzEffect} from './battle-state';
import type {CrzSide} from './geometry';
import type {CrzSpellId} from './setup';
const COSTS:Readonly<Record<CrzSpellId,number>>={
 bless:3,bane:3,shield_of_faith:2,heroism:4,cause_fear:3,
 cure_wounds:2,firebolt:2,fireball:6,hold:5,slow:6,
 shield_wall_formation:2,volley_order:2,
};
export const CRZ_LOT4_SPELLS:readonly CrzSpellId[]=[
 'bless','bane','shield_of_faith','heroism','cause_fear',
 'cure_wounds','firebolt',
];
function requireTarget(state:CrzBattleState,id:string|null|undefined,
 side:CrzSide):CrzBattleStack{
 const target=state.stacks.find(s=>s.id===id);
 if(!target||target.side!==side||!crzCapable(target))
  throw new Error('SPELL: alvo inexistente, debandado ou lado incorreto.');
 return target;
}
export function crzCast(state:CrzBattleState,spellId:CrzSpellId,
 targetId:string|null):CrzBattleState{
 if(state.phase!=='active'||!state.activeStackId)
  throw new Error('SPELL: não há ativação.');
 const active=state.stacks.find(s=>s.id===state.activeStackId);
 if(!active||!crzCapable(active)||active.activation.attacked||active.activation.moved)
  throw new Error('SPELL: General age antes das ordens da pilha.');
 const side=active.side,leader=state.leaders[side];
 if(!leader)throw new Error('SPELL: General não presente.');
 if(!leader.spells.includes(spellId))throw new Error('SPELL: habilidade não preparada.');
 if(!CRZ_LOT4_SPELLS.includes(spellId))
  throw new Error('SPELL_UNSUPPORTED: requer redutor do próximo lote.');
 if(leader.spellsCastThisRound>=state.ruleset.leader.castsPerRound)
  throw new Error('SPELL: General já atuou nesta rodada.');
 const cost=COSTS[spellId];
 if(leader.energy<cost)throw new Error('SPELL: energia insuficiente.');
 const single=spellId==='shield_of_faith'||spellId==='heroism'||
  spellId==='cause_fear'||spellId==='cure_wounds'||spellId==='firebolt';
 const targetSide=spellId==='bane'||spellId==='cause_fear'||
  spellId==='firebolt'?(side==='attacker'?'defender':'attacker'):side;
 if(single)requireTarget(state,targetId,targetSide);
 else if(targetId!==null)throw new Error('SPELL: feitiço coletivo não aceita alvo único.');
 const withEnergy={...leader,energy:leader.energy-cost,
  spellsCastThisRound:leader.spellsCastThisRound+1};
 let next:CrzBattleState={...state,leaders:{...state.leaders,[side]:withEnergy}};
 next=crzLog(next,{type:'SPELL_CAST',leaderId:leader.id,spellId,side,
  targetId,cost});
 const duration=2+Math.floor(leader.power/2);
 const effects:{kind:CrzEffect['kind'];amount:number;targets:CrzBattleStack[]}[]=[];
 if(spellId==='bless'||spellId==='bane'){
  effects.push({kind:'attack',amount:spellId==='bless'?1:-1,
   targets:next.stacks.filter(s=>s.side===targetSide&&crzCapable(s))});
 }else if(spellId==='shield_of_faith'){
  effects.push({kind:'ac',amount:2+Math.floor(leader.power/6),
   targets:[requireTarget(next,targetId,targetSide)]});
 }else if(spellId==='heroism'){
  const target=requireTarget(next,targetId,targetSide);
  effects.push({kind:'attack',amount:2,targets:[target]});
  effects.push({kind:'morale',amount:20+3*leader.power,targets:[target]});
 }else if(spellId==='cause_fear'){
  effects.push({kind:'morale',amount:-(20+leader.power),
   targets:[requireTarget(next,targetId,targetSide)]});
 }
 for(const {kind,amount,targets} of effects){
  for(const s of targets){
   const effect:CrzEffect={id:leader.id+'-'+spellId+'-'+next.round+'-'+s.id+'-'+kind,
    sourceId:leader.id,kind,amount,rounds:duration};
   next=crzReplaceStack(next,{...next.stacks.find(x=>x.id===s.id)!,
    effects:[...next.stacks.find(x=>x.id===s.id)!.effects,effect]});
   next=crzLog(next,{type:'EFFECT_APPLIED',unitId:s.id,effectId:effect.id,
    kind,amount});
  }
 }
 if(spellId==='cure_wounds'||spellId==='firebolt'){
  const target=requireTarget(next,targetId,targetSide);
  const affected=Math.min(target.alive,Math.max(1,Math.ceil(leader.power/2)));
  const raw=spellId==='cure_wounds'?
   affected*(leader.power+4):affected*(2+Math.floor(leader.power/3))*5;
  if(spellId==='cure_wounds'){
   const healed=crzHeal(target,raw,true);
   next=crzReplaceStack(next,{...target,...healed,
    moraleState:target.moraleState==='routed'?'routed':crzMoraleState({...target,...healed})});
   next=crzLog(next,{type:'SPELL_HEALED',leaderId:leader.id,unitId:target.id,
    amount:healed.hpPool-target.hpPool,casualties:target.alive-healed.alive,
    aliveAfter:healed.alive});
  }else{
   const cap=affected*target.hpPerCreature,hit=crzApplyDamage(
    target,Math.min(raw,cap),'carry');
   const changed={...target,...hit.stack};
   const morale=crzMoraleState(changed);
   next=crzReplaceStack(next,{...changed,moraleState:morale});
   next=crzLog(next,{type:'SPELL_DAMAGE',leaderId:leader.id,unitId:target.id,
    amount:hit.damageApplied,casualties:hit.casualties,aliveAfter:hit.stack.alive});
   if(hit.damageApplied>0)next={...next,progressThisRound:true};
   if(morale!==target.moraleState)next=crzLog(next,{
    type:'MORALE_CHANGED',unitId:target.id,from:target.moraleState,to:morale});
   if(changed.alive===0)next=crzLog(next,{type:'STACK_DESTROYED',unitId:target.id});
   else if(morale==='routed')next=crzLog(next,{type:'STACK_ROUTED',unitId:target.id});
  }
 }
 return next;
}
