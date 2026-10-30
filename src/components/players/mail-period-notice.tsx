import {eventsForHarptosPeriod,formatCampaignPeriod,parseDate,formatDate} from '@/lib/calendar/harptos';
/** This warning is internal to the narrator and never part of a player's letter. */
export function MailPeriodNotice({date}:{date:string}){
 const parsed=parseDate(date),events=eventsForHarptosPeriod(date);
 return <aside className="campaign-round-pending" aria-label="Aviso ao Mestre — eventos do período">
  <h3>Aviso ao Mestre — eventos do período</h3>
  {!parsed?<p>Defina a data de Harptos para consultar os eventos do período.</p>:<>
   <p>Período de referência: <strong>{formatCampaignPeriod(parsed)}</strong>. Eventos da mesma désdia; confirme a duração efetiva da rodada antes de assumir que ela cobre todos esses dias.</p>
   {events.length?<ul>{events.map(e=><li key={e.id}>
      <strong>{formatDate(e.date)} — {e.title}</strong>{e.description&&<span> · {e.description}</span>}
    </li>)}</ul>:<p>Nenhum evento com data confirmada no calendário consultado para esta désdia.</p>}
   <small>Eventos da campanha sem data confirmada e festivais regionais precisam ser conferidos na referência CALENDARIO-CORMYR.md.</small>
  </>}
 </aside>;
}
