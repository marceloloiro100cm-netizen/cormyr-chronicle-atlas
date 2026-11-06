/** CRZ-1.0 · Lote 4.2: um ataque atômico, retaliação e moral por baixas.
 * 03 §§6.2,6.7,6.8,6.9,7,10 e golden T-INT-01.
 */
import {hexDistance} from '../battle/geometry/hex';
import type {CrzAttackProfile} from './creatures';
import {crzResolve5e,type CrzAttackEntry,type CrzDamagePart} from './damage';
import type {CrzBattleState,CrzBattleUnit} from './battle';
import {crzBattleRules,crzAlive,crzFind,crzLog,
 crzMoraleAfterDamage,crzReplace} from './battle';
import {crzAttackOptions,type CrzTargetOption} from './geometry';
import {crzSafe,type CrzStack} from './stack';
import type {CrzMitigation} from './damage';

function mitigating(defender:CrzBattleUnit,type:string):CrzMitigation{
 if(defender.template.damageMods.immune.includes(type as never))return 'immune';
 if(defender.template.damageMods.resist.includes(type as never))return 'resist';
 if(defender.template.damageMods.vulnerable.includes(type as never))return 'vulnerable';
 return 'normal';
}
function attackEntries(attacker:CrzBattleUnit,defender:CrzBattleUnit,
 kind:'melee'|'ranged',bonusDice:number):readonly CrzAttackEntry[]{
 const routine=kind==='melee'?attacker.meleeRoutine:attacker.rangedRoutine;
 if(!routine)throw new Error('E_COMMAND_ATTACK: rotina não disponível.');
 return routine.steps.map((step,i)=>{
  const profile:CrzAttackProfile|undefined=attacker.template.attacks.find(
   attack=>attack.id===step.attackId);
  if(!profile||profile.toHit===undefined||profile.kind!==kind)
   throw new Error('E_COMMAND_ATTACK: ataque inválido na ficha.');
  const parts:CrzDamagePart[]=profile.damage.map((part,j)=>{
   const match=/^([1-9][0-9]{0,2})d([1-9][0-9]{0,3})$/.exec(part.dice);
   if(!match)throw new Error('E_COMMAND_ATTACK: dados inválidos.');
   return {type:part.type,dice:{
    count:Number(match[1])+(i===0&&j===0?bonusDice:0),
    sides:Number(match[2]),
   },mod:part.mod,mitigation:mitigating(defender,part.type)};
  });
  return {id:profile.id,count:step.count,toHit:profile.toHit,parts};
 });
}
const sum=(unit:CrzBattleUnit,stat:'attack'|'ac'|'morale'|'movement')=>
 unit.effects.filter(effect=>effect.stat===stat)
  .reduce((n,e)=>crzSafe(n+e.modifier,'effect bonus'),0);
