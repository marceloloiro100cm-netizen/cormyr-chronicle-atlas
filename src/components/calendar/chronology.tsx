import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {formatDate,MONTHS,formatCampaignPeriod,parseDate} from '@/lib/calendar/harptos';
import {formatRoundHarptosReference,validateCampaignChronology} from '@/lib/calendar/chronology';
import {Button} from '@/components/ui/button';

/** Consulta somente ocorrências já publicadas ou visíveis pela RLS.
 * Esta é uma visão da cronologia, não um painel de rascunhos do Narrador.
 */
export function CampaignChronology({year,month,anchorId}:{year:number;month:number;anchorId?:string}){
 const valid=Number.isInteger(year)&&year>=1&&year<=9999&&Number.isInteger(month)&&month>=0&&month<12;
 const query=useQuery({
  queryKey:['campaign-chronology',year,month],
  enabled:valid,
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('get_campaign_chronology',{p_year:year,p_month:month});
   if(error)throw error;
   return validateCampaignChronology(data,year,month);
  },
  refetchInterval:30000,
 });
 const rows=query.data?.events??[];
 const grouped=new Map<string,typeof rows>();
 for(const event of rows){
  const current=grouped.get(event.date)??[];
  current.push(event);grouped.set(event.date,current);
 }
 return <section className="harptos-chronology" id={anchorId} aria-label="Cronologia oficial dos eventos e missivas">
  <h3>Cronologia de {MONTHS[month]??'Harptos'} · {year} CV</h3>
  <p className="text-sm text-muted-foreground">Datas de Harptos são históricas. Semanas de entrega das missivas não são désdias e não alteram o relógio oficial.</p>
  {!valid&&<p role="alert">Selecione um mês e ano válidos de Harptos.</p>}
  {query.isPending&&valid&&<p role="status">Consultando a cronologia autorizada…</p>}
  {query.error&&<p role="alert">Cronologia indisponível; nenhum acontecimento foi presumido. <Button type="button" variant="outline" onClick={()=>void query.refetch()}>Recarregar</Button></p>}
  {query.data&&<>
   {rows.length===0?<p>Não há eventos oficiais ou correspondências entregues com data confirmada neste mês.</p>:
    <ol className="harptos-chronology-items">
     {[...grouped].map(([key,events])=><li key={key}>
      <h4>{formatDate(key)}</h4>
      <ul>{events.map(event=><li key={event.id}>
       <strong>{event.title}</strong> <small>· {event.kind==='mail'?'Correspondência entregue':'Evento oficial publicado'}</small>
       {event.description&&<p>{event.description}</p>}
      </li>)}</ul>
     </li>)}
    </ol>}
   <details><summary>Rodadas de correspondência vinculadas ao período ({query.data.rounds.length})</summary>
    <p className="house-caption">O período registrado é uma fotografia da abertura da rodada. Não é a data de cada carta nem muda quando o Narrador avança o calendário.</p>
    {query.data.rounds.length===0&&<p>Sem rodada vinculada explicitamente a este período.</p>}
    {query.data.rounds.map(round=><p key={round.number}>
     <strong>Semana {round.number}</strong> · {round.status==='open'?'Aberta':round.status==='closed'?'Encerrada':'Preparada'} · {formatRoundHarptosReference(round.harptos_period)}
    </p>)}
    {query.data.unassigned_round_count>0&&<p className="house-caption">{query.data.unassigned_round_count} rodada(s) histórica(s) sem referência Harptos registrada. Nenhuma data foi inventada para elas.</p>}
   </details>
  </>}
 </section>;
}
