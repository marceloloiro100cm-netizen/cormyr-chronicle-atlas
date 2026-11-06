/** CRZ-1.0 · Lote 5: trilha de comandos determinística e verificável.
 * NÃO é assinatura digital, autenticação, homologação de baixas ou replay PTE.
 * Um verificador reexecuta todos os comandos desde o setup/seed iniciais.
 */
import {crzHash} from './ruleset';
import {crzStart,crzPlay,type CrzActor,type CrzCommand} from './turns';
import type {CrzReady} from './setup';
import type {CrzBattleState,CrzEvent} from './battle-state';
import type {CrzRngState} from './rng';

export const CRZ_REPLAY_VERSION=1 as const;
export const CRZ_REPLAY_MAX_COMMANDS=2000;
export const CRZ_REPLAY_MAX_BYTES=8_000_000;

export type CrzReplayStep=Readonly<{
 seq:number;prevHash:string;actor:CrzActor;command:CrzCommand;
 beforeHash:string;afterHash:string;
 rngBefore:CrzRngState;rngAfter:CrzRngState;
 events:readonly CrzEvent[];hash:string;
}>;
export type CrzReplay=Readonly<{
 replayVersion:typeof CRZ_REPLAY_VERSION;
 rulesVersion:'CRZ-1.0';battleId:string;rulesetHash:string;
 initial:CrzReady;genesisStateHash:string;genesisHash:string;
 steps:readonly CrzReplayStep[];headHash:string;
}>;
export type CrzReplaySession=Readonly<{
 replay:CrzReplay;state:CrzBattleState;
}>;
export type CrzReplayVerification=
 |Readonly<{ok:true;state:CrzBattleState;commands:number;headHash:string}>
 |Readonly<{ok:false;atStep:number|null;error:string}>;

function jsonCopy<T>(value:T):T{
 const data=JSON.stringify(value);
 if(typeof data!=='string'||data.length>CRZ_REPLAY_MAX_BYTES)
  throw new Error('REPLAY: conteúdo não serializável ou grande demais.');
 return JSON.parse(data) as T;
}
/** Hash sobre bytes JSON em ordem estável gerada pelo próprio redutor.
 * Aceita ND fracionário de fichas, diferentemente do hash de preset inteiro.
 */
function digest(value:unknown):string{
 const json=JSON.stringify(value);
 if(typeof json!=='string')throw new Error('REPLAY: valor não serializável.');
 return crzHash(json);
}
function genesis(initial:CrzReady,stateHash:string):string{
 return digest({replayVersion:CRZ_REPLAY_VERSION,initial,stateHash});
}
function stepDigest(step:Omit<CrzReplayStep,'hash'>):string{
 return digest(step);
}
function expectedStateHash(replay:CrzReplay):string{
 return replay.steps.at(-1)?.afterHash??replay.genesisStateHash;
}
function validateSession(session:CrzReplaySession):void{
 const {replay,state}=session;
 if(replay.replayVersion!==CRZ_REPLAY_VERSION||
    replay.rulesVersion!=='CRZ-1.0'||replay.rulesetHash!==state.rulesetHash||
    replay.battleId!==state.id)throw new Error('REPLAY: sessão incompatível.');
 if(replay.genesisHash!==genesis(replay.initial,replay.genesisStateHash))
  throw new Error('REPLAY: setup alterado após o início.');
 if(replay.headHash!==(replay.steps.at(-1)?.hash??replay.genesisHash))
  throw new Error('REPLAY: cabeça do encadeamento inválida.');
 if(digest(state)!==expectedStateHash(replay))
  throw new Error('REPLAY: estado local divergente do último comando.');
}
/** Grava um setup preparado e começa a partida a partir da seed explícita. */
export function crzReplayBegin(input:CrzReady):CrzReplaySession{
 const initial=jsonCopy(input),state=crzStart(initial);
 const genesisStateHash=digest(state);
 const genesisHash=genesis(initial,genesisStateHash);
 const replay:CrzReplay={
  replayVersion:CRZ_REPLAY_VERSION,rulesVersion:'CRZ-1.0',
  battleId:initial.id,rulesetHash:initial.rulesetHash,initial,
  genesisStateHash,genesisHash,steps:[],headHash:genesisHash,
 };
 return {replay,state};
}
/** Cada comando registra o estado e RNG antes/depois e TODOS os eventos novos.
 * O redutor permanece a autoridade da legalidade de ações.
 */
