import { z } from 'zod';
import type { BattleCommand, BattleEvent, BattleStack, BattleState, Hex, Side } from './types';
import { TRAINING_BONUS } from './profiles-v2';
import { BATTLE_RULES } from './rulebook-v2';
import { validateBattleDraft } from './setup';
import { hexDistance, hexKey, hexNeighbors } from '../geometry/hex';
import { reachablePaths } from '../geometry/pathfinding';
import { lineOfSight } from '../geometry/visibility';
import { resolveDamage } from './combat';
import { battleOutcome } from './victory';
import { livingCount } from './morale';

const coordinate=z.object({q:z.number().int().safe(),r:z.number().int().safe()}).strict();
const unitId=z.string().min(1).max(80);
export const battleCommandSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('MOVE'),unitId,to:coordinate}).strict(),
  z.object({type:z.literal('ATTACK'),unitId,targetId:unitId}).strict(),
  z.object({type:z.literal('DEFEND'),unitId}).strict(),
  z.object({type:z.literal('WAIT'),unitId}).strict(),
  z.object({type:z.literal('END_ACTIVATION'),unitId}).strict(),
  z.object({type:z.literal('MANUAL_FINISH'),reason:z.string().trim().min(10).max(500),
    winnerSide:z.union([z.literal('attacker'),z.literal('defender'),z.null()])}).strict(),
]);

