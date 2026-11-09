import type {CrzEvent} from '@/lib/crusade/battle-state';

/** Apenas um convite ao Narrador: jamais muda vitória, rodada ou hash do replay.
 * Requer 3 rodadas concluídas e ausência de dano/alteração de efetivo nelas.
 * Movimentos e ações sem acerto não removem o aviso de possível impasse.
 */
export function suggestDndImpassReview(events:readonly CrzEvent[]):boolean{
 const completed=[...new Set(events.filter(e=>e.type==='ROUND_ENDED')
  .map(e=>e.round))].slice(-3);
 if(completed.length<3)return false;
 const first=completed[0]!,last=completed[2]!;
 return !events.some(e=>e.round>=first&&e.round<=last&&(
  ((e.type==='ATTACK_RESOLVED'||e.type==='RETALIATION_RESOLVED')&&e.appliedDamage>0)||
  (e.type==='SPELL_DAMAGE'&&e.amount>0)||
  e.type==='STACK_DESTROYED'||e.type==='DND_COUNT_CHANGED'||
  e.type==='DND_STACK_WITHDRAWN'||e.type==='DND_STACK_ADDED'||
  e.type==='BATTLE_ENDED'
 ));
}
