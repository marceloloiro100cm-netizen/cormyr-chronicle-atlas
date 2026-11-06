/** Leitura para a futura interface CRZ; o redutor segue autoridade de comandos.
 * Conciliação funcional do seletor do PR #281 com o motor canônico do PR #282.
 */
import {crzLegalCommands,type CrzCommand} from './turns';
import type {CrzBattleState} from './battle-state';
import type {CrzHex} from './geometry';
import type {CrzSpellId} from './setup';

export type CrzActionChoices=Readonly<{
 actorId:string|null;
 moves:readonly CrzHex[];
 attacks:readonly Readonly<{targetId:string;mode:'melee'|'ranged'}>[];
 canWait:boolean;canDefend:boolean;canEnd:boolean;
 abilities:readonly ('CHARGE'|'VOLLEY'|'NIMBLE_ESCAPE')[];
 leaderSpells:readonly CrzSpellId[];
}>;
const empty:CrzActionChoices={
 actorId:null,moves:[],attacks:[],canWait:false,canDefend:false,
 canEnd:false,abilities:[],leaderSpells:[],
};
/** Não inventa opções; reflete exatamente os comandos legais do turno. */
export function crzLegalActions(state:CrzBattleState):CrzActionChoices{
 if(state.phase!=='active'||!state.activeStackId)return empty;
 const legal=crzLegalCommands(state);
 const ofType=<T extends CrzCommand['type']>(type:T)=>
  legal.filter((command):command is Extract<CrzCommand,{type:T}>=>
   command.type===type);
 return {
  actorId:state.activeStackId,
  moves:ofType('MOVE').map(c=>c.to),
  attacks:ofType('ATTACK').map(c=>({targetId:c.targetId,mode:c.mode})),
  canWait:ofType('WAIT').length>0,
  canDefend:ofType('DEFEND').length>0,
  canEnd:ofType('END_ACTIVATION').length>0,
  abilities:ofType('ABILITY').map(c=>c.ability),
  // A escolha de alvo/custo final é validada somente por crzPlay/crzCast.
  leaderSpells:ofType('CAST').map(c=>c.spellId),
 };
}
