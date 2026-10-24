export type ReplyDirection = 'player-to-narrator' | 'narrator-to-player' | 'player-to-player';
export function replyDeliveryWeek(currentWeek: number, direction: ReplyDirection) {
  if (!Number.isInteger(currentWeek) || currentWeek < 1) throw new Error('Semana inválida');
  return direction === 'player-to-narrator' ? currentWeek : currentWeek + 1;
}
export function canExposeScheduledMessage(state: string, isNarrator: boolean, isAuthor: boolean) {
  return isNarrator || isAuthor || state === 'delivered';
}