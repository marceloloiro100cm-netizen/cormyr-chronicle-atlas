import type {WarBattle} from './types';
import type {WarAftermathPreview} from './aftermath';
import type {WarResourceProposal} from './aftermath-resources';

/** Arquivo local de revisão: somente material para decisão do Narrador.
 * Não representa autorização nem gravação na Casa. Nenhum vínculo Supabase.
 */
export function serializeWarAftermathReview(
 battle:WarBattle,aftermath:WarAftermathPreview,resources:WarResourceProposal,
):string{
 if(battle.phase!=='finished'||battle.id!==aftermath.battleId||
  battle.id!==resources.battleId||aftermath.appliedToHouse!==false||
  resources.appliedToHouse!==false)
  throw new Error('O relatório precisa de batalha encerrada e prévias compatíveis.');
 return JSON.stringify({
  kind:'cormyr-got-campaign-review',version:1,
  battle:{id:battle.id,name:battle.name,rulesVersion:battle.rulesVersion,
   round:battle.round,winner:battle.winner},
  status:'PENDING_NARRATOR_APPROVAL',
  appliedToHouse:false,
  warning:'Arquivo de revisão; não modifica Casas, recursos, usuários ou HUB Temporal.',
  aftermath,
  resources,
  eventLedger:battle.events.map(e=>({
   seq:e.seq,round:e.round,side:e.side,kind:e.kind,text:e.text,
   ...(e.roll?{roll:e.roll}:{}),
   ...(e.difficulty!==undefined?{difficulty:e.difficulty}:{}),
  })),
 },null,2);
}