export function crzReplayRecord(session:CrzReplaySession,
 command:CrzCommand,actor:CrzActor='human'):CrzReplaySession{
 validateSession(session);
 if(session.replay.steps.length>=CRZ_REPLAY_MAX_COMMANDS)
  throw new Error('REPLAY: limite de comandos atingido.');
 const before=session.state,copy=jsonCopy(command);
 const after=crzPlay(before,copy,actor);
 const payload:Omit<CrzReplayStep,'hash'>={
  seq:session.replay.steps.length+1,
  prevHash:session.replay.headHash,
  actor,command:copy,beforeHash:digest(before),afterHash:digest(after),
  rngBefore:jsonCopy(before.rngState),rngAfter:jsonCopy(after.rngState),
  events:jsonCopy(after.events.slice(before.events.length)),
 };
 const step={...payload,hash:stepDigest(payload)};
 const replay:CrzReplay={...session.replay,
  steps:[...session.replay.steps,step],headHash:step.hash};
 return {replay,state:after};
}
function isObject(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function isStep(value:unknown):value is CrzReplayStep{
 return isObject(value)&&Number.isSafeInteger(value['seq'])&&
  typeof value['prevHash']==='string'&&typeof value['hash']==='string'&&
  typeof value['beforeHash']==='string'&&typeof value['afterHash']==='string'&&
  (value['actor']==='human'||value['actor']==='ai')&&
  isObject(value['command'])&&Array.isArray(value['events'])&&
  isObject(value['rngBefore'])&&isObject(value['rngAfter']);
}
/** Verifica um replay não confiável reexecutando cada passo.
 * A cadeia prova consistência interna, NÃO a identidade do autor.
 */
export function crzVerifyReplay(raw:unknown):CrzReplayVerification{
 let atStep:number|null=null;
 try{
  const byteLength=JSON.stringify(raw)?.length??Infinity;
  if(byteLength>CRZ_REPLAY_MAX_BYTES||!isObject(raw))
   throw new Error('REPLAY: arquivo inválido ou grande demais.');
  if(raw['replayVersion']!==CRZ_REPLAY_VERSION||
     raw['rulesVersion']!=='CRZ-1.0'||!isObject(raw['initial'])||
     !Array.isArray(raw['steps'])||raw['steps'].length>CRZ_REPLAY_MAX_COMMANDS)
   throw new Error('REPLAY: versão, setup ou número de comandos inválido.');
  const input=raw as unknown as CrzReplay;
  let current=crzReplayBegin(input.initial);
  if(input.battleId!==current.replay.battleId||
     input.rulesetHash!==current.replay.rulesetHash||
     input.genesisStateHash!==current.replay.genesisStateHash||
     input.genesisHash!==current.replay.genesisHash)
   throw new Error('REPLAY: hash inicial ou identidade da batalha divergente.');
  for(const candidate of input.steps){
   atStep=current.replay.steps.length+1;
   if(!isStep(candidate)||candidate.seq!==atStep)
    throw new Error('REPLAY: sequência inválida.');
   const next=crzReplayRecord(current,candidate.command,candidate.actor);
   const expected=next.replay.steps.at(-1)!;
   // Inclui comando, ator, eventos, RNG, estado completo e cadeia anterior.
   if(digest(candidate)!==digest(expected))
    throw new Error('REPLAY: comando, evento, RNG ou hash adulterado.');
   current=next;
  }
  if(input.headHash!==current.replay.headHash)
   throw new Error('REPLAY: hash final divergente.');
  return {ok:true,state:current.state,
   commands:current.replay.steps.length,headHash:current.replay.headHash};
 }catch(error){
  return {ok:false,atStep,
   error:error instanceof Error?error.message:'REPLAY: erro desconhecido.'};
 }
}
/** Recuperação sem efeito no banco, permitida somente após reexecução integral. */
export function crzReplayResume(raw:unknown):CrzReplaySession{
 const checked=crzVerifyReplay(raw);
 if(!checked.ok)throw new Error(checked.error);
 const replay=jsonCopy(raw as CrzReplay);
 return {replay,state:checked.state};
}
/** Exportação JSON local; nenhuma API de rede ou campanha é chamada. */
export function crzReplaySerialize(raw:CrzReplay):string{
 const checked=crzVerifyReplay(raw);
 if(!checked.ok)throw new Error(checked.error);
 return JSON.stringify(raw);
}
export function crzReplayParse(json:string):CrzReplaySession{
 if(typeof json!=='string'||json.length>CRZ_REPLAY_MAX_BYTES)
  throw new Error('REPLAY: JSON inválido ou muito grande.');
 return crzReplayResume(JSON.parse(json) as unknown);
}
