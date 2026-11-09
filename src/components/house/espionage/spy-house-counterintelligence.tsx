import {useQuery} from '@tanstack/react-query';
import {ShieldAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatDate,parseDate} from '@/lib/calendar/harptos';
import {readSpyHouseCounterintelligenceBrowser}
 from '@/lib/espionage/spy-operations-browser';

const resultLabels={
 escaped:'Intruso detectado; escapou',
 captured:'Intruso detectado; capturado',
 dead:'Intruso detectado; morto',
} as const;

/** A Casa recebe apenas detecções efetivas. Não expõe a identidade do atacante. */
export function SpyHouseCounterintelligence({houseId}:{houseId:string}){
 const query=useQuery({
  queryKey:['spy-counterintelligence',houseId],
  queryFn:()=>readSpyHouseCounterintelligenceBrowser(houseId),
  retry:false,staleTime:30_000,
 });
 return <section className="house-ledger spy-counterintelligence"
  aria-label="Alertas da contraespionagem" style={{padding:12}}>
  <div className="spy-counterintelligence-heading">
   <h4><ShieldAlert size={17} aria-hidden="true"/> Contraespionagem</h4>
   <Button type="button" size="sm" variant="outline" disabled={query.isFetching}
    onClick={()=>void query.refetch()}>Atualizar</Button>
  </div>
  {query.isPending&&<p role="status">Verificando alertas de segurança…</p>}
  {query.isError&&<p role="alert">
   Não foi possível consultar os alertas desta Casa.
   <Button variant="outline" type="button" onClick={()=>void query.refetch()}>
    Tentar novamente</Button>
  </p>}
  {query.data&&<>
   <p className="house-caption">{query.data.totalDetections===0
    ?'Nenhuma infiltração foi oficialmente detectada até agora.'
    :query.data.totalDetections+' tentativa(s) inimiga(s) detectada(s) e resolvida(s).'}</p>
   {query.data.alerts.length>0&&<details>
    <summary>Consultar ocorrências ({query.data.alerts.length} recentes)</summary>
    <ul className="spy-counterintelligence-events">
     {query.data.alerts.map((row,i)=><li key={row.dateKey+':'+i}>
      <strong>{parseDate(row.dateKey)?formatDate(row.dateKey):'Data pendente'}</strong>
      <span>{resultLabels[row.result]}</span>
     </li>)}
    </ul>
   </details>}
   <small className="house-caption">Apenas incidentes detectados e concluídos são exibidos.
    Missões secretas não aparecem, e a identidade dos atacantes permanece oculta.</small>
  </>}
 </section>;
}
