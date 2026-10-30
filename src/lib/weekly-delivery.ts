export type ReplyDirection = 'player-to-narrator' | 'narrator-to-player' | 'player-to-player';
export function replyDeliveryWeek(currentWeek: number, direction: ReplyDirection) {
  if (!Number.isInteger(currentWeek) || currentWeek < 1) throw new Error('Semana inválida');
  return direction === 'player-to-narrator' ? currentWeek : currentWeek + 1;
}
export function canExposeScheduledMessage(state: string, isNarrator: boolean, isAuthor: boolean) {
  return isNarrator || isAuthor || state === 'delivered';
}
/** Próxima rodada de entrega; cartas já programadas não avançam a sugestão. */
export function suggestNextLetterWeek(rounds:ReadonlyArray<{number:number;status:string}>):number {
  const valid=rounds.filter(r=>Number.isInteger(r.number)&&r.number>=1);
  const open=valid.filter(r=>r.status==='open').map(r=>r.number);
  const base=open.length?Math.max(...open):Math.max(0,...valid.map(r=>r.number));
  return base+1;
}
