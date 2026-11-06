import type {BattleMap,BattleStack,Hex,Side,BattleCommand} from '../domain/types';
import {axialToOffset,hexDistance,hexKey} from '../geometry/hex';
import {getLegalActions} from '../domain/turns';
import {chooseAiCommand} from '../domain/ai';
import {v3PlayCommand,type V3Game} from './engine';
import {commander} from './commanders';
import {v37Abilities,v37CanCast,v37CanSignature,v37Cast,v37CastSignature} from './tactics-v37';

/** Proposta de extensão v1.1 do §12 de 03-regras-cormyr-cruzada-passo-a-passo.md.
 * Não integra o ruleset CRZ-1.0 normativo, nem altera o motor PTE-2.0 persistido.
 */
export const V39_OBJECTIVE_VERSION='CCA-V39-OBJECTIVES-1' as const;
export const V39_HOLD_ROUNDS=2;
export type V39ObjectiveId='bridge'|'highground'|'supplies';
export type V39ObjectivePoint=Readonly<{
 id:V39ObjectiveId;label:string;position:Hex;holder:Side|null;
}>;
export type V39Objectives=Readonly<{
 rulesVersion:typeof V39_OBJECTIVE_VERSION;
 variant:'hold-majority';holdRounds:typeof V39_HOLD_ROUNDS;
 points:readonly V39ObjectivePoint[];
 streaks:Readonly<Record<Side,number>>;
 lastScoredRound:number;
 winner:Side|null;
}>;
const SIDES=['attacker','defender'] as const;
const defs:readonly {id:V39ObjectiveId;label:string;colOffset:number;rowOffset:number;terrain:'plain'|'hill'}[]=[
 {id:'bridge',label:'Passagem estratégica',colOffset:0,rowOffset:0,terrain:'plain'},
 {id:'highground',label:'Colina de vigia',colOffset:1,rowOffset:-2,terrain:'hill'},
 {id:'supplies',label:'Depósito de campanha',colOffset:-1,rowOffset:2,terrain:'plain'},
];
function candidates(map:BattleMap){
 const deployment=new Set([...map.deployment.attacker,...map.deployment.defender].map(hexKey));
 return map.tiles.filter(tile=>tile.terrain!=='rock'&&!deployment.has(hexKey(tile)));
}
export function v39BuildPoints(map:BattleMap):readonly V39ObjectivePoint[]{
 const available=candidates(map),taken=new Set<string>();
 if(available.length<3)throw new Error('O mapa não comporta três objetivos independentes.');
 return defs.map(def=>{
  const desiredCol=Math.floor(map.width/2)+def.colOffset;
  const desiredRow=Math.floor(map.height/2)+def.rowOffset;
  const sorted=available.filter(tile=>!taken.has(hexKey(tile))).sort((a,b)=>{
   const ac=axialToOffset(a),bc=axialToOffset(b);
   const score=(tile:typeof a,col:number,row:number)=>
    Math.abs(col-desiredCol)+Math.abs(row-desiredRow)+
     (tile.terrain===def.terrain?0:5);
   return score(a,ac.column,ac.row)-score(b,bc.column,bc.row)||
    a.r-b.r||a.q-b.q;
  });
  const tile=sorted[0];
  if(!tile)throw new Error('Não foi possível posicionar todos os objetivos.');
  taken.add(hexKey(tile));
  return {id:def.id,label:def.label,position:{q:tile.q,r:tile.r},holder:null};
 });
}
function occupant(stacks:readonly BattleStack[],hex:Hex):Side|null{
 const found=stacks.find(stack=>stack.currentHp>0&&stack.moraleState!=='routed'&&
  hexKey(stack.position)===hexKey(hex));
 return found?.side??null;
}
function refresh(points:readonly V39ObjectivePoint[],stacks:readonly BattleStack[]){
 return points.map(p=>({...p,holder:occupant(stacks,p.position)}));
}
export function v39Enable(game:V3Game):V3Game{
 if(game.mode!=='PTE-3.0-SANDBOX'||game.objectives||
   game.battle.phase!=='active'||game.battle.round!==1||
   game.battle.events.length!==0)
  throw new Error('Objetivos só podem iniciar com uma batalha de treinamento nova.');
 if(game.battle.stacks.some(s=>s.source.kind!=='fictional'))
  throw new Error('Objetivos não podem ser ativados sobre unidades oficiais.');
 const points=refresh(v39BuildPoints(game.battle.map),game.battle.stacks);
 const objectives:V39Objectives={
  rulesVersion:V39_OBJECTIVE_VERSION,variant:'hold-majority',
  holdRounds:V39_HOLD_ROUNDS,points,
  streaks:{attacker:0,defender:0},lastScoredRound:0,winner:null,
 };
 return {...game,objectives,log:[
  ...game.log,{round:1,side:'attacker',
   label:'Objetivos de treino ativados: dominar dois dos três marcos por duas rodadas.'},
 ]};
}
/** Só pontua no encerramento de rodada, com uma transição por vez.
 * O redutor da arena sempre invoca esta função depois de cada comando.
 */
