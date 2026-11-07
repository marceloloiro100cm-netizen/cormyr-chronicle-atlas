/** CRZ-1.0 · Líder fora do mapa, com ação restrita à ativação aliada.
 * Manual 03 §9. Lote 4 implementa subset auditável e recusa o resto.
 */
import {crzApplyDamage,crzHeal} from './stack';
import {crzAoEExpected} from './damage';
import {crzCapable,crzLog,crzMoraleState,crzReplaceStack,
 type CrzBattleStack,type CrzBattleState,type CrzEffect} from './battle-state';
import {crzDistance,type CrzSide} from './geometry';
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
export const CRZ_LOT8_SPELLS:readonly CrzSpellId[]=[
 ...CRZ_LOT4_SPELLS,'shield_wall_formation',
];
export const CRZ_ADVANCED_SPELLS:readonly CrzSpellId[]=[...CRZ_LOT8_SPELLS,'fireball'];
/** Exige pelo menos duas pilhas corpo a corpo aliadas e adjacentes.
 * A formação nunca é inferida de tropas ou posses oficiais.
 */
export function crzShieldWallTargets(state:CrzBattleState,side:CrzSide):CrzBattleStack[]{
 const allies=state.stacks.filter(s=>s.side===side&&crzCapable(s)&&s.meleeRoutine);
 return allies.filter(s=>allies.some(other=>other.id!==s.id&&
  crzDistance(other.position,s.position)===1));
}
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
 if(!CRZ_ADVANCED_SPELLS.includes(spellId))
  throw new Error('SPELL_UNSUPPORTED: requer redutor do próximo lote.');
 if(leader.spellsCastThisRound>=state.ruleset.leader.castsPerRound)
  throw new Error('SPELL: General já atuou nesta rodada.');
 const cost=COSTS[spellId];
 if(leader.energy<cost)throw new Error('SPELL: energia insuficiente.');
 const single=spellId==='shield_of_faith'||spellId==='heroism'||
  spellId==='cause_fear'||spellId==='cure_wounds'||spellId==='firebolt'||spellId==='fireball';
 const targetSide=spellId==='bane'||spellId==='cause_fear'||
  spellId==='firebolt'||spellId==='fireball'?(side==='attacker'?'defender':'attacker'):side;
 if(single)requireTarget(state,targetId,targetSide);
 else if(targetId!==null)throw new Error('SPELL: feitiço coletivo não aceita alvo único.');
 const shieldWall=spellId==='shield_wall_formation'?crzShieldWallTargets(state,side):[];
 if(spellId==='shield_wall_formation'&&!shieldWall.length)
  throw new Error('SPELL: formação exige duas pilhas corpo a corpo aliadas adjacentes.');
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
 }else if(spellId==='shield_wall_formation'){
  effects.push({kind:'ac',amount:2,targets:shieldWall});
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
   const current=next.stacks.find(x=>x.id===s.id)!;
   // Renova, sem empilhar, um bônus da mesma formação do mesmo General.
   const retained=current.effects.filter(old=>
    !(spellId==='shield_wall_formation'&&old.kind==='ac'&&
      old.sourceId===leader.id&&old.id.includes('-shield_wall_formation-')));
   next=crzReplaceStack(next,{...current,effects:[...retained,effect]});
   next=crzLog(next,{type:'EFFECT_APPLIED',unitId:s.id,effectId:effect.id,
    kind,amount});
  }
 }
 // Bola de fogo: centro sobre pilha inimiga viva, raio hexagonal 2, sem fogo amigo
 // no laboratório; até 10 combatentes expostos por agrupamento. Sorte é
 // resolvida deterministicamente por salvaguarda esperada, não RNG global.
 if(spellId==='fireball'){
  const anchor=requireTarget(next,targetId,targetSide);
  if(crzDistance(active.position,anchor.position)>5)
   throw new Error('SPELL: centro da explosão fora do alcance de cinco hexágonos.');
  const victims=next.stacks.filter(s=>s.side===targetSide&&crzCapable(s)&&
   crzDistance(s.position,anchor.position)<=2);
  if(victims.length===0)throw new Error('SPELL: nenhum inimigo alcançado.');
  for(const victim of victims){
   const current=next.stacks.find(s=>s.id===victim.id)!;
   const hit=crzAoEExpected({affected:Math.min(10,current.alive),
    averageDamageX100:(20+leader.power*2)*100,
    saveBonus:current.template.abilityMods.dex,
    dc:12+Math.floor(leader.power/2),saveEffect:'half',target:current});
   const changed={...current,...hit.receipt.stack};
   const morale=crzMoraleState(changed);
   next=crzReplaceStack(next,{...changed,moraleState:morale});
   next=crzLog(next,{type:'SPELL_DAMAGE',leaderId:leader.id,unitId:current.id,
    amount:hit.receipt.damageApplied,casualties:hit.receipt.casualties,
    aliveAfter:changed.alive});
   if(hit.receipt.damageApplied>0)next={...next,progressThisRound:true};
   if(morale!==current.moraleState)next=crzLog(next,{
    type:'MORALE_CHANGED',unitId:current.id,from:current.moraleState,to:morale});
   if(changed.alive===0)next=crzLog(next,{type:'STACK_DESTROYED',unitId:current.id});
   else if(morale==='routed')next=crzLog(next,{type:'STACK_ROUTED',unitId:current.id});
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
