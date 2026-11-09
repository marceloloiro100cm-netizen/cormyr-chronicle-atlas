import type {BattleMap,BattleState,Hex,Side,TacticalObjective,TacticalObjectiveProgress} from './types';
import {gridDistance} from '../geometry/grid';
import {hexKey} from '../geometry/hex';

export type TacticalObjectivePreset='elimination'|'capture'|'survive'|'outposts'|'bridge'|'fortress';
export type MultiCaptureMission=Extract<TacticalObjective,{kind:'multi-capture'}>['mission'];

export const MISSION_LABELS:Record<MultiCaptureMission,string>={
 outposts:'Controlar postos avançados',
 bridge:'Tomar a ponte',
 fortress:'Tomar a fortificação',
};

/** Localiza um ponto transitável próximo de uma referência, com desempate estável. */
function nearestFree(map:BattleMap,desired:Hex,chosen:readonly Hex[]):Hex{
 const occupied=new Set(chosen.map(hexKey));
 const candidates=map.tiles.filter(t=>t.terrain!=='rock'&&!occupied.has(hexKey(t)))
  .sort((a,b)=>gridDistance(map,a,desired)-gridDistance(map,b,desired)||
   a.q-b.q||a.r-b.r);
 if(!candidates.length)throw new Error('Mapa sem posições suficientes para os objetivos.');
 return {q:candidates[0]!.q,r:candidates[0]!.r};
}
export function defaultMissionPositions(map:BattleMap,mission:MultiCaptureMission):Hex[]{
 const midQ=Math.floor(map.width/2),midR=Math.floor(map.height/2);
 const aims=mission==='bridge'?
  [{q:midQ-1,r:midR},{q:midQ,r:midR},{q:midQ+1,r:midR}]:
  mission==='fortress'?
   [{q:midQ+3,r:midR-2},{q:midQ+3,r:midR},{q:midQ+3,r:midR+2}]:
   [{q:midQ,r:midR-2},{q:midQ,r:midR},{q:midQ,r:midR+2}];
 const chosen:Hex[]=[];
 for(const aim of aims)chosen.push(nearestFree(map,aim,chosen));
 return chosen;
}

/** Objetivos opcionais do Adaptado. Ausência conserva PTE-2.0 e replays legados. */
export function makeTacticalObjective(
 preset:TacticalObjectivePreset,map:BattleMap,
 options?:Readonly<{positions?:readonly Hex[];requiredPositions?:number;holdRounds?:number;deadlineRound?:number}>,
):TacticalObjective|undefined{
 if(preset==='elimination')return undefined;
 if(preset==='survive')return {kind:'survive',defenderRounds:6};
 if(preset==='capture'){
  const center={q:Math.floor(map.width/2),r:Math.floor(map.height/2)};
  return {kind:'capture',position:nearestFree(map,center,[]),holdRounds:2,deadlineRound:8};
 }
 const positions=options?.positions?.length?[...options.positions]:defaultMissionPositions(map,preset);
 const requiredPositions=options?.requiredPositions??2;
 return {kind:'multi-capture',mission:preset,positions,requiredPositions,
  holdRounds:options?.holdRounds??2,deadlineRound:options?.deadlineRound??10};
}

export function attackerControlledPoints(state:BattleState):number{
 const goal=state.objective;
 if(goal?.kind!=='multi-capture')return 0;
 const attacker=new Set(state.stacks.filter(s=>s.side==='attacker'&&s.currentHp>0&&
  s.moraleState!=='routed').map(s=>hexKey(s.position)));
 return goal.positions.filter(pos=>attacker.has(hexKey(pos))).length;
}

/** A captura conta apenas no fim de cada rodada completa, sem sorteios ou escrita oficial. */
export function evaluateTacticalObjective(state:BattleState):{
 progress:TacticalObjectiveProgress;winner:Side|null;reason:string|null;
}{
 const goal=state.objective;
 const prior=state.objectiveProgress??{holder:null,consecutiveRounds:0};
 if(!goal)return {progress:prior,winner:null,reason:null};
 if(goal.kind==='survive'){
  return {progress:prior,winner:state.round>=goal.defenderRounds?'defender':null,
   reason:state.round>=goal.defenderRounds?'objective-survive':null};
 }
 if(goal.kind==='multi-capture'){
  const count=attackerControlledPoints(state);
  const held=count>=goal.requiredPositions;
  const streak=held?(prior.holder==='attacker'?prior.consecutiveRounds+1:1):0;
  const progress:{holder:Side|null;consecutiveRounds:number}={
   holder:held?'attacker':null,consecutiveRounds:streak};
  if(streak>=goal.holdRounds)
   return {progress,winner:'attacker',reason:'objective-multi-capture'};
  if(state.round>=goal.deadlineRound)
   return {progress,winner:'defender',reason:'objective-multi-defense'};
  return {progress,winner:null,reason:null};
 }
 const occupant=state.stacks.find(s=>s.currentHp>0&&s.moraleState!=='routed'&&
  hexKey(s.position)===hexKey(goal.position));
 const holder=occupant?.side??null;
 const streak=holder===null?0:holder===prior.holder?prior.consecutiveRounds+1:1;
 const progress={holder,consecutiveRounds:streak};
 if(holder==='attacker'&&streak>=goal.holdRounds)
  return {progress,winner:'attacker',reason:'objective-capture'};
 if(state.round>=goal.deadlineRound)
  return {progress,winner:'defender',reason:'objective-defense'};
 return {progress,winner:null,reason:null};
}

export function tacticalObjectiveDescription(state:BattleState):string{
 const goal=state.objective;
 if(!goal)return 'Derrotar ou dispersar o inimigo.';
 if(goal.kind==='survive')
  return 'Defensor: resistir até o fim da rodada '+goal.defenderRounds+'.';
 const {holder,consecutiveRounds}=state.objectiveProgress??{holder:null,consecutiveRounds:0};
 if(goal.kind==='multi-capture'){
  return MISSION_LABELS[goal.mission]+' · Atacante controla '+attackerControlledPoints(state)+
   '/'+goal.requiredPositions+' posições e mantém por '+goal.holdRounds+
   ' rodadas · sequência '+(holder==='attacker'?consecutiveRounds:0)+'/'+goal.holdRounds+
   '. Defensor resiste até a rodada '+goal.deadlineRound+'.';
 }
 return 'Atacante: dominar ('+goal.position.q+','+goal.position.r+') durante '+
  goal.holdRounds+' rodadas consecutivas · '+(holder==='attacker'?consecutiveRounds:0)+
  '/'+goal.holdRounds+'. Defensor: resistir até a rodada '+goal.deadlineRound+'.';
}
