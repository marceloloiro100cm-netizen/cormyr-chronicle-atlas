import {eventsForHarptosPeriod,formatCampaignPeriod,parseDate,formatDate} from '@/lib/calendar/harptos';
import {formatRoundHarptosReference,roundPeriodMatchesCurrent} from '@/lib/calendar/chronology';

/** Aviso privado ao Narrador. Rodadas são independentes do relógio de Harptos. */
export function MailPeriodNotice({date,round}:{date:string;round?:{
 number:number;status:string;harptos_period?:string|null
}|null}){
 const parsed=parseDate(date),events=eventsForHarptosPeriod(date);
 const frozen=round?.harptos_period??null;
 const same=roundPeriodMatchesCurrent(frozen,date);
 return <aside className="campaign-round-pending" aria-label="Aviso ao Mestre — eventos do período">
  <h3>Aviso ao Mestre — eventos do período</h3>
  {round&&<p>Semana de correspondência <strong>{round.number}</strong> · referência na abertura:
   <strong> {formatRoundHarptosReference(frozen)}</strong>.
   {!frozen?' A rodada foi registrada sem referência Harptos; não é seguro inferir uma data retrospectiva.':
    !same?' O calendário atual está em outro período; a referência histórica desta rodada permanece a mesma.':
     ' O calendário atual coincide com o período registrado.'}
  </p>}
  {!parsed?<p>Defina a data oficial de Harptos para consultar os eventos do período.</p>:<>
   <p>Período atual do Reino: <strong>{formatCampaignPeriod(parsed)}</strong>. Esta é a data vigente, não a semana de entrega ou a data necessariamente escrita numa missiva.</p>
   {events.length?<ul>{events.map(e=><li key={e.id}>
    <strong>{formatDate(e.date)} — {e.title}</strong>{e.description&&<span> · {e.description}</span>}
   </li>)}</ul>:<p>Nenhum evento com data confirmada no calendário consultado para esta désdia.</p>}
   <small>Eventos da campanha sem data confirmada e festivais regionais precisam ser conferidos na referência CALENDARIO-CORMYR.md.</small>
  </>}
 </aside>;
}
