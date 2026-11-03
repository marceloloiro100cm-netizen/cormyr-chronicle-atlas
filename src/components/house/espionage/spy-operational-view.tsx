import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {loadSpyHouseDashboard} from '@/lib/espionage/dashboard.functions';

/** Real operational records, distinct from the local planning demonstrations.
 * This component fails closed until the server schema and RLS have been deployed.
 */
export function SpyOperationalView({houseId}:{houseId:string}){
 const load=useServerFn(loadSpyHouseDashboard);
 const query=useQuery({
  queryKey:['espionage-house-dashboard',houseId],
  queryFn:()=>load({data:{houseId}}),
  retry:false,staleTime:30_000,
 });
 return <section className="house-panel" aria-label="Registros operacionais de espionagem">
  <h3>Registros operacionais da Casa</h3>
  {query.isPending&&<p role="status">Consultando agentes, missões e cartas autorizadas…</p>}
  {query.isError&&<p role="note" className="house-caption">
   A consulta operacional ainda não está liberada para esta Casa. Os quadros de planejamento abaixo continuam sendo apenas prévias; nenhum agente, relatório ou missão real foi carregado.
  </p>}
  {query.data&&<>
   <p className="house-caption">Informações autenticadas da própria Casa. Não inclui decisões secretas, Lei do alvo nem cartas seladas.</p>
   <div style={{display:'flex',flexWrap:'wrap',gap:16,marginBlock:12}}>
    <span><strong>{query.data.agents.length}</strong> agentes cadastrados</span>
    <span><strong>{query.data.missions.length}</strong> missões registradas</span>
    <span><strong>{query.data.reports.length}</strong> cartas liberadas</span>
    <span><strong>{query.data.dossiers.length}</strong> dossiês</span>
   </div>
   <details className="house-ledger"><summary>Agentes operacionais ({query.data.agents.length})</summary>
    {query.data.agents.length===0?<p>Nenhum agente conciliado no cadastro operacional.</p>:<ul>
     {query.data.agents.map(agent=><li key={agent.id}>
      <strong>{agent.codename}</strong> · {agent.kind==='contractor'?'Contratado':agent.kind==='network_cell'?'Rede':'Contato'} · {agent.status}
     </li>)}
    </ul>}
   </details>
   <details className="house-ledger"><summary>Missões registradas ({query.data.missions.length})</summary>
    {query.data.missions.length===0?<p>Nenhuma missão enviada.</p>:<ul>
     {query.data.missions.map(mission=><li key={mission.id}>
      <strong>{mission.missionKind.replaceAll('_',' ')}</strong> · {mission.targetType}: {mission.targetId} · {mission.status}
     </li>)}
    </ul>}
   </details>
   <details className="house-ledger"><summary>Cartas autorizadas ({query.data.reports.length})</summary>
    {query.data.reports.length===0?<p>Nenhuma carta de espionagem liberada.</p>:
     query.data.reports.map(report=><article key={report.id}>
      <h4>{report.code}</h4>
      <p>{report.locationLabel} · Observado: {report.observedDateKey} · Liberado: {report.releaseDateKey}</p>
      <p>Objetivos conhecidos: {new Set(report.facts.map(f=>f.fieldCode)).size}/{new Set(report.requestedFields).size}</p>
      {report.facts.length?<ul>{report.facts.map(f=><li key={f.id??f.fieldCode+f.observedDateKey}>
       <strong>{f.fieldCode.replaceAll('_',' ')}</strong>: {f.disclosedValue===null?'Não apurado':String(f.disclosedValue)}
       {' '}({f.confidence})
      </li>)}</ul>:<p>Nenhum fato liberado pelo Narrador.</p>}
     </article>)}
   </details>
   <details className="house-ledger"><summary>Dossiês reservados ({query.data.dossiers.length})</summary>
    {query.data.dossiers.length===0?<p>Nenhum dossiê de inteligência registrado.</p>:<ul>
     {query.data.dossiers.map(d=><li key={d.id}><strong>{d.targetType}: {d.targetId}</strong>
      <p>{d.facts.length} fatos históricos autorizados · v{d.version}</p>
     </li>)}
    </ul>}
   </details>
  </>}
 </section>;
}
