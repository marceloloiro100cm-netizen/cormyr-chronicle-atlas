import type { BattleCommand, BattleState, BattleStack, Hex } from './types';
import { applyBattleCommand, getLegalActions } from './turns';
import { resolveDamage } from './combat';
import { hexKey } from '../geometry/hex';
import {gridDistance} from '../geometry/grid';
import { reachablePaths } from '../geometry/pathfinding';
import {lineOfSight} from '../geometry/visibility';

type Attack=Extract<BattleCommand,{type:'ATTACK'}>;
type Move=Extract<BattleCommand,{type:'MOVE'}>;
function active(state:BattleState):BattleStack {
 const unit=state.stacks.find(s=>s.id===state.activeUnitId);
 if(state.phase!=='active'||!unit)throw new Error('Nenhuma ativação em andamento.');
 if(state.controls[unit.side]!=='ai')throw new Error('A unidade é controlada pelo Narrador.');
 return unit;
}
const enemyAble=(state:BattleState,side:BattleStack['side'])=>
 state.stacks.filter(s=>s.side!==side&&s.currentHp>0&&s.moraleState!=='routed');
/** IA PTE-2.0 determinística: finaliza ameaças, protege arqueiros e disputa objetivos.
 * Nenhum RNG, pesos privados, acesso à Casa ou ação fora de getLegalActions.
 */
export function chooseAiCommand(state:BattleState):BattleCommand {
 const unit=active(state);
 const legal=getLegalActions(state);
 const goal=state.objective?.kind==='capture'?state.objective.position:null;
 const attacks=legal.filter((c):c is Attack=>c.type==='ATTACK').map(command=>{
  const target=state.stacks.find(s=>s.id===command.targetId)!;
  const melee=gridDistance(state.map,unit.position,target.position)===1;
  const result=resolveDamage(state.map,unit,target,!melee);
  const defeats=result.defender.currentHp===0||result.defender.moraleState==='routed';
  const objectiveThreat=Boolean(goal&&hexKey(goal)===hexKey(target.position));
  return {command,target,result,defeats,objectiveThreat};
 });
 if(attacks.length){
  attacks.sort((a,b)=>
   Number(b.defeats)-Number(a.defeats)||
   Number(b.objectiveThreat)-Number(a.objectiveThreat)||
   b.result.casualties-a.result.casualties||
   b.result.damage-a.result.damage||
   b.target.rangeHex-a.target.rangeHex||
   a.target.currentHp-b.target.currentHp||
   a.target.id.localeCompare(b.target.id,'en'));
  return attacks[0]!.command;
 }
 const choices=legal.filter((c):c is Move=>c.type==='MOVE');
 const enemies=enemyAble(state,unit.side);
 // Em objetivos de sobrevivência, o defensor pode guardar posição e economizar baixas.
 if(state.objective?.kind==='survive'&&unit.side==='defender')
  return legal.find(c=>c.type==='DEFEND')??
   legal.find(c=>c.type==='END_ACTIVATION')!;
 if(choices.length&&enemies.length){
  const occupied=state.stacks.filter(s=>s.id!==unit.id&&s.currentHp>0&&s.moraleState!=='routed')
   .map(s=>s.position);
  const paths=reachablePaths(state.map,unit.position,unit.movementHex,{
   occupied,enemies:enemies.map(s=>s.position)});
  const costs=new Map(paths.map(p=>[hexKey(p.to),p.cost]));
  const nearest=(pos:Hex)=>Math.min(...enemies.map(e=>gridDistance(state.map,pos,e.position)));
  const oldEnemyDistance=nearest(unit.position);
  const goalDistance=goal?gridDistance(state.map,unit.position,goal):Infinity;
  // Arqueiros buscam posição com linha de visão e sem inimigo adjacente.
  const ranked=choices.map(command=>{
   const distance=nearest(command.to);
   const inRange=unit.rangeHex>1&&enemies.some(enemy=>{
    const d=gridDistance(state.map,command.to,enemy.position);
    return d>=2&&d<=unit.rangeHex&&lineOfSight(state.map,command.to,enemy.position).clear;
   });
   return {command,distance,
    goalDistance:goal?gridDistance(state.map,command.to,goal):Infinity,
    threatened:enemies.filter(e=>gridDistance(state.map,command.to,e.position)===1).length,
    inRange,
    cost:costs.get(hexKey(command.to))??Infinity};
  });
  const byPosition=(a:typeof ranked[number],b:typeof ranked[number])=>
   a.cost-b.cost||a.command.to.q-b.command.to.q||a.command.to.r-b.command.to.r;
  if(goal&&goalDistance>0){
   const toward=ranked.filter(x=>x.goalDistance<goalDistance);
   toward.sort((a,b)=>a.goalDistance-b.goalDistance||
    a.threatened-b.threatened||byPosition(a,b));
   if(toward.length)return toward[0]!.command;
  }
  if(unit.rangeHex>1){
   const shooting=ranked.filter(x=>x.inRange&&x.threatened===0);
   shooting.sort((a,b)=>a.distance-b.distance||byPosition(a,b));
   if(shooting.length)return shooting[0]!.command;
  }
  const closer=ranked.filter(x=>x.distance<oldEnemyDistance);
  closer.sort((a,b)=>a.distance-b.distance||a.threatened-b.threatened||byPosition(a,b));
  if(closer.length)return closer[0]!.command;
 }
 return legal.find(c=>c.type==='DEFEND')??
  legal.find(c=>c.type==='END_ACTIVATION') ??
  (()=>{throw new Error('A IA não encontrou comando terminal legal.');})();
}
export type AiStepResult=Readonly<{state:BattleState;commands:readonly BattleCommand[]}>;
/** No máximo MOVE, ATTACK e END por ativação, sem WAIT. */
export function runAiActivation(start:BattleState):AiStepResult {
 let state=start;
 const unit=active(start),commands:BattleCommand[]=[];
 for(let attempt=0;attempt<3;attempt++){
  if(state.phase!=='active'||state.activeUnitId!==unit.id)return {state,commands};
  let command=chooseAiCommand(state);
  if(commands.length===2&&command.type!=='END_ACTIVATION')
   command={type:'END_ACTIVATION',unitId:unit.id};
  if(command.type==='WAIT'||command.type==='MANUAL_FINISH')
   throw new Error('Política da IA violada.');
  state=applyBattleCommand(state,command,'ai');
  commands.push(command);
 }
 if(state.phase==='active'&&state.activeUnitId===unit.id)
  throw new Error('Limite de comandos IA por ativação excedido.');
 return {state,commands};
}
export function runAiUntilHuman(start:BattleState,maxCommands=900):AiStepResult{
 if(!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>1200)
  throw new Error('Guarda de comandos inválida.');
 let state=start;const commands:BattleCommand[]=[];
 for(let i=0;i<maxCommands;i++){
  if(state.phase!=='active'||!state.activeUnitId)return {state,commands};
  const stack=state.stacks.find(s=>s.id===state.activeUnitId);
  if(!stack)throw new Error('Ativação órfã.');
  if(state.controls[stack.side]==='human')return {state,commands};
  const step=runAiActivation(state);
  if(step.commands.length===0)throw new Error('IA sem progresso.');
  commands.push(...step.commands);state=step.state;
  if(commands.length>maxCommands)throw new Error('Limite global de comandos da IA excedido.');
 }
 throw new Error('Limite global de ativações da IA excedido.');
}
