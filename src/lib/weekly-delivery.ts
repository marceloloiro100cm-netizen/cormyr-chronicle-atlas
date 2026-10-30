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

/** O próximo número de rodada depende apenas de rodadas abertas/encerradas.
 * Uma rodada preparada não pode permitir saltar as semanas anteriores. */
export function nextCampaignRound(rounds:ReadonlyArray<{number:number;status:string}>):number {
  return Math.max(0,...rounds.filter(r=>Number.isInteger(r.number)&&r.number>=1
    && (r.status==='open'||r.status==='closed')).map(r=>r.number))+1;
}

/** Data da carta é independente da semana de criação e da efetiva entrega. */
export function mailWeekTimeline(creation:number|null|undefined,delivery:number|null|undefined,state:string|undefined):string {
  const created=Number.isInteger(creation)&&Number(creation)>0?Number(creation):null;
  const arrived=Number.isInteger(delivery)&&Number(delivery)>0?Number(delivery):null;
  if(created===null&&arrived===null)return 'Sem semana de envio ou entrega cadastrada';
  if(state==='draft')return created!==null?`Rascunho da Semana ${created}`:'Rascunho sem semana definida';
  if(state==='scheduled')return [created!==null?`Criada na Semana ${created}`:null,arrived!==null?`Entrega prevista para a Semana ${arrived}`:null].filter(Boolean).join(' · ');
  if(created!==null&&arrived!==null&&created===arrived)return `Enviada e recebida na Semana ${created}`;
  return [created!==null?`Enviada na Semana ${created}`:null,arrived!==null?`Recebida na Semana ${arrived}`:null].filter(Boolean).join(' · ');
}