const width=(unit:CrzBattleUnit):number=>({
 T:1,S:1,M:1,L:2,H:3,G:4,
})[unit.size];
function engagedCount(attacker:CrzBattleUnit,target:CrzBattleUnit,
 kind:'melee'|'ranged',frontage:'off'|'sqrt',ranks:number):number{
 if(kind==='ranged'||frontage==='off')return attacker.alive;
 const flank=Math.min(Math.ceil(Math.sqrt(attacker.alive))*width(attacker),
  Math.ceil(Math.sqrt(target.alive))*width(target)+2);
 return Math.min(attacker.alive,flank*ranks);
}
export type CrzStrikeInfo=Readonly<{
 attackerId:string;defenderId:string;kind:'melee'|'ranged';
 mode:'expected'|'rolled';engaged:number;damage:number;rawDamage:number;
 casualties:number;aliveBefore:number;aliveAfter:number;
}>;
function strike(state:CrzBattleState,attackerId:string,
 targetId:string,option:CrzTargetOption,
 type:'ATTACKED'|'RETALIATED'):
 {state:CrzBattleState;info:CrzStrikeInfo}{
 const rules=crzBattleRules(state);
 const attacker=crzFind(state,attackerId),target=crzFind(state,targetId);
 if(!crzAlive(attacker)||!crzAlive(target))
  throw new Error('E_COMMAND_TARGET: alvo ou atacante indisponível.');
 const shakenAttacker=attacker.moraleState==='shaken'?rules.morale.shakenPenalty:0;
 const shakenTarget=target.moraleState==='shaken'?rules.morale.shakenPenalty:0;
 const pack=attacker.template.traits.includes('pack-tactics')&&
  state.stacks.some(s=>s.id!==attacker.id&&s.side===attacker.side&&crzAlive(s)&&
   hexDistance(s.position,target.position)===1);
 const flanking=option.flanking||pack;
 const engagingPenalty=option.kind==='ranged'&&option.engaged?
  rules.ranged.engagedPenalty:0;
 const bonus=crzSafe(attacker.atkMod+sum(attacker,'attack')+
  (flanking?rules.hit.flankBonus:0)-shakenAttacker-engagingPenalty,'attack bonus');
 const defense=crzSafe(target.acBase+
  (target.activation.defendActive?rules.defend.acBonus:0)+
  sum(target,'ac')+option.coverAc-shakenTarget,'target AC');
 const engaged=engagedCount(attacker,target,option.kind,rules.damage.frontage,
  rules.damage.frontageRanks);
 const entries=attackEntries(attacker,target,option.kind,
  attacker.activation.abilityBonusDice);
 const extra=state.resolution==='expected'?{mode:'expected' as const}:
  state.resolution==='rolled'?{mode:'rolled' as const}:{mode:'hybrid' as const};
 const result=crzResolve5e({
  ruleset:rules,engagedCount:engaged,attackBonus:bonus,targetAc:defense,
  target,entries,damageBonusBP:attacker.damageBonusBP,
  rngState:state.rng,...extra,
 });
 const before=target.alive,after=result.receipt.stack;
 let next=state;
 if(result.mode==='rolled')next={...next,rng:result.rngState};
 const updated=crzMoraleAfterDamage({...target,...after},rules);
 next=crzReplace(next,updated);
 const info:CrzStrikeInfo={attackerId,defenderId:targetId,kind:option.kind,
  mode:result.mode,engaged,damage:result.receipt.damageApplied,
  rawDamage:result.rawDamage,casualties:result.receipt.casualties,
  aliveBefore:before,aliveAfter:updated.alive};
 next=crzLog({...next,progressThisRound:next.progressThisRound||
  result.receipt.damageApplied>0},type,attackerId,targetId,{
  kind:option.kind,mode:result.mode,engaged,
  damage:info.damage,rawDamage:info.rawDamage,
  casualties:info.casualties,aliveBefore:before,aliveAfter:updated.alive,
  topHpAfter:updated.topHp,
  ...(result.mode==='rolled'?{hits:result.hits,crits:result.crits,
   attacks:result.attacks}:{
   expectedHitsX100:result.expectedHitsX100,
  }),
 });
 if(updated.moraleState!==target.moraleState){
  next=crzLog(next,'MORALE_CHANGED',targetId,null,{
   from:target.moraleState,to:updated.moraleState,
  });
 }
 return {state:next,info};
}
export function crzStrike(state:CrzBattleState,attackerId:string,
 defenderId:string):{state:CrzBattleState;first:CrzStrikeInfo;
 retaliation:CrzStrikeInfo|null}{
 const attacker=crzFind(state,attackerId);
 if(state.activeId!==attackerId||state.phase!=='active')
  throw new Error('E_COMMAND_TURN: atacante fora da ativação.');
 if(attacker.activation.attacked)throw new Error('E_COMMAND_ATTACK: já atacou.');
 const option=crzAttackOptions(state,attacker)
  .find(x=>x.targetId===defenderId);
 if(!option)throw new Error('E_COMMAND_ATTACK: alvo fora do alcance ou visão.');
 const primary=strike(state,attackerId,defenderId,option,'ATTACKED');
 const afterAttacker=crzFind(primary.state,attackerId);
 let next=crzReplace(primary.state,{...afterAttacker,
  activation:{...afterAttacker.activation,attacked:true}});
 const enemy=crzFind(next,defenderId),rules=crzBattleRules(next);
 let retaliation:CrzStrikeInfo|null=null;
 if(option.kind==='melee'&&rules.id!=='CRZ-WOTR'&&
   crzAlive(enemy)&&enemy.meleeRoutine&&enemy.activation.retaliationRound!==state.round){
  const retalOptions=crzAttackOptions(next,enemy)
   .find(x=>x.targetId===attackerId&&x.kind==='melee');
  if(retalOptions){
   const result=strike(next,defenderId,attackerId,retalOptions,'RETALIATED');
   next=result.state;retaliation=result.info;
   const surviving=crzFind(next,defenderId);
   next=crzReplace(next,{...surviving,
    activation:{...surviving.activation,retaliationRound:state.round}});
  }
 }
 return {state:next,first:primary.info,retaliation};
}