export function initiative(stack:BattleStack):number {
  // Base de ataque já inclui treino; iniciativa não deve somar treino duas vezes.
  return stack.movementHex+TRAINING_BONUS[stack.training]+
    (stack.attack-TRAINING_BONUS[stack.training]);
}
export function activationOrder(stacks:readonly BattleStack[]):string[] {
  return [...stacks].filter(s=>s.currentHp>0&&s.moraleState!=='routed').sort((a,b)=>
    initiative(b)-initiative(a)||
    (a.side==='attacker'?0:1)-(b.side==='attacker'?0:1)||
    a.id.localeCompare(b.id,'en'),
  ).map(s=>s.id);
}
export function startBattle(state:BattleState):BattleState {
  if(state.phase!=='ready')throw new Error('A batalha precisa estar pronta para iniciar.');
  // Revalidar o snapshot antes de iniciar; nenhum dado de ficha passa aqui.
  validateBattleDraft({
    id:state.id,name:state.name,schemaVersion:state.schemaVersion,
    rulesVersion:state.rulesVersion,seed:state.seed,map:state.map,
    controls:state.controls,stacks:state.stacks,
  });
  const order=activationOrder(state.stacks);
  if(!order.length)throw new Error('Nenhuma unidade pode ser ativada.');
  const first=order[0]!;
  return {...state,phase:'active',round:1,
    activationQueue:order.slice(1),waitingQueue:[],activeUnitId:first,
    stacks:state.stacks.map(s=>s.id===first?{...s,defenseGuard:false}:s)};
}
function currentUnit(state:BattleState):BattleStack {
  if(state.phase!=='active'||!state.activeUnitId)throw new Error('Batalha fora de turno ativo.');
  const unit=state.stacks.find(s=>s.id===state.activeUnitId);
  if(!unit||unit.currentHp<=0||unit.moraleState==='routed')
    throw new Error('Unidade ativa indisponível.');
  return unit;
}
export function legalAttack(state:BattleState,actor:BattleStack,target:BattleStack):{
  legal:boolean;reason?:string;blocker?:Hex
}{
  if(actor.id===target.id||actor.side===target.side)return {legal:false,reason:'O alvo não é inimigo.'};
  if(target.currentHp<=0||target.moraleState==='routed')return {legal:false,reason:'Alvo derrotado.'};
  const distance=hexDistance(actor.position,target.position);
  if(actor.rangeHex===1)
    return distance===1?{legal:true}:{legal:false,reason:'Fora do alcance.'};
  if(state.stacks.some(s=>s.side!==actor.side&&s.currentHp>0&&s.moraleState!=='routed'&&
     hexDistance(s.position,actor.position)===1))
    return {legal:false,reason:'Atirador engajado em combate adjacente.'};
  if(distance<2||distance>actor.rangeHex)return {legal:false,reason:'Fora do alcance.'};
  const los=lineOfSight(state.map,actor.position,target.position);
  if(!los.clear)return {legal:false,reason:'Sem linha de visão.',...(los.blocker?{blocker:los.blocker}:{})};
  return {legal:true};
}
export function getLegalActions(state:BattleState):BattleCommand[]{
  const actor=currentUnit(state),commands:BattleCommand[]=[];
  if(!actor.movedThisActivation&&!actor.attackedThisActivation){
    const occupied=state.stacks.filter(s=>s.id!==actor.id&&s.currentHp>0).map(s=>s.position);
    const enemies=state.stacks.filter(s=>s.side!==actor.side&&s.currentHp>0&&s.moraleState!=='routed').map(s=>s.position);
    for(const path of reachablePaths(state.map,actor.position,actor.movementHex,{occupied,enemies}))
      commands.push({type:'MOVE',unitId:actor.id,to:path.to});
  }
  if(!actor.attackedThisActivation){
    for(const target of state.stacks)
      if(legalAttack(state,actor,target).legal)
        commands.push({type:'ATTACK',unitId:actor.id,targetId:target.id});
  }
  if(!actor.movedThisActivation&&!actor.attackedThisActivation){
    commands.push({type:'DEFEND',unitId:actor.id});
    if(!actor.waitedThisRound)commands.push({type:'WAIT',unitId:actor.id});
  }
  commands.push({type:'END_ACTIVATION',unitId:actor.id});
  return commands;
}
function changeStack(stacks:readonly BattleStack[],id:string,change:Partial<BattleStack>):BattleStack[]{
  return stacks.map(s=>s.id===id?{...s,...change}:s);
}
function progressRound(state:BattleState):boolean {
  return state.events.some(e=>e.round===state.round&&(e.type==='MOVE'||e.type==='DAMAGE'||e.type==='RETALIATION'));
}
function finish(state:BattleState,reason:string,winner:Side|null):BattleState{
  return {...state,phase:'completed',activeUnitId:null,activationQueue:[],waitingQueue:[],
    winner,resultReason:reason};
}
function roundScore(stacks:readonly BattleStack[],side:Side):number{
  const own=stacks.filter(s=>s.side===side);
  const start=own.reduce((total,s)=>total+s.hpPerSoldier*s.initialCount,0);
  const remaining=own.reduce((total,s)=>total+(s.moraleState==='routed'?0:s.currentHp),0);
  return start>0?Math.floor(10000*remaining/start):0;
}
function advance(state:BattleState):BattleState{
  // Fila regular é consumida antes da fila dos que esperaram.
  let queue=[...state.activationQueue],waiting=[...state.waitingQueue];
  let stacks=[...state.stacks],round=state.round,noProgressRounds=state.noProgressRounds;
  while(true){
    let next=queue.shift();
    if(!next)next=waiting.shift();
    if(next){
      const stack=stacks.find(s=>s.id===next);
      if(!stack||stack.currentHp<=0||stack.moraleState==='routed')continue;
      stacks=changeStack(stacks,next,{defenseGuard:false});
      return {...state,round,noProgressRounds,activeUnitId:next,activationQueue:queue,waitingQueue:waiting,stacks};
    }
    noProgressRounds=progressRound(state)?0:noProgressRounds+1;
    const after={...state,stacks,noProgressRounds};
    if(noProgressRounds>=2)return finish(after,'stalemate',null);
    if(round>=BATTLE_RULES.maxRounds){
      const a=roundScore(stacks,'attacker'),b=roundScore(stacks,'defender');
      return finish(after,'round-limit',a===b?null:a>b?'attacker':'defender');
    }
    round++;
    stacks=stacks.map(s=>({...s,movedThisActivation:false,attackedThisActivation:false,
      waitedThisRound:false,retaliationUsedRound:null}));
    queue=activationOrder(stacks);waiting=[];
  }
}
function withEvent(state:BattleState,cmd:BattleCommand,actorId:string,type:string,delta:Record<string,unknown>):BattleState {
  const event:BattleEvent={seq:state.events.length+1,round:state.round,
    actorId,type,command:cmd,delta};
  return {...state,events:[...state.events,event]};
}
/** Reducer imutável do laboratório experimental; nenhuma escrita em HouseState. */
export function applyBattleCommand(state:BattleState,untrusted:unknown,actor:'narrator'|'ai'='narrator'):BattleState {
  const cmd=battleCommandSchema.parse(untrusted) as BattleCommand;
  if(state.phase!=='active')throw new Error('Nenhuma ação permitida fora de batalha ativa.');
  if(cmd.type==='MANUAL_FINISH'){
    if(actor!=='narrator')throw new Error('Encerramento manual exclusivo do Narrador.');
    return finish(withEvent(state,cmd,actor,'MANUAL_FINISH',{reason:cmd.reason,winner:cmd.winnerSide}),'manual',cmd.winnerSide);
  }
  const active=currentUnit(state);
  if(cmd.unitId!==active.id)throw new Error('Não é o turno da unidade.');
  if(state.controls[active.side]==='ai'&&actor!=='ai')throw new Error('Unidade controlada pela IA.');
  if(state.controls[active.side]==='human'&&actor!=='narrator')throw new Error('Comando não autorizado.');
  const legal=getLegalActions(state).some(choice=>JSON.stringify(choice)===JSON.stringify(cmd));
  if(!legal)throw new Error('Comando ilegal: movimento, alcance, ações ou alvo indisponíveis.');
  if(cmd.type==='MOVE'){
    const occupied=state.stacks.filter(s=>s.id!==active.id&&s.currentHp>0).map(s=>s.position);
    const enemies=state.stacks.filter(s=>s.side!==active.side&&s.currentHp>0&&s.moraleState!=='routed').map(s=>s.position);
    const path=reachablePaths(state.map,active.position,active.movementHex,{occupied,enemies})
      .find(p=>hexKey(p.to)===hexKey(cmd.to));
    if(!path)throw new Error('Destino sem caminho válido.');
    return withEvent({...state,stacks:changeStack(state.stacks,active.id,{position:cmd.to,movedThisActivation:true})},
      cmd,actor,'MOVE',{from:active.position,to:cmd.to,cost:path.cost,path:path.path});
  }
  if(cmd.type==='WAIT')
    return advance(withEvent({...state,waitingQueue:[...state.waitingQueue,active.id],
      stacks:changeStack(state.stacks,active.id,{waitedThisRound:true})},
      cmd,actor,'WAIT',{}));
  if(cmd.type==='DEFEND')
    return advance(withEvent({...state,stacks:changeStack(state.stacks,active.id,{defenseGuard:true})},
      cmd,actor,'DEFEND',{guard:2}));
  if(cmd.type==='ATTACK'){
    const target=state.stacks.find(s=>s.id===cmd.targetId);
    if(!target)throw new Error('Alvo não encontrado.');
    const melee=hexDistance(active.position,target.position)===1;
    const hit=resolveDamage(state.map,active,target,!melee);
    let next:BattleState={...state,stacks:changeStack(state.stacks,target.id,{
      currentHp:hit.defender.currentHp,moraleState:hit.defender.moraleState,
    })};
    next=withEvent(next,cmd,actor,'DAMAGE',{
      attackerId:active.id,defenderId:target.id,damage:hit.damage,
      casualties:hit.casualties,aliveBefore:hit.aliveBefore,aliveAfter:hit.aliveAfter,
      morale:hit.defender.moraleState,residualWoundHp:hit.residualWoundHp,
    });
    // Retaliação usa o efetivo sobrevivente, só uma vez por rodada, sem cadeia.
    if(melee&&hit.defender.currentHp>0&&hit.defender.moraleState!=='routed'&&
      hit.defender.retaliationUsedRound!==state.round){
      const retaliation=resolveDamage(state.map,hit.defender,active,false);
      const finalDefender={...hit.defender,retaliationUsedRound:state.round};
      next={...next,stacks:next.stacks.map(s=>
        s.id===active.id?{...retaliation.defender,attackedThisActivation:true}:
        s.id===target.id?finalDefender:s)};
      next=withEvent(next,cmd,actor,'RETALIATION',{
        attackerId:target.id,defenderId:active.id,damage:retaliation.damage,
        casualties:retaliation.casualties,aliveAttacker:livingCount(finalDefender),
        aliveDefender:retaliation.aliveAfter,morale:retaliation.defender.moraleState,
      });
    }else{
      next={...next,stacks:changeStack(next.stacks,active.id,{attackedThisActivation:true})};
    }
    const outcome=battleOutcome(next.stacks);
    if(outcome)return finish(next,outcome.reason,outcome.winner);
    return advance(next);
  }
  return advance(withEvent(state,cmd,actor,'END_ACTIVATION',{}));
}
export function archiveBattle(state:BattleState):BattleState {
  if(state.phase!=='completed')throw new Error('Apenas batalhas concluídas podem ser arquivadas.');
  return {...state,phase:'archived'};
}
