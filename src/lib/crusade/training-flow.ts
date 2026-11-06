/** Controles puros de treino e visualização de replay. Nunca persistem fora do cliente. */
import {crzChooseAi} from './ai';
import {crzReplayRecord,crzVerifyReplay,
 type CrzReplay,type CrzReplaySession} from './replay';
import type {CrzBattleState} from './battle-state';

/** Cada comando da IA é gravado, inclusive WAIT/DEFEND, para replay íntegro. */
export function crzTrainingAdvanceAi(
 session:CrzReplaySession,maxActions=350,
):CrzReplaySession{
 if(!Number.isSafeInteger(maxActions)||maxActions<1||maxActions>500)
  throw new Error('CRZ: limite de ações da IA inválido.');
 let next=session;
 for(let i=0;i<maxActions;i++){
  if(next.state.phase==='completed')return next;
  const unit=next.state.stacks.find(s=>s.id===next.state.activeStackId);
  if(!unit)throw new Error('CRZ: turno de IA sem unidade.');
  if(next.state.controls[unit.side]==='human')return next;
  next=crzReplayRecord(next,crzChooseAi(next.state),'ai');
 }
 throw new Error('CRZ: limite de decisões da IA alcançado.');
}
/** Revê o estado em uma posição da trilha sem executar ações novas.
 * O conteúdo completo deve passar na verificação antes de qualquer exibição.
 */
export function crzTrainingReplayAt(replay:CrzReplay,index:number):CrzBattleState{
 if(!Number.isSafeInteger(index)||index<0||index>replay.steps.length)
  throw new Error('CRZ: posição de replay fora do intervalo.');
 const full=crzVerifyReplay(replay);
 if(!full.ok)throw new Error(full.error);
 if(index===replay.steps.length)return full.state;
 const prefix=replay.steps.slice(0,index);
 const headHash=prefix.at(-1)?.hash??replay.genesisHash;
 const checked=crzVerifyReplay({...replay,steps:prefix,headHash});
 if(!checked.ok)throw new Error(checked.error);
 return checked.state;
}
