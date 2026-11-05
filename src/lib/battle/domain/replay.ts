import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {z} from 'zod';
import type {BattleState,BattleCommand} from './types';
import {battleCommandSchema,applyBattleCommand,startBattle} from './turns';
import {battleDraftSchema} from './setup';

export const REPLAY_FORMAT='CCA-BATTLE-REPLAY-1' as const;
const HASH=/^[a-f0-9]{64}$/;
function canonical(value:unknown):string{
 if(value===null)return 'null';
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value))throw new Error('Replay exige números inteiros e seguros.');
  return JSON.stringify(value);
 }
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(typeof value==='object'){
  const entries=Object.entries(value as Record<string,unknown>)
   .filter(([,v])=>v!==undefined)
   .sort(([a],[b])=>a<b?-1:a>b?1:0);
  return '{'+entries.map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 }
 throw new Error('Valor não serializável na batalha.');
}
export function canonicalJson(value:unknown):string{return canonical(value);}
export function battleHash(value:unknown):string{
 return bytesToHex(sha256(utf8ToBytes(canonical(value))));
}
export type ReplayReceipt=Readonly<{
 actionSeq:number;commandId:string;command:BattleCommand;
 actor:'narrator'|'ai';prevHash:string;stateHash:string;
}>;
export type ReplayFile=Readonly<{
 format:typeof REPLAY_FORMAT;rulesVersion:'PTE-2.0';schemaVersion:2;
 initial:BattleState;initialStateHash:string;commands:readonly ReplayReceipt[];
 finalStateHash:string;
}>;
const receiptSchema=z.object({
 actionSeq:z.number().int().min(1).max(1200),commandId:z.string().regex(/^cmd-[0-9]{1,4}$/),
 command:battleCommandSchema,actor:z.enum(['narrator','ai']),
 prevHash:z.string().regex(HASH),stateHash:z.string().regex(HASH),
}).strict();
const replaySchema=z.object({
 format:z.literal(REPLAY_FORMAT),rulesVersion:z.literal('PTE-2.0'),schemaVersion:z.literal(2),
 initial:z.custom<BattleState>(v=>v!==null&&typeof v==='object'),
 initialStateHash:z.string().regex(HASH),commands:z.array(receiptSchema).max(1200),
 finalStateHash:z.string().regex(HASH),
}).strict();
function assertReady(initial:BattleState):BattleState{
 if(initial.phase!=='ready'||initial.round!==0||initial.events.length!==0||
    initial.activeUnitId!==null||initial.activationQueue.length>0||
    initial.waitingQueue.length>0||initial.winner!==null)
   throw new Error('Replay exige snapshot inicial limpo e pronto.');
 const draft=battleDraftSchema.parse({
  id:initial.id,name:initial.name,schemaVersion:initial.schemaVersion,
  rulesVersion:initial.rulesVersion,seed:initial.seed,map:initial.map,
  controls:initial.controls,stacks:initial.stacks,
 });
 if(initial.rngAlgorithm!=='none-PTE-2.0'||initial.noProgressRounds!==0)
  throw new Error('Origem de replay inconsistente.');
 return startBattle(initial);
}
export function commandsFromState(state:BattleState):BattleCommand[]{
 return state.events.filter(e=>e.type!=='RETALIATION').map(e=>e.command);
}
export function captureReplay(initial:BattleState,commands:readonly BattleCommand[]):ReplayFile{
 let state=assertReady(initial);
 if(commands.length>1200)throw new Error('Histórico de comandos excede 1200.');
 const receipts:ReplayReceipt[]=[];let last=battleHash(state);
 const initialStateHash=last;
 for(const [i,raw] of commands.entries()){
  const command=battleCommandSchema.parse(raw) as BattleCommand;
  const unit=state.stacks.find(s=>s.id===state.activeUnitId);
  const actor:'narrator'|'ai'=command.type==='MANUAL_FINISH'?'narrator':
    unit&&state.controls[unit.side]==='ai'?'ai':'narrator';
  state=applyBattleCommand(state,command,actor);
  const stateHash=battleHash(state);
  receipts.push({actionSeq:i+1,commandId:'cmd-'+(i+1),
   command,actor,prevHash:last,stateHash});last=stateHash;
 }
 return {format:REPLAY_FORMAT,rulesVersion:'PTE-2.0',
  schemaVersion:2,initial,initialStateHash,commands:receipts,finalStateHash:last};
}
export function verifyReplay(input:unknown):{state:BattleState;states:BattleState[];file:ReplayFile}{
 const parsed=replaySchema.parse(input);
 const initial=parsed.initial;
 let state=assertReady(initial);
 const hash=battleHash(state);
 if(parsed.initialStateHash!==hash)throw new Error('Integridade não confirmada: snapshot inicial adulterado.');
 let previous=hash;const states=[state];
 for(const [i,receipt] of parsed.commands.entries()){
  if(receipt.actionSeq!==i+1||receipt.commandId!=='cmd-'+(i+1)||
    receipt.prevHash!==previous)throw new Error('Integridade não confirmada: encadeamento inválido.');
  try{state=applyBattleCommand(state,receipt.command,receipt.actor);}
  catch{throw new Error('Integridade não confirmada: comando ilegal no replay.');}
  const current=battleHash(state);
  if(current!==receipt.stateHash)throw new Error('Integridade não confirmada: estado divergente.');
  previous=current;states.push(state);
 }
 if(previous!==parsed.finalStateHash)throw new Error('Integridade não confirmada: hash final inválido.');
 return {state,states,file:parsed as ReplayFile};
}
export function parseReplayJson(json:string):ReturnType<typeof verifyReplay>{
 if(json.length>1_500_000)throw new Error('Replay acima de 1,5 MB.');
 let obj:unknown;
 try{obj=JSON.parse(json) as unknown;}catch{throw new Error('JSON de replay inválido.');}
 return verifyReplay(obj);
}
export function exportReplayJson(initial:BattleState,state:BattleState):string{
 const file=captureReplay(initial,commandsFromState(state));
 if(battleHash(state)!==file.finalStateHash)
  throw new Error('Integridade não confirmada: estado não corresponde aos comandos.');
 return JSON.stringify(file,null,2);
}
