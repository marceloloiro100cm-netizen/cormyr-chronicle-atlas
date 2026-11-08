/** Ajustes de efetivo em combate D&D do Narrador.
 * Comandos são parte do replay verificável, sem gravar baixas nas Casas.
 */
import {crzBuildCatalog} from './catalog';
import {crzReadCreature,type CrzCreature} from './creatures';
import {crzPrepareStack} from './convert';
import {crzHexKey,crzMapIndex,crzFootprintCells,type CrzSide} from './geometry';
import {crzPcg32} from './rng';
import {crzMaxCount,crzValidateStack} from './stack';
import {crzCapable,crzLog,crzReplaceStack,type CrzBattleStack,
 type CrzBattleState} from './battle-state';
import {isDndBattle,isDndV3} from './dnd-mode';

export type DndAdminCommand=
 |Readonly<{type:'DND_SET_COUNT';unitId:string;targetId:string;count:number}>
 |Readonly<{type:'DND_WITHDRAW';unitId:string;targetId:string}>
 |Readonly<{type:'DND_ADD_STACK';unitId:string;stackId:string;
  side:CrzSide;count:number;template:CrzCreature}>;

export function dndAdminPlay(state:CrzBattleState,command:DndAdminCommand):CrzBattleState{
 if(!isDndBattle(state)||state.phase!=='active'||!state.activeStackId||
  command.unitId!==state.activeStackId)
  throw Error('D&D: edição de campo não autorizada nesta sessão.');
 if(command.type==='DND_SET_COUNT'||command.type==='DND_WITHDRAW'){
  const stack=state.stacks.find(x=>x.id===command.targetId);
  if(!stack||!crzCapable(stack))throw Error('D&D: pilha indisponível.');
  if(command.type==='DND_WITHDRAW'||command.count===0){
   const result=crzReplaceStack(state,{...stack,moraleState:'routed'});
   let next=crzLog(result,{type:'DND_STACK_WITHDRAWN',unitId:stack.id,
    survivors:stack.alive});
   next={...next,activationQueue:next.activationQueue.filter(id=>id!==stack.id),
    waitingQueue:next.waitingQueue.filter(id=>id!==stack.id),
    ...(next.activeStackId===stack.id?{activeStackId:null}:{})};
   return {...next,progressThisRound:true};
  }
  if(!Number.isSafeInteger(command.count)||command.count<1||
   command.count>crzMaxCount(state.ruleset,stack.size))
   throw Error('D&D: quantidade inválida para tamanho da pilha.');
  const delta=command.count-stack.alive;
  if(!delta)return state;
  const initialCount=stack.initialCount+delta;
  if(initialCount<1||initialCount>crzMaxCount(state.ruleset,stack.size))
   throw Error('D&D: limite histórico da pilha excedido.');
  const changed:CrzBattleStack={...stack,initialCount,alive:command.count,
   hpPool:stack.hpPool+delta*stack.hpPerCreature};
  crzValidateStack(changed);
  return {...crzLog(crzReplaceStack(state,changed),{
   type:'DND_COUNT_CHANGED',unitId:stack.id,previous:stack.alive,
   current:command.count,
  }),progressThisRound:true};
 }
 const template=crzReadCreature(command.template);
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(command.stackId)||
  state.stacks.some(s=>s.id===command.stackId)||
  !Number.isSafeInteger(command.count)||command.count<1||
  command.count>crzMaxCount(state.ruleset,template.size)||
  !['attacker','defender'].includes(command.side))
  throw Error('D&D: reforço inválido, duplicado ou acima do limite.');
 if(state.stacks.filter(s=>s.side===command.side&&crzCapable(s)).length>=7)
  throw Error('D&D: máximo de sete pilhas ativas por exército.');
 const occupied=new Set(state.stacks.filter(crzCapable).flatMap(s=>
  isDndV3(state)?crzFootprintCells(state.map,s.position,s.size):[s.position]
 ).map(crzHexKey));
 const tiles=crzMapIndex(state.map),flying=Boolean(template.flags.flying);
 const zone=state.map.deployment[command.side].find(pos=>{
  if(tiles.get(crzHexKey(pos))?.terrain==='rock')return false;
  const cells=isDndV3(state)?crzFootprintCells(state.map,pos,template.size):[pos];
  return cells.length>0&&cells.every(h=>{
   const key=crzHexKey(h),tile=tiles.get(key);
   return Boolean(tile&&!occupied.has(key)&&(isDndV3(state)&&flying||
    tile.terrain!=='rock'));
  });
 });
 if(!zone)throw Error('D&D: zona de reforços ocupada.');
 const all=[...state.stacks.map(s=>s.template),template];
 const catalog=crzBuildCatalog([...new Map(all.map(t=>[t.id,t])).values()]);
 const prepared=crzPrepareStack({ruleset:state.ruleset,catalog,
  setup:{id:command.stackId,templateId:template.id,count:command.count,
   training:'trained',source:{kind:'fictional'},position:zone},
  side:command.side});
 const rng=crzPcg32(state.rngState);
 const initiative=rng.nextInt(20)+1+template.abilityMods.dex+
  state.ruleset.training.trained.initiative;
 const stack:CrzBattleStack={...prepared,position:zone,initiative,
  activation:{moved:false,attacked:false,waited:false,guard:false,
   retaliationRound:null,extraUsedRound:null},
  defendActive:false,moraleState:'steady',effects:[]};
 return {...crzLog({...state,stacks:[...state.stacks,stack],
  rngState:rng.state(),activationQueue:[...state.activationQueue,stack.id]},
  {type:'DND_STACK_ADDED',unitId:stack.id,side:command.side,
   count:command.count}),progressThisRound:true};
}
