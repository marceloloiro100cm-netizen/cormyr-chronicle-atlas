import {z} from 'zod';
import {battleCommandSchema} from '../domain/turns';
import {battleHash,canonicalJson} from '../domain/replay';
import {createV3Game,v3PlayCommand,v3UseCommander,v3UseUnitSkill,
 type V3Game,type V3ScenarioOptions} from './engine';
import type {Side} from '../domain/types';

export const V34_RULES_VERSION='CCA-V34-SYNC-1' as const;
const ordinary=battleCommandSchema.refine(c=>c.type!=='MANUAL_FINISH',
 {message:'Encerramento manual não é permitido em partidas compartilhadas.'});
export const v34ActionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('order'),command:ordinary}).strict(),
 z.object({kind:z.literal('skill'),skill:z.enum(['CHARGE','VOLLEY','SHIELD_WALL','AMBUSH','SAPPERS']),
  targetId:z.string().min(1).max(80).optional()}).strict(),
 z.object({kind:z.literal('power'),targetId:z.string().min(1).max(80)}).strict(),
]);
export type V34Action=z.infer<typeof v34ActionSchema>;
export type V34Receipt=Readonly<{
 seq:number;side:Side;actorId:string;commandId:string;action:V34Action;
 prevHash:string;stateHash:string;
}>;
export type V34SessionSnapshot=Readonly<{
 id:string;title:string;invitationId:string;
 attackerHouseId:string;defenderHouseId:string;
 attackerUserId:string|null;defenderUserId:string|null;
 status:'waiting'|'active'|'completed'|'closed';
 version:number;hash:string;game:V3Game;
}>;
export const V34_MAX_COMMANDS=600;
export function v34NewGame(config:V3ScenarioOptions):V3Game{
 // Partida remota usa modelos fixos e SEM progressões ou elencos provenientes do browser.
 return createV3Game({...config,opponent:'human'});
}
export function v34Act(game:V3Game,side:Side,untrusted:unknown):V3Game{
 const action=v34ActionSchema.parse(untrusted);
 const active=game.battle.stacks.find(s=>s.id===game.battle.activeUnitId);
 if(game.mode!=='PTE-3.0-SANDBOX'||game.battle.phase!=='active'||!active)
  throw new Error('A sessão não está em turno ativo.');
 if(active.side!==side)throw new Error('Não é a vez do seu exército.');
 if(game.battle.controls[side]!=='human')throw new Error('O lado não está sob controle humano.');
 if(action.kind==='order')return v3PlayCommand(game,action.command,'narrator');
 if(action.kind==='skill')return v3UseUnitSkill(game,action.skill,action.targetId);
 return v3UseCommander(game,action.targetId);
}
export function v34Replay(initial:V3Game,receipts:readonly V34Receipt[],
 finalHash?:string):V3Game{
 if(initial.mode!=='PTE-3.0-SANDBOX')throw new Error('Versão inicial inválida.');
 if(receipts.length>V34_MAX_COMMANDS)throw new Error('Histórico remoto excede o limite de segurança.');
 let state=initial,last=battleHash(initial);
 for(const [index,step] of receipts.entries()){
  if(step.seq!==index+1||step.prevHash!==last||
   !/^[0-9a-f]{64}$/.test(step.stateHash)||
   !/^[0-9a-f]{64}$/.test(step.prevHash))
   throw new Error('Integridade SHA-256 da sequência não confirmada.');
  state=v34Act(state,step.side,step.action);
  if(battleHash(state)!==step.stateHash)
   throw new Error('Replay diverge do estado de batalha armazenado.');
  last=step.stateHash;
 }
 if(finalHash!==undefined&&finalHash!==last)
  throw new Error('Hash final do replay não confere.');
 return state;
}
export function v34Equivalent(a:unknown,b:unknown):boolean{
 return canonicalJson(a)===canonicalJson(b);
}
export function v34WinningSide(game:V3Game):Side|null{
 if(game.battle.phase!=='completed')throw new Error('Batalha não concluída.');
 return game.battle.winner;
}
