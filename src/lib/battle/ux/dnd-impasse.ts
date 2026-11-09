import type {CrzBattleState} from '@/lib/crusade/battle-state';

/** Aviso apenas visual. O Narrador decide o desfecho via comando auditável. */
export function dndNeedsImpasseReview(
 state:Pick<CrzBattleState,'phase'|'stagnantRounds'>,
 threshold=3,
):boolean{
 return state.phase==='active'&&state.stagnantRounds>=Math.max(1,threshold);
}
