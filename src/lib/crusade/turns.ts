/** CRZ-1.0 · redutor puro de turnos e comandos.
 * Isolado de src/lib/battle/domain; §5–12 do documento 03.
 * Lote 4 é jogável em memória apenas para CRZ-5E e tropas sintéticas.
 */
import {crzRequireKnownRuleset,crzRulesetHash} from './ruleset';
import {crzPcg32} from './rng';
import {crzValidateStack} from './stack';
import {crzLineOfSight,crzReachable,crzGridDistance,crzHexKey,
 crzValidateMap,crzMapIndex,type CrzHex,type CrzSide} from './geometry';
import {crzCapable,crzLog,crzOrder,crzReplaceStack,crzMoraleState,
 crzEffectBonus,type CrzActivation,type CrzBattleStack,
 type CrzBattleState,type CrzEventData} from './battle-state';
import type {CrzReady,CrzSpellId} from './setup';
import {crzStrike} from './strike';
import {crzCast} from './leader';
import {isDndBattle,dndCanFly} from './dnd-mode';

export type CrzCommand=
 |Readonly<{type:'MOVE';unitId:string;to:CrzHex}>
 |Readonly<{type:'ATTACK';unitId:string;targetId:string;mode:'melee'|'ranged'}>
 |Readonly<{type:'WAIT'|'DEFEND'|'END_ACTIVATION';unitId:string}>
 |Readonly<{type:'ABILITY';unitId:string;ability:'CHARGE'|'VOLLEY'|'NIMBLE_ESCAPE'}>
 |Readonly<{type:'CAST';unitId:string;spellId:CrzSpellId;targetId:string|null}>;
