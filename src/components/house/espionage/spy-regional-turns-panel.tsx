import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {loadSpyRegionalStrategy} from '@/lib/espionage/region-turns.functions';
import {planSpyRegionalMission} from '@/lib/espionage/region-turns';
import {allSpyRegionalBaselines} from '@/lib/espionage/public-strategy';
import {REGIONS} from '@/lib/house/regions';

/** Strategic panel: read-only preview, never starts a mission or advances date.
 * All distances are in RODADAS, independent of wall-clock days until the
 * Narrator confirms their relation to published Harptos désdias.
 */
export function SpyRegionalTurnsPanel({houseId}:{houseId:string}){
 const load=useServerFn(loadSpyRegionalStrategy);
 const {data,isPending,isError,refetch}=useQuery({
  queryKey:['espionage-regional-strategy',houseId],
  queryFn:()=>load({data:{houseId}}),staleTime:30_000,retry:false,
 });
 const [assetId,setAssetId]=useState('');
 const [destination,setDestination]=useState('');
 const [allowSea,setAllowSea]=useState(true);
 const [returnToStart,setReturnToStart]=useState(false);
 const regions=allSpyRegionalBaselines();
 const selected=data?.agents.find(a=>a.id===(assetId||data.agents[0]?.id));
 const plan=selected&&destination&&data?planSpyRegionalMission({
  agent:selected,destinationRegion:destination,links:data.links,
  seaAllowed:allowSea,includeReturn:returnToStart,
 }):null;
 const name=(id:string)=>REGIONS[id]?.name??id;
 const message={
  unknown_destination:'Selecione uma região conhecida.',
  unknown_agent_location:'A posição atual do espião não foi homologada. Não é possível calcular a viagem.',
  agent_in_transit:'Agente em trânsito: aguarde a próxima chegada confirmada antes de projetar outra viagem.',
  agent_unavailable:'Este agente está indisponível para novas missões.',
  route_not_approved:'Sem ligação regional homologada entre a posição atual e o destino. Prazo pendente do Narrador.',
 };
 return <section className="house-panel" aria-label="Estratégia regional e rodadas de espionagem">
  <div className="house-section-heading"><div>
   <p className="campaign-eyebrow">ESTRATÉGIA DE INTELIGÊNCIA</p>
   <h3>Dificuldade regional e tempo de viagem</h3>
  </div></div>
  <p>Para investigar dentro da região atual, a missão leva <strong>1 rodada</strong>.
   Cada região atravessada custa <strong>1 rodada de viagem</strong>, além da investigação.
   Uma passagem marítima homologada liga duas regiões em apenas <strong>1 rodada</strong>.
  </p>
  <p className="house-caption">A origem sempre é a região em que o <strong>agente selecionado</strong> está localizado.
   Não é a sede da Casa. O cálculo não avança o calendário nem envia uma missão.</p>
  <details className="house-ledger">
   <summary>Consultar dificuldade basal de todas as regiões</summary>
   <p>Valores públicos derivados da Lei regional. A dificuldade específica de uma Casa poderá sofrer modificações posteriores.</p>
   <table><thead><tr><th scope="col">Região</th><th scope="col">Lei basal</th></tr></thead>
    <tbody>{regions.map(x=><tr key={x.regionId}><td>{x.regionName}</td>
     <td>{x.basalDifficulty}</td></tr>)}</tbody>
   </table>
  </details>
  {isPending&&<p role="status">Consultando posições dos agentes e fronteiras homologadas…</p>}
  {isError&&<div role="note">
   <p>O cadastro operacional de agentes e ligações regionais ainda não está publicado.
    As dificuldades basais acima permanecem disponíveis, mas não há prazo de viagem confirmado.</p>
   <Button type="button" variant="outline" onClick={()=>{void refetch();}}>Consultar novamente</Button>
  </div>}
  {data&&<div style={{display:'grid',gap:12,maxWidth:750,marginTop:16}}>
   <label>Agente e localização atual
    <select aria-label="Agente em deslocamento" value={selected?.id??''}
     onChange={e=>setAssetId(e.target.value)}>
     {data.agents.length===0&&<option value="">Nenhum agente conciliado</option>}
     {data.agents.map(a=><option key={a.id} value={a.id}>
      {a.codename} · {a.currentRegion?name(a.currentRegion):'localização pendente'} · {a.status}
     </option>)}
    </select>
   </label>
   <label>Região a espionar
    <select aria-label="Região de destino" value={destination}
     onChange={e=>setDestination(e.target.value)}>
     <option value="">Selecione uma região</option>
     {regions.map(region=><option key={region.regionId} value={region.regionId}>
      {region.regionName} · Lei basal {region.basalDifficulty}
     </option>)}
    </select>
   </label>
   <label style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="checkbox" checked={allowSea} onChange={e=>setAllowSea(e.target.checked)}/>
    Considerar atalhos marítimos disponíveis e homologados
   </label>
   <label style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="checkbox" checked={returnToStart} onChange={e=>setReturnToStart(e.target.checked)}/>
    Incluir viagem de retorno após a investigação
   </label>
   {plan?.status==='ready'?<div className="house-panel" role="status">
    <h4>{name(plan.startRegion)} → {plan.regionName}</h4>
    <p><strong>{plan.travelRounds}</strong> rodada(s) de deslocamento + <strong>1</strong> de investigação = <strong>{plan.totalRounds} rodada(s)</strong> até concluir a missão.</p>
    <p>Dificuldade basal de espionagem no destino: <strong>{plan.basalDifficulty} (Lei)</strong>.</p>
    {plan.legs.length===0?<p>A investigação ocorre na região atual do espião.</p>:
     <ol>{plan.legs.map((leg,i)=><li key={leg.connectionId+':'+i}>
      {name(leg.fromRegion)} → {name(leg.toRegion)} · 1 rodada
      {leg.passage==='sea_passage'?' · via marítima':' · fronteira terrestre'}
     </li>)}</ol>}
    {returnToStart&&<p>{plan.returnRounds===null
     ?'Retorno não homologado: não existe caminho de volta aprovado.'
     :'Retorno: '+plan.returnRounds+' rodada(s). Total com missão e retorno: '+plan.totalWithReturnRounds+' rodada(s).'}</p>}
    <small>Rodadas de campanha; a equivalência com dias de Harptos requer confirmação do Narrador.</small>
   </div>:plan&&<p role="status" className="house-caption">{message[plan.status]}</p>}
   {!data.agents.length&&<p role="note">Sem agentes cadastrados. Após conciliação da Rede ou contratação, o cálculo passará a usar a posição própria de cada agente.</p>}
  </div>}
 </section>;
}