export function v39AfterAction(before:V3Game,after:V3Game):V3Game{
 const current=before.objectives;
 if(!current)return after;
 if(after.objectives&&after.objectives!==current)
  throw new Error('Estado de objetivos não pode ser enviado por um comando.');
 if(current.rulesVersion!==V39_OBJECTIVE_VERSION)
  throw new Error('Versão de objetivos desconhecida.');
 const points=refresh(current.points,after.battle.stacks);
 const rounds=after.battle.round-before.battle.round;
 if(rounds<0||rounds>1)throw new Error('Atualização pulou uma rodada; use comandos individuais.');
 if(before.battle.phase!=='active')
  throw new Error('Não é possível pontuar uma batalha encerrada.');
 if(after.battle.phase!=='active')
  return {...after,objectives:{...current,points}};
 if(rounds===0)return {...after,objectives:{...current,points}};
 const finishedRound=before.battle.round;
 if(finishedRound<=current.lastScoredRound)
  throw new Error('Rodada de objetivo já contabilizada.');
 const count=(side:Side)=>points.filter(point=>point.holder===side).length;
 const streaks:{attacker:number;defender:number}={
  attacker:count('attacker')>=2?current.streaks.attacker+1:0,
  defender:count('defender')>=2?current.streaks.defender+1:0,
 };
 const winner:Side|null=streaks.attacker>=V39_HOLD_ROUNDS?'attacker':
  streaks.defender>=V39_HOLD_ROUNDS?'defender':null;
 const objectives:V39Objectives={
  ...current,points,streaks,lastScoredRound:finishedRound,winner,
 };
 const log=[...after.log,{round:finishedRound,side:winner??'attacker',
  label:'Marcos dominados — aliados '+count('attacker')+'/3 · adversários '+
   count('defender')+'/3 · sequência '+streaks.attacker+'/'+streaks.defender,
 }].slice(-100);
 if(!winner)return {...after,objectives,log};
 return {...after,objectives,log:[...log,{round:finishedRound,side:winner,
  label:'Vitória por domínio de objetivos: dois marcos mantidos por duas rodadas.'}].slice(-100),
  battle:{...after.battle,phase:'completed',winner,
   resultReason:'v39-objectives',activeUnitId:null,
   activationQueue:[],waitingQueue:[]}};
}
export function v39PlayCommand(game:V3Game,cmd:BattleCommand,
 actor:'narrator'|'ai'='narrator'):V3Game{
 return v39AfterAction(game,v3PlayCommand(game,cmd,actor));
}
function aiMoveForObjective(game:V3Game):BattleCommand|null{
 const battle=game.battle,active=battle.stacks.find(s=>s.id===battle.activeUnitId);
 if(!active||!game.objectives)return null;
 const legal=getLegalActions(battle),attacks=legal.filter(c=>c.type==='ATTACK');
 if(attacks.length)return null;
 const moves=legal.filter((c):c is Extract<BattleCommand,{type:'MOVE'}>=>c.type==='MOVE');
 if(!moves.length)return null;
 const targets=game.objectives.points
  .filter(point=>point.holder!==active.side);
 if(!targets.length)return null;
 const oldDistance=Math.min(...targets.map(x=>hexDistance(active.position,x.position)));
 const candidates=moves.map(move=>{
  const distance=Math.min(...targets.map(x=>hexDistance(move.to,x.position)));
  return {move,distance};
 }).filter(x=>x.distance<oldDistance).sort((a,b)=>
  a.distance-b.distance||a.move.to.r-b.move.to.r||a.move.to.q-b.move.to.q);
 return candidates[0]?.move??null;
}
/** IA em passos verificáveis, nunca runAiUntilHuman que salta diversas rodadas. */
export function v39RunAi(game:V3Game,maxCommands=900):V3Game{
 if(!game.objectives)throw new Error('O modo de objetivos não está ativo.');
 if(!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>1200)
  throw new Error('Limite de comandos inválido.');
 let next=game;
 for(let count=0;count<maxCommands;count++){
  if(next.battle.phase!=='active'||!next.battle.activeUnitId)return next;
  const active=next.battle.stacks.find(s=>s.id===next.battle.activeUnitId);
  if(!active)throw new Error('Ativação órfã da IA.');
  if(next.battle.controls[active.side]==='human')return next;
  if(next.tactics&&v37CanSignature(next)){
   const leader=commander(next.commanders[active.side]);
   const target=next.battle.stacks.find(s=>s.currentHp>0&&s.moraleState!=='routed'&&
    (leader.powerTarget==='ally'?s.side===active.side:s.side!==active.side));
   if(target){
    try{next=v39AfterAction(next,v37CastSignature(next,target.id));}
    catch{/* outro alvo pode ser necessário; próxima ordem decide */}
   }
  }
  if(next.battle.phase!=='active')return next;
  const actor=next.battle.stacks.find(s=>s.id===next.battle.activeUnitId);
  if(!actor)throw new Error('Ativação órfã após habilidade.');
  if(next.tactics&&next.tactics[actor.side].actedRound!==next.battle.round){
   for(const ability of v37Abilities(next.commanders[actor.side])){
    if(!v37CanCast(next,ability.id))continue;
    const target=next.battle.stacks.find(s=>s.currentHp>0&&s.moraleState!=='routed'&&
     (ability.target==='ally'?s.side===actor.side:s.side!==actor.side));
    if(target){
     next=v39AfterAction(next,v37Cast(next,ability.id,target.id));
     break;
    }
   }
  }
  if(next.battle.phase!=='active')return next;
  const cmd=aiMoveForObjective(next)??chooseAiCommand(next.battle);
  next=v39PlayCommand(next,cmd,'ai');
 }
 throw new Error('Limite de comandos da IA de objetivos excedido.');
}