export type CrzActor='human'|'ai';
export const crzEmptyActivation=():CrzActivation=>({
 moved:false,attacked:false,guard:false,waited:false,
 retaliationRound:null,extraUsedRound:null,
});
const alive=(s:CrzBattleStack)=>s.alive>0;
function activeStack(state:CrzBattleState):CrzBattleStack{
 if(state.phase!=='active'||!state.activeStackId)throw new Error('TURN: batalha encerrada.');
 const stack=state.stacks.find(s=>s.id===state.activeStackId);
 if(!stack||!crzCapable(stack))throw new Error('TURN: pilha ativa ausente.');
 return stack;
}
function endBattle(state:CrzBattleState,winner:CrzSide|null,
 reason:Extract<CrzEventData,{type:'BATTLE_ENDED'}>['reason']):CrzBattleState{
 if(state.phase==='completed')return state;
 const ended:CrzBattleState={...state,phase:'completed',winner,
  resultReason:reason,activeStackId:null,activationQueue:[],
  waitingQueue:[],activeFromWait:false};
 return crzLog(ended,{type:'BATTLE_ENDED',winner,reason});
}
function checkOutcome(state:CrzBattleState):CrzBattleState{
 if(state.phase!=='active')return state;
 const survivors=(side:CrzSide)=>state.stacks.filter(s=>s.side===side&&alive(s));
 const capable=(side:CrzSide)=>state.stacks.filter(s=>s.side===side&&crzCapable(s));
 const a=capable('attacker'),d=capable('defender');
 if(!a.length&&!d.length)return endBattle(state,null,
  survivors('attacker').length||survivors('defender').length?'rout':'mutual-defeat');
 if(!a.length)return endBattle(state,'defender',
  survivors('attacker').length?'rout':'elimination');
 if(!d.length)return endBattle(state,'attacker',
  survivors('defender').length?'rout':'elimination');
 return state;
}
function clearLeaderUsage(state:CrzBattleState):CrzBattleState{
 const leader=(side:CrzSide)=>{
  const current=state.leaders[side];
  return current?{...current,spellsCastThisRound:0}:null;
 };
 return {...state,leaders:{attacker:leader('attacker'),defender:leader('defender')}};
}
function onNewRound(state:CrzBattleState):CrzBattleState{
 const previous=state.round;
 let next=crzLog(state,{type:'ROUND_ENDED',note:'Encerrada a rodada '+previous});
 const stagnant=next.progressThisRound?0:next.stagnantRounds+1;
 if(previous>=next.ruleset.battle.maxRounds){
  // Igual ao PR #281: pontuar o percentual de PV ainda válidos, não
  // o volume bruto, para não favorecer exércitos inicialmente maiores.
  const score=(side:CrzSide)=>{
   const own=next.stacks.filter(s=>s.side===side);
   const total=own.reduce((n,s)=>n+s.initialCount*s.hpPerCreature,0);
   const live=own.reduce((n,s)=>n+(crzCapable(s)?s.hpPool:0),0);
   return total?Math.floor(live*10000/total):0;
  };
  const a=score('attacker'),d=score('defender');
  return endBattle(next,a===d?null:a>d?'attacker':'defender','round-limit');
 }
 if(stagnant>=next.ruleset.battle.stalemateRounds)
  return endBattle(next,null,'stalemate');
 const refreshed:CrzBattleStack[]=next.stacks.map(s=>({
  ...s,
  activation:{...crzEmptyActivation(),retaliationRound:s.activation.retaliationRound,
   extraUsedRound:s.activation.extraUsedRound},
  effects:s.effects.flatMap(e=>e.rounds>1?[{...e,rounds:e.rounds-1}]:[]),
 }));
 next={...next,round:previous+1,stacks:refreshed,
  stagnantRounds:stagnant,progressThisRound:false,
  waitingQueue:[],activeFromWait:false,activeStackId:null};
 for(const previousStack of state.stacks){
  const updated=next.stacks.find(s=>s.id===previousStack.id)!;
  for(const expired of previousStack.effects.filter(e=>e.rounds<=1)){
   next=crzLog(next,{type:'EFFECT_EXPIRED',unitId:previousStack.id,
    effectId:expired.id,kind:expired.kind,amount:expired.amount});
  }
  if(!crzCapable(updated))continue;
  const revised=isDndBattle(next)?updated.moraleState:crzMoraleState(updated);
  if(revised!==updated.moraleState){
   next=crzReplaceStack(next,{...updated,moraleState:revised});
   next=crzLog(next,{type:'MORALE_CHANGED',unitId:updated.id,
    from:updated.moraleState,to:revised});
  }
 }
 next=clearLeaderUsage(next);
 const queue=crzOrder(next.stacks,next.ruleset.initiative.formula==='pte');
 next={...next,activationQueue:queue};
 next=crzLog(next,{type:'ROUND_STARTED',note:'Iniciada a rodada '+next.round});
 return checkOutcome(next);
}
function skipByMorale(state:CrzBattleState,unit:CrzBattleStack):{
 skip:boolean;state:CrzBattleState
}{
 if(isDndBattle(state)||
  (state.resolution==='expected'&&state.ruleset.morale.expectedIgnoresNumeric)||
  !state.ruleset.morale.skipChance||unit.moraleState!=='shaken')
  return {skip:false,state};
 // Provisório nesta fase: chance de perder a ativação 10–35%, sempre
 // obtida do estado PCG32 versionado, sem RNG global.
 const m=unit.morale+crzEffectBonus(unit,'morale');
 const probability=Math.max(10,Math.min(35,25-Math.floor(m/10)));
 const rng=crzPcg32(state.rngState);
 const skip=rng.nextInt(100)<probability;
 return {skip,state:{...state,rngState:rng.state()}};
}
function maybeGrantExtra(state:CrzBattleState,unit:CrzBattleStack):CrzBattleState{
 if(isDndBattle(state)||
  (state.resolution==='expected'&&state.ruleset.morale.expectedIgnoresNumeric)||
  !state.ruleset.morale.extraChance||state.ruleset.extraTurn.maxPerRound<1||
  !crzCapable(unit)||unit.moraleState!=='steady'||
  unit.activation.extraUsedRound===state.round)return state;
 const m=unit.morale+crzEffectBonus(unit,'morale');
 if(m<15)return state;
 const chance=Math.min(20,Math.max(0,Math.floor(m/5)));
 if(chance===0)return state;
 const rng=crzPcg32(state.rngState),granted=rng.nextInt(100)<chance;
 let next={...state,rngState:rng.state()};
 if(!granted)return next;
 next=crzReplaceStack(next,{...unit,
  activation:{...unit.activation,extraUsedRound:state.round}});
 next={...next,activationQueue:[...next.activationQueue,unit.id]};
 return crzLog(next,{type:'EXTRA_TURN_GRANTED',unitId:unit.id});
}
function nextActivation(state:CrzBattleState):CrzBattleState{
 let next=checkOutcome(state);
 for(let guard=0;guard<300;guard++){
  if(next.phase==='completed')return next;
  const queue=next.activationQueue.filter(id=>next.stacks.some(s=>s.id===id&&crzCapable(s)));
  const waiting=next.waitingQueue.filter(id=>next.stacks.some(s=>s.id===id&&crzCapable(s)));
  if(!queue.length&&!waiting.length){
   next=onNewRound(next);
   continue;
  }
  const fromWait=queue.length===0;
  const id=fromWait?waiting[0]!:queue[0]!;
  const restQueue=fromWait?[]:queue.slice(1);
  const restWaiting=fromWait?waiting.slice(1):waiting;
  let stack=next.stacks.find(s=>s.id===id)!;
  const waited=stack.activation.waited;
  const activation={...stack.activation};
  delete activation.movedPath;
  delete activation.preparedAbility;
  stack={...stack,defendActive:false,
   activation:{...activation,moved:false,attacked:false,
    guard:false,waited}};
  next=crzReplaceStack(next,stack);
  next={...next,activeStackId:id,activationQueue:restQueue,
   waitingQueue:restWaiting,activeFromWait:fromWait};
  const skip=skipByMorale(next,stack);
  next=skip.state;
  if(skip.skip){
   next=crzLog(next,{type:'TURN_SKIPPED',unitId:id});
   next={...next,activeStackId:null,activeFromWait:false};
   continue;
  }
  return crzLog(next,{type:'ACTIVATION_STARTED',unitId:id});
 }
 throw new Error('TURN: excedido limite de ativações da rodada.');
}
function finishActivation(state:CrzBattleState):CrzBattleState{
 const id=state.activeStackId;
 if(!id)throw new Error('TURN: ativação ausente.');
 const actor=state.stacks.find(s=>s.id===id)!;
 let next=crzLog(state,{type:'ACTIVATION_ENDED',unitId:id});
 next={...next,activeStackId:null,activeFromWait:false};
 if(actor.alive&&actor.moraleState!=='routed')
  next=maybeGrantExtra(next,actor);
 return nextActivation(next);
}
export function crzStart(ready:CrzReady):CrzBattleState{
 if(ready.phase!=='ready'||ready.rulesVersion!=='CRZ-1.0')
  throw new Error('E_SETUP_RULESET: estado inicial inválido.');
 const rule=crzRequireKnownRuleset(ready.rulesetId,ready.rulesetHash);
 if(crzRulesetHash(ready.ruleset)!==ready.rulesetHash)
  throw new Error('E_SETUP_RULESET: ruleset modificado.');
 if(rule.id!=='CRZ-5E'&&ready.resolution!=='expected')
  throw new Error('E_SETUP_RULESET: WOTR/PTE experimental exige expected.');
 if(ready.stacks.some(s=>s.source.kind==='house-readonly'))
  throw new Error('E_SETUP_SOURCE: batalha oficial não autorizada.');
 if(new Set(ready.stacks.map(s=>s.id)).size!==ready.stacks.length)
  throw new Error('E_SETUP_DUP: ID repetido.');
 const verifiedMap=crzValidateMap(ready.map),tiles=crzMapIndex(verifiedMap);
  if((verifiedMap.grid??'hex')!==ready.ruleset.grid.kind)
   throw new Error('E_SETUP_MAP: malha e conjunto de regras incompatíveis.');
 const expectedRng=crzPcg32(ready.seed).state();
 if(expectedRng.version!==ready.rngState.version||
    expectedRng.state!==ready.rngState.state||
    expectedRng.inc!==ready.rngState.inc)
  throw new Error('E_SETUP_RNG: seed e estado RNG inicial divergentes.');
 const positions=new Set<string>();
 for(const stack of ready.stacks){
  crzValidateStack(stack);
  const key=crzHexKey(stack.position),tile=tiles.get(key);
  if(!tile||tile.terrain==='rock')
   throw new Error('E_SETUP_MAP: posição inicial fora de hexágono caminhável.');
  if(!verifiedMap.deployment[stack.side].some(h=>crzHexKey(h)===key))
   throw new Error('E_SETUP_ZONE: posição fora da implantação.');
  if(positions.has(key))throw new Error('E_SETUP_DUP: posição repetida.');
  positions.add(key);
 }
 const stacks:CrzBattleStack[]=ready.stacks.map(s=>({
  ...s,activation:crzEmptyActivation(),effects:[],
  moraleState:'steady',defendActive:false,
 }));
 const order=crzOrder(stacks,rule.initiative.formula==='pte');
 let state:CrzBattleState={...ready,phase:'active',stacks,round:1,
  activeStackId:null,activationQueue:order,waitingQueue:[],
  activeFromWait:false,winner:null,resultReason:null,events:[],
  progressThisRound:false,stagnantRounds:0};
 state=crzLog(state,{type:'BATTLE_STARTED',note:state.name});
 state=crzLog(state,{type:'ROUND_STARTED',note:'Iniciada a rodada 1'});
 return nextActivation(state);
}
export function crzLegalCommands(state:CrzBattleState):readonly CrzCommand[]{
 if(state.phase!=='active'||!state.activeStackId)return [];
 const unit=activeStack(state),legal:CrzCommand[]=[];
 // O D&D básico é um modo identificado na sessão, não uma reconfiguração
 // global do CRZ-5E. Não oferece poderes, magias ou ordens especiais ainda.
 const basicOnlyDnd=isDndBattle(state);
 const flight=basicOnlyDnd&&dndCanFly(unit);
 const enemy=state.stacks.filter(s=>s.side!==unit.side&&crzCapable(s));
 if(!unit.activation.attacked&&!unit.activation.moved){
  const occupied=state.stacks.filter(s=>s.id!==unit.id&&crzCapable(s)).map(s=>s.position);
  const enemyPositions=state.ruleset.movement.zocEnabled&&
   unit.activation.preparedAbility!=='NIMBLE_ESCAPE'?enemy.map(s=>s.position):[];
  const bonus=crzEffectBonus(unit,'speed');
  const budget=Math.max(0,Math.min(state.ruleset.movement.maxBudget,
   unit.movementHex+bonus));
  for(const p of crzReachable(state.map,unit.position,budget,occupied,enemyPositions,flight))
   legal.push({type:'MOVE',unitId:unit.id,to:p.to});
 }
 if(!unit.activation.attacked){
  const engaged=enemy.some(s=>crzGridDistance(state.map,s.position,unit.position)===1);
  for(const target of enemy){
   const distance=crzGridDistance(state.map,unit.position,target.position);
   if(distance===1&&unit.meleeRoutine&&unit.activation.preparedAbility!=='VOLLEY')
    legal.push({type:'ATTACK',unitId:unit.id,targetId:target.id,mode:'melee'});
   if(unit.rangedRoutine&&unit.activation.preparedAbility!=='CHARGE'&&
     distance>0&&(basicOnlyDnd||distance<=6)&&
     crzLineOfSight(state.map,unit.position,target.position)&&
     (!engaged||state.ruleset.ranged.engaged!=='forbidden')&&
     (basicOnlyDnd||distance<=Math.max(unit.rangeHex,
      ...unit.template.attacks.filter(x=>x.kind==='ranged').map(x=>
       x.rangeFt?.long?Math.min(6,Math.ceil(x.rangeFt.long/30)):unit.rangeHex))))
    legal.push({type:'ATTACK',unitId:unit.id,targetId:target.id,mode:'ranged'});
  }
 }
 if(!unit.activation.moved&&!unit.activation.attacked&&
   !unit.activation.preparedAbility&&!unit.activation.waited&&!state.activeFromWait&&state.ruleset.wait.maxPerRound>0)
  legal.push({type:'WAIT',unitId:unit.id});
 if(!unit.activation.attacked&&!unit.activation.preparedAbility)
  legal.push({type:'DEFEND',unitId:unit.id});
 if(!basicOnlyDnd&&!unit.activation.attacked&&!unit.activation.preparedAbility){
  const path=unit.activation.movedPath??[];
  if(unit.template.traits.includes('nimble-escape')&&!unit.activation.moved)
   legal.push({type:'ABILITY',unitId:unit.id,ability:'NIMBLE_ESCAPE'});
  if(unit.template.traits.includes('charge')&&unit.meleeRoutine&&path.length>=3){
   const directions=path.slice(1).map((p,i)=>{
    const prev=path[i]!;
    return (p.q-prev.q)+','+(p.r-prev.r);
   });
   if(directions.every(dir=>dir===directions[0]))
    legal.push({type:'ABILITY',unitId:unit.id,ability:'CHARGE'});
  }
  if(unit.rangedRoutine&&state.ruleset.ability.rechargeUsesPerBattle>0&&
    (unit.usage['volley']??0)<state.ruleset.ability.rechargeUsesPerBattle)
   legal.push({type:'ABILITY',unitId:unit.id,ability:'VOLLEY'});
 }
 legal.push({type:'END_ACTIVATION',unitId:unit.id});
 const leader=state.leaders[unit.side];
 if(!basicOnlyDnd&&leader&&!unit.activation.moved&&!unit.activation.attacked&&
   !unit.activation.preparedAbility&&
   leader.spellsCastThisRound<state.ruleset.leader.castsPerRound){
  // A lista de alvos é gerada sob demanda pelo redutor crzCast.
  for(const spellId of leader.spells)
   legal.push({type:'CAST',unitId:unit.id,spellId,targetId:null});
 }
 return legal;
}
function matchingCommand(a:CrzCommand,b:CrzCommand):boolean{
 if(a.type!==b.type||a.unitId!==b.unitId)return false;
 if(a.type==='MOVE'&&b.type==='MOVE')
  return crzHexKey(a.to)===crzHexKey(b.to);
 if(a.type==='ATTACK'&&b.type==='ATTACK')
  return a.targetId===b.targetId&&a.mode===b.mode;
 if(a.type==='ABILITY'&&b.type==='ABILITY')return a.ability===b.ability;
 return a.type===b.type;
}
export function crzPlay(state:CrzBattleState,command:CrzCommand,
 actor:CrzActor='human'):CrzBattleState{
 if(state.phase!=='active')throw new Error('TURN: batalha encerrada.');
 const unit=activeStack(state);
 if(state.controls[unit.side]!==actor)
  throw new Error('TURN: ator sem controle do lado ativo.');
 if(command.unitId!==unit.id)
  throw new Error('TURN: comando de unidade fora do turno.');
 // Os feitiços têm alvos opcionais e verificação própria; outros comandos
 // são validados contra a lista exata do estado.
 const legal=crzLegalCommands(state);
 if(command.type!=='CAST'&&!legal.some(candidate=>matchingCommand(candidate,command)))
  throw new Error('TURN: comando ilegal.');
 if(command.type==='CAST'){
  if(!legal.some(candidate=>candidate.type==='CAST'&&candidate.spellId===command.spellId))
   throw new Error('SPELL: comando fora do momento permitido.');
  return checkOutcome(crzCast(state,command.spellId,command.targetId));
 }
 if(command.type==='ABILITY'){
  const uses=command.ability==='VOLLEY'?(unit.usage['volley']??0)+1:0;
  const updated=crzReplaceStack(state,{...unit,
   usage:command.ability==='VOLLEY'?{...unit.usage,volley:uses}:unit.usage,
   activation:{...unit.activation,preparedAbility:command.ability}});
  return crzLog(updated,{type:'ABILITY_USED',unitId:unit.id,
   ability:command.ability,uses});
 }
 if(command.type==='WAIT'){
  let next=crzReplaceStack(state,{...unit,
   activation:{...unit.activation,waited:true}});
  next=crzLog(next,{type:'WAITED',unitId:unit.id});
  next={...next,activeStackId:null,
   waitingQueue:[...next.waitingQueue,unit.id],activeFromWait:false};
  return nextActivation(next);
 }
 if(command.type==='DEFEND'){
  let next=crzReplaceStack(state,{...unit,defendActive:true,
   activation:{...unit.activation,guard:true}});
  next=crzLog(next,{type:'DEFENDED',unitId:unit.id});
  return finishActivation(next);
 }
 if(command.type==='END_ACTIVATION')return finishActivation(state);
 if(command.type==='MOVE'){
  const occupied=state.stacks.filter(s=>s.id!==unit.id&&crzCapable(s)).map(s=>s.position);
  const enemies=state.ruleset.movement.zocEnabled&&
   unit.activation.preparedAbility!=='NIMBLE_ESCAPE'?
   state.stacks.filter(s=>s.side!==unit.side&&crzCapable(s)).map(s=>s.position):[];
  const path=crzReachable(state.map,unit.position,Math.max(0,Math.min(
   state.ruleset.movement.maxBudget,unit.movementHex+crzEffectBonus(unit,'speed'))),
   occupied,enemies,isDndBattle(state)&&dndCanFly(unit)).find(p=>crzHexKey(p.to)===crzHexKey(command.to));
  if(!path)throw new Error('MOVE: caminho não disponível.');
  let next=crzReplaceStack(state,{...unit,position:command.to,
   activation:{...unit.activation,moved:true,movedPath:path.path}});
  next=crzLog(next,{type:'MOVED',unitId:unit.id,from:unit.position,
   to:command.to,cost:path.cost,path:path.path});
  return {...next,progressThisRound:true};
 }
 if(command.type==='ATTACK'){
  let next=crzStrike(state,unit.id,command.targetId,command.mode);
  const current=next.stacks.find(s=>s.id===unit.id)!;
  next=crzReplaceStack(next,{...current,
   activation:{...current.activation,attacked:true}});
  const target=next.stacks.find(s=>s.id===command.targetId)!;
  if(!isDndBattle(state)&&crzCapable(target)&&crzGridDistance(state.map,target.position,unit.position)===1&&
    target.meleeRoutine&&target.activation.retaliationRound!==next.round){
   next=crzReplaceStack(next,{...target,activation:{
    ...target.activation,retaliationRound:next.round}});
   next=crzStrike(next,target.id,unit.id,'melee',true);
  }
  return checkOutcome(finishActivationIfActive(next));
 }
 throw new Error('TURN: tipo de comando desconhecido.');
}
function finishActivationIfActive(state:CrzBattleState):CrzBattleState{
 const outcome=checkOutcome(state);
 if(outcome.phase==='completed')return outcome;
 return finishActivation(outcome);
}
