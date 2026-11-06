/** CRZ-1.0 · resolução tática separada do redutor PTE, manual 03 §§6.7–7,10.
 * Lote 4 executa CRZ-5E. Presets sem paridade comprovada não são ativados.
 */
import {crzResolve5e,type CrzAttackEntry,type CrzDamagePart,
 type CrzMitigation} from './damage';
import {crzSafe} from './stack';
import {crzDistance,crzMapIndex,type CrzHex} from './geometry';
import {crzEffectBonus,crzLog,crzMoraleState,crzReplaceStack,crzCapable,
 type CrzBattleStack,type CrzBattleState} from './battle-state';
export type CrzAttackMode='melee'|'ranged';

function mitigation(stack:CrzBattleStack,type:string):CrzMitigation{
 const mods=stack.template.damageMods;
 if(mods.immune.includes(type as never))return 'immune';
 if(mods.resist.includes(type as never))return 'resist';
 if(mods.vulnerable.includes(type as never))return 'vulnerable';
 return 'normal';
}
const isAdjacent=(a:CrzHex,b:CrzHex)=>crzDistance(a,b)===1;
function engagedCount(s:CrzBattleStack,target:CrzBattleStack,
 frontage:'off'|'sqrt',ranks:number):number{
 if(frontage==='off')return s.alive;
 const width=(size:CrzBattleStack['size']):number=>
  size==='L'?2:size==='H'?3:size==='G'?4:1;
 const face=(n:number,w:number)=>Math.ceil(Math.sqrt(n))*w;
 const available=Math.min(face(s.alive,width(s.size)),
  face(target.alive,width(target.size))+2);
 const reach=s.template.attacks.some(a=>a.kind==='melee'&&
  (a.reachFt??0)>=10)?ranks+1:ranks;
 return Math.max(1,Math.min(s.alive,available*reach));
}
function entries(s:CrzBattleStack,target:CrzBattleStack,
 mode:CrzAttackMode):readonly CrzAttackEntry[]{
 const routine=mode==='melee'?s.meleeRoutine:s.rangedRoutine;
 if(!routine)throw new Error('ATTACK: rotina não disponível.');
 return routine.steps.map(step=>{
  const atk=s.template.attacks.find(a=>a.id===step.attackId);
  if(!atk||atk.toHit===undefined)throw new Error('ATTACK: rotina incompleta.');
  return {id:atk.id,count:step.count,toHit:atk.toHit,
   parts:atk.damage.map(part=>{
    const hit=/^([1-9][0-9]{0,2})d([1-9][0-9]{0,3})$/.exec(part.dice);
    if(!hit)throw new Error('ATTACK: dados não normalizados.');
    const value:CrzDamagePart={
     type:part.type,dice:{count:Number(hit[1]),sides:Number(hit[2])},
     mod:part.mod,mitigation:mitigation(target,part.type),
    };
    return value;
   }),
  };
 });
}
function targetAC(state:CrzBattleState,target:CrzBattleStack,mode:CrzAttackMode):number{
 const tile=crzMapIndex(state.map).get(target.position.q+','+target.position.r);
 const cover=mode==='ranged'&&tile?.terrain==='forest'?
  state.ruleset.hit.coverAcBonus.forest:
  mode==='ranged'&&tile?.terrain==='hill'?
   state.ruleset.hit.coverAcBonus.hill:0;
 const leaderDefense=state.leaders[target.side]?.defenseBonus??0;
 const penalty=target.moraleState==='shaken'?state.ruleset.morale.shakenPenalty:0;
 return crzSafe(target.acBase+leaderDefense+crzEffectBonus(target,'ac')+
  (target.defendActive?state.ruleset.defend.acBonus:0)+cover-penalty,'target CA');
}
function attackBonus(state:CrzBattleState,actor:CrzBattleStack,
 target:CrzBattleStack,mode:CrzAttackMode):number{
 const allies=state.stacks.filter(s=>s.side===actor.side&&crzCapable(s)&&
  isAdjacent(s.position,target.position)).length;
 const flank=allies>=2?state.ruleset.hit.flankBonus:0;
 const engaged=mode==='ranged'&&state.stacks.some(s=>s.side!==actor.side&&
  crzCapable(s)&&isAdjacent(s.position,actor.position))?
  state.ruleset.ranged.engagedPenalty:0;
 const distance=crzDistance(actor.position,target.position);
 const longRange=mode==='ranged'&&distance>actor.rangeHex?
  state.ruleset.ranged.longRangePenalty:0;
 const shaken=actor.moraleState==='shaken'?state.ruleset.morale.shakenPenalty:0;
 return crzSafe(actor.atkMod+crzEffectBonus(actor,'attack')+flank-
  engaged-longRange-shaken,'attack bonus');
}
export function crzStrike(state:CrzBattleState,
 actorId:string,targetId:string,mode:CrzAttackMode,
 retaliation=false):CrzBattleState{
 const actor=state.stacks.find(s=>s.id===actorId);
 const target=state.stacks.find(s=>s.id===targetId);
 if(!actor||!target||actor.side===target.side||!crzCapable(actor)||
   !crzCapable(target))throw new Error('ATTACK: alvo/atacante inválido.');
 if(state.ruleset.id!=='CRZ-5E')
  throw new Error('E_SETUP_RULESET: redutor CRZ-5E necessário.');
 const entry=entries(actor,target,mode);
 const engaged=mode==='melee'?engagedCount(actor,target,
  state.ruleset.damage.frontage,state.ruleset.damage.frontageRanks):actor.alive;
 const result=crzResolve5e({
  ruleset:state.ruleset,engagedCount:engaged,
  attackBonus:attackBonus(state,actor,target,mode),
  targetAc:targetAC(state,target,mode),
  target,entries:entry,mode:state.resolution,
  rngState:state.rngState,damageBonusBP:actor.damageBonusBP,
 });
 let next=state;
 if(result.mode==='rolled')next={...next,rngState:result.rngState};
 const changed0={...target,...result.receipt.stack};
 const moraleState=crzMoraleState(changed0);
 const changed:CrzBattleStack={...changed0,moraleState};
 next=crzReplaceStack(next,changed);
 const count=entry.reduce((sum,e)=>sum+e.count,0)*engaged;
 const evt={type:retaliation?'RETALIATION_RESOLVED':'ATTACK_RESOLVED',
  unitId:actorId,targetId,mode:result.mode,
  attacks:result.mode==='rolled'?result.attacks:count,
  hits:result.mode==='rolled'?result.hits:Math.floor(result.expectedHitsX100/100),
  crits:result.mode==='rolled'?result.crits:0,
  rawDamage:result.rawDamage,appliedDamage:result.receipt.damageApplied,
  casualties:result.receipt.casualties,aliveBefore:target.alive,
  aliveAfter:changed.alive,topHpAfter:changed.topHp,
 } as const;
 next=crzLog(next,evt);
 if(result.receipt.damageApplied>0)next={...next,progressThisRound:true};
 if(moraleState!==target.moraleState)next=crzLog(next,{
  type:'MORALE_CHANGED',unitId:target.id,from:target.moraleState,to:moraleState,
 });
 if(changed.alive===0)next=crzLog(next,{type:'STACK_DESTROYED',unitId:target.id});
 else if(moraleState==='routed')next=crzLog(next,{type:'STACK_ROUTED',unitId:target.id});
 return next;
}
