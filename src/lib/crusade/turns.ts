/** CRZ-1.0 · Lote 4.3: redutor puro de rodadas, movimentos, ações e líder.
 * Fonte normativa 03 §§5–6,9–10,12,17. PTE só fornece geometria; nunca redutor.
 * O único preset executável nesta fase é CRZ-5E.
 */
import {z} from 'zod';
import type {Hex} from '../battle/domain/types';
import {hexKey} from '../battle/geometry/hex';
import {crzHeal,crzClamp,crzSafe} from './stack';
import {crzPcg32} from './rng';
import {crzReachable} from './geometry';
import {crzStrike} from './combat';
import {crzAlive,crzBattleRules,crzCheckVictory,crzConclude,
 crzFind,crzLog,crzOrder,crzReplace,crzScore,
 type CrzBattleState,type CrzBattleUnit,type CrzSide,
 type CrzEffect,type CrzLeader} from './battle';

const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const hex=z.object({q:z.number().int().safe(),r:z.number().int().safe()}).strict();
export const crzCommandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('MOVE'),unitId:id,to:hex}).strict(),
 z.object({type:z.literal('ATTACK'),unitId:id,targetId:id}).strict(),
 z.object({type:z.literal('WAIT'),unitId:id}).strict(),
 z.object({type:z.literal('DEFEND'),unitId:id}).strict(),
 z.object({type:z.literal('END_ACTIVATION'),unitId:id}).strict(),
 z.object({type:z.literal('ABILITY'),unitId:id,
  ability:z.enum(['CHARGE','VOLLEY'])}).strict(),
 z.object({type:z.literal('LEADER_CAST'),side:z.enum(['attacker','defender']),
  spell:z.enum(['bless','bane','shield_of_faith','cure_wounds']),
  targetId:id.optional()}).strict(),
]);
export type CrzCommand=z.infer<typeof crzCommandSchema>;
const battleActive=(state:CrzBattleState)=>{
 if(state.phase!=='active'||!state.activeId)throw new Error('E_COMMAND_TURN: batalha sem unidade ativa.');
 return crzFind(state,state.activeId);
};
const spellCost:Readonly<Record<'bless'|'bane'|'shield_of_faith'|'cure_wounds',number>>={
 bless:3,bane:3,shield_of_faith:2,cure_wounds:2,
};
function effect(unit:CrzBattleUnit,data:CrzEffect):CrzBattleUnit{
 // Acúmulos de uma mesma origem/nome são substituídos, nunca multiplicados em silêncio.
 return {...unit,effects:[...unit.effects.filter(e=>!(e.source===data.source&&
  e.stat===data.stat)),data]};
}
function castLeader(state:CrzBattleState,
 cmd:Extract<CrzCommand,{type:'LEADER_CAST'}>):CrzBattleState{
 const actor=battleActive(state),rules=crzBattleRules(state),leader=state.leaders[cmd.side];
 if(actor.side!==cmd.side||actor.activation.moved||actor.activation.attacked||
  actor.activation.activatedAbility)
  throw new Error('E_COMMAND_LEADER: só antes da ação da pilha aliada.');
 if(!leader||!leader.spells.includes(cmd.spell))
  throw new Error('E_COMMAND_LEADER: feitiço não preparado.');
 if(rules.leader.castsPerRound<1||leader.castRound===state.round)
  throw new Error('E_COMMAND_LEADER: limite de feitiços por rodada.');
 const cost=spellCost[cmd.spell];
 if(leader.energy<cost)throw new Error('E_COMMAND_LEADER: energia insuficiente.');
 let next=state;
 const duration=2+Math.floor(leader.power/2);
 const source='leader:'+cmd.side+':'+cmd.spell;
 const global=cmd.spell==='bless'||cmd.spell==='bane';
 let affected:string[]=[];
 let healed=0;
 if(global){
  if(cmd.targetId)throw new Error('E_COMMAND_LEADER: feitiço global não recebe alvo.');
  const targetSide=cmd.spell==='bless'?cmd.side:
   cmd.side==='attacker'?'defender':'attacker';
  next={...next,stacks:next.stacks.map(unit=>{
   if(unit.side!==targetSide||!crzAlive(unit))return unit;
   affected.push(unit.id);
   return effect(unit,{id:source,source,stat:'attack',
    modifier:cmd.spell==='bless'?1:-1,remainingRounds:duration});
  })};
 }else{
  if(!cmd.targetId)throw new Error('E_COMMAND_LEADER: alvo obrigatório.');
  const target=crzFind(next,cmd.targetId);
  if(!crzAlive(target)||target.side!==cmd.side)
   throw new Error('E_COMMAND_LEADER: alvo aliado indisponível.');
  affected=[target.id];
  if(cmd.spell==='shield_of_faith'){
   next=crzReplace(next,effect(target,{id:source,source,
    stat:'ac',modifier:2+Math.floor(leader.power/6),
    remainingRounds:duration}));
  }else{
   const count=Math.ceil(leader.power/2);
   if(state.resolution==='expected'){
    healed=Math.floor(count*(450+100*leader.power)/100);
   }else{
    const rng=crzPcg32(next.rng);
    for(let i=0;i<count;i++)
     healed=crzSafe(healed+rng.nextInt(8)+1+leader.power,'leader heal');
    next={...next,rng:rng.state()};
   }
   next=crzReplace(next,{...target,...crzHeal(target,healed,true)});
  }
 }
 const newLeader:CrzLeader={...leader,energy:leader.energy-cost,castRound:state.round};
 next={...next,leaders:{...next.leaders,[cmd.side]:newLeader}};
 next=crzLog(next,'LEADER_CAST',leader.id,cmd.targetId??null,{
  spell:cmd.spell,cost,energyAfter:newLeader.energy,
  targets:affected.join(','),healed,
 });
 return crzCheckVictory(next);
}
function moraleNumber(unit:CrzBattleUnit):number{
 return crzClamp(unit.morale+unit.effects.filter(e=>e.stat==='morale')
  .reduce((n,e)=>n+e.modifier,0),-100,100);
}
function checkSkip(state:CrzBattleState,unit:CrzBattleUnit):
 {skip:boolean;state:CrzBattleState}{
 const hard=unit.effects.find(e=>e.stat==='skip');
 if(hard){
  return {skip:true,state:crzReplace(state,{...unit,
   effects:unit.effects.filter(e=>e.id!==hard.id)})};
 }
 const rules=crzBattleRules(state);
 if(state.resolution==='expected'||!rules.morale.numeric||
  !rules.morale.skipChance||['undead','construct','ooze']
   .includes(unit.template.creatureType.toLowerCase()))
  return {skip:false,state};
 const morale=moraleNumber(unit);
 if(morale>=0)return {skip:false,state};
 const chance=Math.floor(-morale*10000/(100-morale));
 const rng=crzPcg32(state.rng),roll=rng.nextInt(10000);
 return {skip:roll<chance,state:{...state,rng:rng.state()}};
}
function beginActivation(state:CrzBattleState,
 idActive:string,afterWait:boolean):CrzBattleState{
 const unit=crzFind(state,idActive);
 const activated:CrzBattleUnit={...unit,activation:{
  ...unit.activation,moved:false,attacked:false,defendActive:false,
  movedPath:[],afterWait,abilityBonusDice:0,activatedAbility:null,
 }};
 let next=crzReplace({...state,activeId:idActive},activated);
 next=crzLog(next,'ACTIVATED',idActive,null,{afterWait});
 return next;
}
function endOfRound(state:CrzBattleState):CrzBattleState{
 const rules=crzBattleRules(state);
 const stalled=state.progressThisRound?0:state.noProgressRounds+1;
 let next=crzLog({...state,noProgressRounds:stalled},'ROUND_ENDED',null,null,{
  progress:state.progressThisRound,stalled,
 });
 const result=crzCheckVictory(next);
 if(result.phase==='completed')return result;
 if(stalled>=rules.battle.stalemateRounds)
  return crzConclude(next,null,'stalemate');
 if(state.round>=rules.battle.maxRounds){
  const aa=crzScore(state,'attacker'),dd=crzScore(state,'defender');
  return crzConclude(next,aa===dd?null:aa>dd?'attacker':'defender','round-limit');
 }
 next={...next,round:state.round+1,progressThisRound:false,
  stacks:next.stacks.map(unit=>({...unit,
   effects:unit.effects.flatMap(e=>e.remainingRounds>1?
    [{...e,remainingRounds:e.remainingRounds-1}]:[]),
   activation:{...unit.activation,moved:false,attacked:false,
    waited:false,movedPath:[],afterWait:false,
    abilityBonusDice:0,activatedAbility:null},
  }))};
 return {...next,queue:crzOrder(next.stacks,rules),waiting:[],activeId:null};
}
function maybeExtra(state:CrzBattleState,unit:CrzBattleUnit):CrzBattleState{
 const rules=crzBattleRules(state);
 if(state.resolution==='expected'||!rules.morale.numeric||
   !rules.morale.extraChance||rules.extraTurn.maxPerRound<1||
   unit.activation.afterWait||unit.activation.extraTurnUsedRound===state.round||
   !crzAlive(unit)||['undead','construct','ooze']
    .includes(unit.template.creatureType.toLowerCase()))
  return state;
 const m=moraleNumber(unit);
 if(m<=0)return state;
 const rng=crzPcg32(state.rng),roll=rng.nextInt(10000);
 let next:CrzBattleState={...state,rng:rng.state()};
 if(roll>=Math.min(m,75)*100)return next;
 const activated:CrzBattleUnit={...unit,activation:{
  ...unit.activation,extraTurnUsedRound:state.round,
 }};
 next=crzReplace(next,activated);
 next=crzLog(next,'EXTRA_TURN_GRANTED',unit.id,null,{roll,morale:m});
 return beginActivation(next,unit.id,false);
}
/** A fila é a única autoridade para escolher o ativo; nunca aceitar troca via input. */
function takeNext(state:CrzBattleState):CrzBattleState{
 let next=state;
 for(let attempts=0;attempts<1000;attempts++){
  if(next.phase==='completed')return next;
  if(next.queue.length===0&&next.waiting.length===0){
   next=endOfRound(next);
   if(next.phase==='completed')return next;
  }
  const fromWait=next.queue.length===0;
  const idActive=fromWait?next.waiting[next.waiting.length-1]:
   next.queue[0];
  if(!idActive)throw new Error('E_COMMAND_TURN: fila vazia após renovação.');
  next={...next,activeId:null,queue:fromWait?next.queue:next.queue.slice(1),
   waiting:fromWait?next.waiting.slice(0,-1):next.waiting};
  const candidate=crzFind(next,idActive);
  if(!crzAlive(candidate))continue;
  next=beginActivation(next,idActive,fromWait);
  const actor=crzFind(next,idActive),skip=checkSkip(next,actor);
  next=skip.state;
  if(skip.skip){
   next=crzLog({...next,activeId:null},'TURN_SKIPPED',idActive,null,{
    reason:actor.effects.some(e=>e.stat==='skip')?'effect':'morale',
   });
   continue;
  }
  return next;
 }
 throw new Error('E_COMMAND_TURN: fila não progrediu em 1000 tentativas.');
}
export function crzStartBattle(state:CrzBattleState):CrzBattleState{
 if(state.phase!=='ready'||state.round!==0||state.events.length!==0||
  state.activeId!==null||state.queue.length||state.waiting.length)
  throw new Error('E_COMMAND_TURN: estado inicial inválido.');
 const rules=crzBattleRules(state),outcome=crzCheckVictory({...state,phase:'active'});
 if(outcome.phase==='completed')return outcome;
 const ready=crzLog({...state,phase:'active',round:1,
  queue:crzOrder(state.stacks,rules),waiting:[]},'BATTLE_STARTED');
 return takeNext(ready);
}
function endActivation(state:CrzBattleState,skipExtra=false):CrzBattleState{
 const actor=battleActive(state);
 let next=crzLog({...state,activeId:null},'ACTIVATION_ENDED',actor.id);
 if(!skipExtra)next=maybeExtra(next,actor);
 return next.activeId?next:takeNext(next);
}
export function crzApplyCommand(untrusted:CrzBattleState,
 incoming:unknown):CrzBattleState{
 const command=crzCommandSchema.parse(incoming);
 const state=untrusted;
 if(state.phase!=='active')throw new Error('E_COMMAND_TURN: batalha não está ativa.');
 crzBattleRules(state); // recusa hashes desconhecidos antes de qualquer comando
 const active=battleActive(state);
 if(command.type==='LEADER_CAST')return castLeader(state,command);
 if(command.unitId!==active.id)
  throw new Error('E_COMMAND_TURN: unidade fora do turno.');
 if(!crzAlive(active))throw new Error('E_COMMAND_UNIT: unidade destruída/debandada.');
 if(command.type==='MOVE'){
  const path=crzReachable(state,active)
   .find(p=>hexKey(p.to)===hexKey(command.to));
  if(!path)throw new Error('E_COMMAND_MOVE: destino fora de alcance, bloqueado ou em ZOC.');
  let next=crzReplace(state,{...active,position:{...command.to},
   activation:{...active.activation,moved:true,movedPath:path.path}});
  next=crzLog({...next,progressThisRound:true},'MOVED',active.id,null,{
   from:hexKey(active.position),to:hexKey(command.to),
   cost:path.cost,path:path.path.map(hexKey).join(';'),
  });
  return next;
 }
 if(command.type==='ATTACK'){
  const result=crzStrike(state,active.id,command.targetId);
  return crzCheckVictory(result.state);
 }
 if(command.type==='ABILITY'){
  if(active.activation.activatedAbility||active.activation.attacked)
   throw new Error('E_COMMAND_ABILITY: habilidade já usada nesta ativação.');
  let used={...active.usage};
  if(command.ability==='CHARGE'){
   if(!active.template.traits.includes('charge')||!active.meleeRoutine||
     active.activation.movedPath.length<3)
    throw new Error('E_COMMAND_ABILITY: carga exige traço e deslocamento de dois hexágonos.');
   const delta=active.activation.movedPath.slice(1).map((h,i)=>{
    const prev=active.activation.movedPath[i]!;
    return (h.q-prev.q)+','+(h.r-prev.r);
   });
   if(!delta.every(d=>d===delta[0]))
    throw new Error('E_COMMAND_ABILITY: carga exige movimento em linha reta.');
  }else{
   if(!active.rangedRoutine)throw new Error('E_COMMAND_ABILITY: Volley exige atiradores.');
   const limit=crzBattleRules(state).ability.rechargeUsesPerBattle;
   if((used['volley']??0)>=limit||limit<1)
    throw new Error('E_COMMAND_ABILITY: sem cargas de Volley.');
   used={...used,volley:(used['volley']??0)+1};
  }
  const boosted=crzReplace(state,{...active,usage:used,activation:{
   ...active.activation,activatedAbility:command.ability,abilityBonusDice:1,
  }});
  return crzLog(boosted,'ABILITY_USED',active.id,null,{
   ability:command.ability,bonusDice:1,
  });
 }
 if(command.type==='WAIT'){
  const rules=crzBattleRules(state);
  if(active.activation.moved||active.activation.attacked||
   active.activation.activatedAbility||active.activation.waited||
   rules.wait.maxPerRound<1)
   throw new Error('E_COMMAND_WAIT: ação indisponível.');
  let next=crzReplace(state,{...active,
   activation:{...active.activation,waited:true}});
  next=crzLog({...next,activeId:null,waiting:[...next.waiting,active.id]},
   'WAITED',active.id);
  return takeNext(next);
 }
 if(command.type==='DEFEND'){
  if(active.activation.moved||active.activation.attacked||
   active.activation.activatedAbility)
   throw new Error('E_COMMAND_DEFEND: só antes de mover/atacar.');
  const next=crzLog(crzReplace(state,{...active,
   activation:{...active.activation,defendActive:true}}),'DEFENDED',active.id);
  return endActivation(next);
 }
 return endActivation(state);
}
