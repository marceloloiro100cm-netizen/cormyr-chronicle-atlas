import type {BattleMap,BattleState,Hex,Side,TacticalObjective,TacticalObjectiveProgress} from './types';
import {gridDistance} from '../geometry/grid';
import {hexKey} from '../geometry/hex';

export type TacticalObjectivePreset='elimination'|'capture'|'survive';

/** Objetivos opcionais do Adaptado. O modo padrão conserva exatamente o PTE-2.0. */
export function makeTacticalObjective(preset:TacticalObjectivePreset,map:BattleMap):TacticalObjective|undefined{
 if(preset==='elimination')return undefined;
 if(preset==='survive')return {kind:'survive',defenderRounds:6};
 const center={q:Math.floor(map.width/2),r:Math.floor(map.height/2)};
 const passable=map.tiles.filter(t=>t.terrain!=='rock').sort((a,b)=>
  gridDistance(map,a,center)-gridDistance(map,b,center)||
  a.q-b.q||a.r-b.r);
 if(!passable.length)throw new Error('Não há objetivo acessível neste mapa.');
 const {q,r}=passable[0]!;
 return {kind:'capture',position:{q,r},holdRounds:2,deadlineRound:8};
}

/** Avalia a captura uma vez POR RODADA COMPLETA, sem depender da ordem das ativações.
 * Não existe alteração permanente de Casa, nem aleatoriedade/IA na decisão.
 */
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
 return 'Atacante: dominar ('+goal.position.q+','+goal.position.r+') durante '+
  goal.holdRounds+' rodadas consecutivas · '+(holder==='attacker'?consecutiveRounds:0)+
  '/'+goal.holdRounds+'. Defensor: resistir até a rodada '+goal.deadlineRound+'.';
}
