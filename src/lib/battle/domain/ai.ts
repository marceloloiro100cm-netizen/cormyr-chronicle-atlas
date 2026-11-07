import type { BattleCommand, BattleState, BattleStack, Hex } from './types';
import { applyBattleCommand, getLegalActions } from './turns';
import { resolveDamage } from './combat';
import { hexDistance, hexKey } from '../geometry/hex';
import { reachablePaths } from '../geometry/pathfinding';

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
/** Política estável PTE-2.0. Sem sorteios, dados externos ou heurísticas ocultas. */
export function chooseAiCommand(state:BattleState):BattleCommand {
 const unit=active(state);
 const legal=getLegalActions(state);
 const attacks=legal.filter((c):c is Attack=>c.type==='ATTACK').map(command=>{
  const target=state.stacks.find(s=>s.id===command.targetId)!;
  const melee=hexDistance(unit.position,target.position)===1;
  const result=resolveDamage(state.map,unit,target,!melee);
  const defeats=result.defender.currentHp===0||result.defender.moraleState==='routed';
  return {command,target,result,defeats};
 });
 if(attacks.length){
  const finishing=attacks.filter(x=>x.defeats);
  if(finishing.length){
   finishing.sort((a,b)=>b.result.casualties-a.result.casualties||
     a.target.currentHp-b.target.currentHp||a.target.id.localeCompare(b.target.id,'en'));
   return finishing[0]!.command;
  }
  attacks.sort((a,b)=>b.result.damage-a.result.damage||
    a.target.id.localeCompare(b.target.id,'en'));
  return attacks[0]!.command;
 }
 const enemies=enemyAble(state,unit.side);
 const choices=legal.filter((c):c is Move=>c.type==='MOVE');
 if(choices.length&&enemies.length){
  const occupied=state.stacks.filter(s=>s.id!==unit.id&&s.currentHp>0&&s.moraleState!=='routed').map(s=>s.position);
  const zoc=enemies.map(s=>s.position);
  const paths=reachablePaths(state.map,unit.position,unit.movementHex,{occupied,enemies:zoc});
  const costs=new Map(paths.map(p=>[hexKey(p.to),p.cost]));
  const oldDistance=Math.min(...enemies.map(s=>hexDistance(unit.position,s.position)));
  const ranked=choices.map(command=>({
   command,
   distance:Math.min(...enemies.map(e=>hexDistance(command.to,e.position))),
   cost:costs.get(hexKey(command.to))??Infinity,
  })).filter(item=>item.distance<oldDistance);
  ranked.sort((a,b)=>a.distance-b.distance||a.cost-b.cost||
    a.command.to.q-b.command.to.q||a.command.to.r-b.command.to.r);
  if(ranked.length)return ranked[0]!.command;
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
