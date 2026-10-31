import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {loadKingdomHouseOverview} from '@/lib/house/gm-management.functions';
import {RESOURCE_KEYS,RESOURCE_NAMES} from '@/lib/house/types';

export function KingdomHouseOverview(){
 const load=useServerFn(loadKingdomHouseOverview);
 const query=useQuery({queryKey:['kingdom-house-overview'],queryFn:()=>load()});
 return <section className="house-ledger"><h3>Resumo das Casas da Temporada — Narrador</h3>
  {query.isPending?<p>Consultando recursos das Casas…</p>:query.error?<p role="alert">Quadro consolidado indisponível.</p>:
  <div className="overflow-x-auto"><table className="campaign-table">
   <thead><tr><th>Casa / Região</th><th>Fase</th><th>Status</th>
    {RESOURCE_KEYS.map(r=><th key={r}>{RESOURCE_NAMES[r]} (disp./total)</th>)}
    <th>Tropas</th><th>Posses</th><th>Pendências</th></tr></thead>
   <tbody>{query.data?.map(h=><tr key={h.id}><td><strong>{h.name}</strong><small> · {h.region}</small></td>
     <td>{h.phase}</td><td>{h.status??'—'}</td>
     {RESOURCE_KEYS.map(r=><td key={r}>{h.available?.[r]??'—'} / {h.total?.[r]??'—'}</td>)}
     <td>{h.units}</td><td>{h.holdings}</td><td>{h.pending}</td>
   </tr>)}</tbody>
  </table></div>}
 </section>;
}
