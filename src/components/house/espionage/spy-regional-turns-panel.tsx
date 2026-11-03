import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {loadSpyRegionalStrategy} from '@/lib/espionage/region-turns.functions';
import {listSpyHouseTargets} from '@/lib/espionage/spy-house-targets.functions';
import {spyHouseTargetStage} from '@/lib/espionage/spy-target-stages';
import {planSpyRegionalMission,type SpyRegionalAgent} from '@/lib/espionage/region-turns';
import {cormyrPreviewLinks,CORMYR_MAP_SOURCE} from '@/lib/espionage/cormyr-map';
import {CormyrInteractiveMap} from './cormyr-interactive-map';
import {allSpyRegionalBaselines} from '@/lib/espionage/public-strategy';
import {REGIONS} from '@/lib/house/regions';
import {SpyRegionRouteAdmin} from './spy-region-route-admin';
import {SpyNobleDefenseAdmin} from './spy-noble-defense-admin';
import {SpyMissionOddsCard} from './spy-mission-odds-card';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {formatDate,formatCampaignPeriod} from '@/lib/calendar/harptos';
import {projectSpyHarptosSchedule} from '@/lib/espionage/round-calendar';

/** Strategy only: 1 espionage round = one 10-ordinary-day Harptos désdia.
 * The existing published Hub Temporal is the ONLY start date.
 * Neither this preview nor client-side interaction may advance that clock.
 */
export function SpyRegionalTurnsPanel({houseId,admin=false}:{houseId:string;admin?:boolean}){
 const load=useServerFn(loadSpyRegionalStrategy);
 const loadTargets=useServerFn(listSpyHouseTargets);
 const campaignTime=useCampaignTime();
 const {data,isPending,isError,refetch}=useQuery({
  queryKey:['espionage-regional-strategy',houseId],
  queryFn:()=>load({data:{houseId}}),staleTime:30_000,retry:false,
 });
 const targetsQuery=useQuery({
  queryKey:['spy-house-public-targets'],
  queryFn:()=>loadTargets({data:{}}),staleTime:120_000,retry:false,
 });
 const [assetId,setAssetId]=useState('');
 const [destination,setDestination]=useState('');
 const [allowSea,setAllowSea]=useState(true);
 const [returnToStart,setReturnToStart]=useState(false);
 const [originOverride,setOriginOverride]=useState('');
 const [targetMode,setTargetMode]=useState<'travel'|'region'|'house'>('house');
 const [targetHouseId,setTargetHouseId]=useState('');
 const regions=allSpyRegionalBaselines();
 const selected=data?.agents.find(a=>a.id===(assetId||data.agents[0]?.id));
 // The GM-supplied map is a source for strategic previews. It DOES NOT
 // certify routes for an actual operation; that requires server-side review.
 const previewLinks=cormyrPreviewLinks(data?.links??[]);
 const currentOrigin=originOverride||(selected?.currentRegion??null);
 const simulated=Boolean(originOverride||!selected);
 const houseMode=targetMode==='house';
 const travelOnly=targetMode==='travel';
 const houseChoices=(targetsQuery.data??[]).filter(h=>h.regionId===destination&&h.id!==houseId);
 const selectedTargetHouse=houseChoices.find(h=>h.id===targetHouseId);
 const houseStage=spyHouseTargetStage({
  agent:selected??null,selectedRegion:destination,targetHouseId,
  houseTargets:houseChoices,simulation:simulated,
 });
 // Preview may be planned before travel; operational authorization is unchanged.
 const canTargetHouse=houseMode&&Boolean(selectedTargetHouse)&&
  Boolean(selected)&&selected?.status==='available'&&!simulated;
 useEffect(()=>{
  if(!destination&&selected?.currentRegion)setDestination(selected.currentRegion);
 },[destination,selected?.currentRegion]);
 const hypotheticalAgent:SpyRegionalAgent={
  id:'11111111-1111-4111-8111-111111111111',
  codename:'Simulação geográfica',status:'available',currentRegion:currentOrigin,
 };
 const planningAgent=simulated?hypotheticalAgent:selected;
 const plan=planningAgent&&destination?planSpyRegionalMission({
  agent:planningAgent,destinationRegion:destination,links:previewLinks,
  seaAllowed:allowSea,includeReturn:returnToStart&&!travelOnly,
 }):null;
 const comparisons=currentOrigin?regions.map(region=>({
  ...region,
  estimate:planSpyRegionalMission({agent:hypotheticalAgent,
   destinationRegion:region.regionId,links:previewLinks,seaAllowed:allowSea}),
 })):[];
 const forecast=plan?.status==='ready'&&campaignTime.data&&!campaignTime.isError
  ?projectSpyHarptosSchedule({plan,officialDate:campaignTime.data,
    calendarVersion:campaignTime.data.version})
  :null;
 const name=(id:string)=>REGIONS[id]?.name??id;
 const chooseRegion=(id:string)=>{setDestination(id);setTargetHouseId('');};
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
   <h3>Planejador visual de missões de espionagem</h3>
  </div></div>
  <p><strong>Etapa 1:</strong> escolha um agente e a região onde ele está
    ou para onde viajará. <strong>Etapa 2:</strong> selecione uma Casa nobre da região
    para ver sua dificuldade e chance estimada de sucesso. É possível
    planejar antes da viagem, mas só executar a investigação após a chegada registrada.
    Para investigar dentro da região atual, a missão leva <strong>1 rodada</strong>.
   Cada região atravessada custa <strong>1 rodada de viagem</strong>, além da investigação.
   Uma passagem marítima homologada liga duas regiões em apenas <strong>1 rodada</strong>.
   <strong> Cada rodada equivale a 1 désdia (10 dias ordinários) do Hub Temporal.</strong>
  </p>
  <p className="house-caption">A posição do espião selecionado é a origem padrão, nunca a sede da Casa.
   Você também pode escolher uma origem <strong>somente para simulação</strong>. O mapa usa
   as fronteiras terrestres visíveis no documento enviado pelo Narrador;
   as três regiões costeiras do Dragonmere — Crownlands, Shieldmark e Dragon Coast — podem navegar diretamente entre si em 1 désdia. Outras travessias marítimas exigem homologação no servidor. Nenhum desses
   cálculos envia missão ou altera o Hub Temporal.</p>
  <details className="house-ledger">
   <summary>Consultar dificuldade basal de todas as regiões</summary>
   <p>Esses valores são usados <strong>somente em investigações regionais</strong>.
     A defesa de uma Casa usa a Lei efetiva e as construções da própria Casa,
     sem incluir a Lei basal regional nem expor os dados privados da Casa-alvo.</p>
   <table><thead><tr><th scope="col">Região</th><th scope="col">Lei basal</th></tr></thead>
    <tbody>{regions.map(x=><tr key={x.regionId}><td>{x.regionName}</td>
     <td>{x.basalDifficulty}</td></tr>)}</tbody>
   </table>
  </details>
  <div className="house-ledger" style={{margin:'14px 0',display:'grid',gap:10}}>
   <label>Origem do cálculo
    <select aria-label="Região de origem para simulação" value={originOverride}
     onChange={e=>setOriginOverride(e.target.value)}>
     <option value="">Posição atual do espião {selected?.currentRegion?'· '+name(selected.currentRegion):'(se disponível)'}</option>
     {regions.map(region=><option key={region.regionId} value={region.regionId}>
      Simular partida em {region.regionName}
     </option>)}
    </select>
   </label>
   {originOverride&&<p role="note" className="house-caption">Esta origem é uma simulação do mapa e não move o espião nem modifica sua localização oficial.</p>}
  </div>
  <CormyrInteractiveMap
   selectedRegion={destination} originRegion={currentOrigin}
   plan={plan?.status==='ready'?plan:null}
   onSelect={chooseRegion}/>
  {currentOrigin&&<details className="house-ledger" open style={{marginTop:14}}>
   <summary>Todas as regiões · viagem a partir de {name(currentOrigin)} (11 destinos)</summary>
   <p>Estimativa terrestre baseada no mapa e acrescida das passagens marítimas aprovadas, quando habilitadas.
    Se escolher reconhecimento regional depois da viagem, a investigação acrescenta 1 désdia; deslocamento simples não acrescenta investigação.</p>
   <div style={{overflowX:'auto'}}>
    <table><thead><tr>
     <th scope="col">Destino</th><th scope="col">Viagem</th>
     <th scope="col">Investigação</th><th scope="col">Total</th><th scope="col">Dias ordinários</th>
    </tr></thead><tbody>
     {comparisons.map(row=><tr key={row.regionId}
      style={destination===row.regionId?{background:'rgba(174,194,224,.25)'}:undefined}>
      <td><button type="button" onClick={()=>chooseRegion(row.regionId)}
       style={{background:'none',border:0,textDecoration:'underline',color:'inherit',cursor:'pointer',textAlign:'left'}}>
       {row.regionName}</button></td>
      {row.estimate.status==='ready'?<>
       <td>{row.estimate.travelRounds} désdia(s)</td><td>1 désdia</td>
       <td><strong>{row.estimate.totalRounds} désdia(s)</strong></td>
       <td>{row.estimate.totalRounds*10}</td>
      </>:<td colSpan={4}>Rota pendente de validação</td>}
     </tr>)}
    </tbody></table>
   </div>
   <small>Fonte terrestre: {CORMYR_MAP_SOURCE}. Crownlands, Shieldmark e Dragon Coast: cada travessia direta via Dragonmere custa 1 désdia, conforme regra do Narrador. Os caminhos desta tabela são estimativas cartográficas;
    para executar uma missão será exigida uma rota autorizada pelo servidor.</small>
  </details>}
  {isPending&&<p role="status">Consultando posições dos agentes e travessias marítimas homologadas…</p>}
  {isError&&<div role="note">
   <p>O cadastro operacional da Casa não pôde ser consultado. O mapa e a simulação de fronteiras
    ainda funcionam, mas o ponto de partida de um espião real precisa ser confirmado.</p>
   <Button type="button" variant="outline" onClick={()=>{void refetch();}}>Consultar novamente</Button>
  </div>}
  {data&&<div style={{display:'grid',gap:12,maxWidth:750,marginTop:16}}>
   <label>Agente e localização atual
    <select aria-label="Agente da missão" value={selected?.id??''}
     onChange={e=>{setAssetId(e.target.value);
      setDestination(data.agents.find(a=>a.id===e.target.value)?.currentRegion??'');
      setTargetHouseId('');}}>
     {data.agents.length===0&&<option value="">Nenhum agente conciliado</option>}
     {data.agents.map(a=><option key={a.id} value={a.id}>
      {a.codename} · {a.currentRegion?name(a.currentRegion):'localização pendente'} · {a.status}
     </option>)}
    </select>
   </label>
   <label>Objetivo da espionagem
     <select aria-label="Tipo de alvo da espionagem" value={targetMode}
      onChange={e=>{setTargetMode(e.target.value as 'travel'|'region'|'house');setTargetHouseId('');}}>
      <option value="travel">Deslocar agente até uma região (sem investigar)</option>
       <option value="region">Investigar uma região</option>
      <option value="house">Espionar uma Casa nobre da região</option>
     </select>
    </label>
    <label>Região de destino
    <select aria-label="Região de destino" value={destination}
     onChange={e=>{setDestination(e.target.value);setTargetHouseId('');}}>
     <option value="">Selecione uma região</option>
     {regions.map(region=><option key={region.regionId} value={region.regionId}>
      {region.regionName}{targetMode==='region'?' · Lei basal '+region.basalDifficulty:''}
     </option>)}
    </select>
   </label>
   {houseMode&&<div className="house-ledger" style={{display:'grid',gap:8}}>
    <h4>Etapa 2 · Escolher a Casa nobre</h4>
    <p className="house-caption">Escolha a Casa agora para consultar o risco e a chance
     estimada. O agente precisa estar <strong>fisicamente</strong> na região
     para executar a investigação. Uma origem simulada não autoriza uma missão.</p>
    {houseStage==='requires_region_arrival'&&<p role="status">
     Viagem necessária até {destination?name(destination):'a região selecionada'}.
     Você já pode selecionar uma Casa e simular sua dificuldade, mas a execução
     depende da chegada registrada no Hub Temporal.</p>}
    {houseStage==='select_agent'&&<p role="status">Selecione um agente real
     e desative a simulação para escolher a Casa.</p>}
    {houseStage==='select_region'&&<p>Escolha primeiro uma região no mapa.</p>}
    {houseStage==='agent_unavailable'&&<p role="status">O agente está indisponível.</p>}
    {houseStage==='unknown_agent_location'&&<p role="status">A localização real do agente não está confirmada.</p>}
    {targetsQuery.isError&&<p role="alert">A lista pública de Casas está indisponível.</p>}
    <label>Casa nobre na região
     <select aria-label="Casa nobre alvo"
      value={houseChoices.some(h=>h.id===targetHouseId)?targetHouseId:''}
      onChange={e=>setTargetHouseId(e.target.value)}
      disabled={!destination||!selected||selected.status!=='available'||simulated||
       targetsQuery.isError}>
      <option value="">Selecione a Casa</option>
      {houseChoices.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
     </select>
    </label>
    {destination&&!targetsQuery.isPending&&!houseChoices.length&&
     <p className="house-caption">Não há outra Casa no cadastro público dessa região.
      Casas NPC exigem cadastro e homologação pelo Narrador.</p>}
    {canTargetHouse&&<p role="status">
     Casa {selectedTargetHouse?.name} selecionada. A avaliação já pode ser consultada.
     {selected?.currentRegion===destination
      ?' O agente está na região; investigação local estimada em 1 désdia.'
      :' A viagem deverá ser concluída antes de iniciar a investigação.'}
    </p>}
    <SpyMissionOddsCard
     houseId={houseId} agentId={selected?.id??''}
     targetHouseId={targetHouseId} agentName={selected?.codename??'Agente'}
     agentAvailable={selected?.status==='available'} simulation={simulated}
     destinationRegion={destination}
     travelRounds={plan?.status==='ready'?plan.travelRounds:null}
     originRegion={selected?.currentRegion??null}/>
   </div>}
   <label style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="checkbox" checked={allowSea} onChange={e=>setAllowSea(e.target.checked)}/>
    Considerar travessias marítimas autorizadas (incluindo Dragonmere)
   </label>
   {!travelOnly&&<label style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="checkbox" checked={returnToStart} onChange={e=>setReturnToStart(e.target.checked)}/>
    Incluir viagem de retorno após a investigação
   </label>}
   {plan?.status==='ready'?<div className="house-panel" role="status">
    <h4>{name(plan.startRegion)} → {plan.regionName}</h4>
    {(travelOnly||houseMode&&!canTargetHouse)
      ?<p><strong>Primeira etapa — deslocamento regional:</strong>
       {plan.travelRounds} désdia(s) de viagem ({plan.travelRounds*10} dias ordinários).
       {travelOnly?'Este deslocamento não inclui investigação.':houseStage==='select_house'?'O agente já está aqui: selecione uma Casa antes de planejar a investigação.':'A investigação da Casa dependerá de chegada registrada e escolha do alvo.'}</p>
      :<p><strong>{plan.travelRounds}</strong> désdia(s) de viagem + <strong>1</strong>
       de investigação = <strong>{plan.totalRounds} désdia(s)</strong> na prévia
       ({plan.totalRounds*10} dias ordinários).</p>}
    <p className="house-caption">Estimativa cartográfica. As fronteiras do desenho não substituem
     homologação de rotas operacionais; {simulated?'a origem é hipotética':'o agente tem a posição informada pelo banco'}.</p>
    {travelOnly?<p><strong>Somente deslocamento.</strong> Nenhum teste de investigação regional ou contra Casa ocorre nesta etapa.</p>
     :houseMode
      ?<p>Alvo: <strong>Casa nobre.</strong> A Lei basal regional não determina a defesa
       da Casa. {canTargetHouse
        ?'A defesa usa a Lei e as construções da própria Casa-alvo, reservadas ao Narrador.'
        :'Aguarde a chegada regional antes de planejar a investigação da Casa.'}</p>
      :<p>Dificuldade basal de reconhecimento regional: <strong>{plan.basalDifficulty} (Lei regional)</strong>.</p>}
    {plan.legs.length===0?<p>{travelOnly?'O agente já está na região selecionada.':'A investigação ocorre na região atual do espião.'}</p>:
     <ol>{plan.legs.map((leg,i)=><li key={leg.connectionId+':'+i}>
      {name(leg.fromRegion)} → {name(leg.toRegion)} · 1 rodada
      {leg.passage==='sea_passage'?(new Set(['dragoncoast','crownlands','shieldmark']).has(leg.fromRegion)&&new Set(['dragoncoast','crownlands','shieldmark']).has(leg.toRegion)?' · via Dragonmere':' · via marítima'):' · fronteira terrestre'}
     </li>)}</ol>}
    {!travelOnly&&returnToStart&&<p>{plan.returnRounds===null
     ?'Retorno não homologado: não existe caminho de volta aprovado.'
     :'Retorno: '+plan.returnRounds+' rodada(s). Total com missão e retorno: '+plan.totalWithReturnRounds+' rodada(s).'}</p>}
    {forecast?<div className="house-ledger" style={{marginTop:12}}>
     <h4>Datas previstas pelo Hub Temporal</h4>
     <p>Partida a partir da data oficial: <strong>{formatDate(forecast.officialDateKey)}</strong> ({formatCampaignPeriod(campaignTime.data!)} · v{forecast.calendarVersion}).</p>
     <p>Chegada à região investigada: <strong>{formatDate(forecast.arrivesAtTargetDateKey)}</strong>.</p>
     {(!travelOnly&&(!houseMode||canTargetHouse))&&<p>Investigação de 1 désdia:
       <strong>{formatDate(forecast.investigationStartsDateKey)}</strong> até
       <strong>{formatDate(forecast.investigationEndsDateKey)}</strong>.</p>}
     {(!travelOnly&&(!houseMode||canTargetHouse))
       ?<p>Conclusão prevista: <strong>{formatDate(forecast.investigationEndsDateKey)}</strong>
        — {forecast.ordinaryDaysToConclusion} dias ordinários após a data oficial.</p>
       :<p>Chegada regional prevista: <strong>{formatDate(forecast.arrivesAtTargetDateKey)}</strong>.
        A investigação da Casa ainda não possui data de conclusão autorizada.</p>}
     {forecast.travelLegs.length>1&&<details><summary>Datas de chegada de cada trecho</summary><ol>
      {forecast.travelLegs.map((leg,i)=><li key={leg.edgeId+':'+i}>
       {name(leg.fromRegion)} → {name(leg.toRegion)}: {formatDate(leg.arrivalDateKey)}
      </li>)}
     </ol></details>}
     {!travelOnly&&returnToStart&&(forecast.returnArrivalDateKey
      ?<p>Retorno à região inicial: <strong>{formatDate(forecast.returnArrivalDateKey)}</strong> — {forecast.ordinaryDaysWithReturn} dias ordinários incluindo investigação.</p>
      :<p>Sem data de retorno: rota de volta ainda não homologada.</p>)}
     {!travelOnly&&forecast.crossedFestivalsUntilConclusion.length>0&&<p>Festivais intercalares atravessados: {forecast.crossedFestivalsUntilConclusion.map(f=>f.name).join(', ')}. Eles não consomem dias de désdia.</p>}
    </div>:<p role="note">O Hub Temporal oficial não está disponível; os valores em rodadas continuam válidos, mas não há datas de chegada confirmáveis.</p>}
    <small>Prévia estratégica, não uma missão registrada. O avanço e a publicação do tempo permanecem exclusivos do Narrador.</small>
   </div>:plan&&<p role="status" className="house-caption">{message[plan.status]}</p>}
   {!data.agents.length&&<p role="note">Sem agentes cadastrados. Após conciliação da Rede ou contratação, o cálculo passará a usar a posição própria de cada agente.</p>}
  </div>}
  {admin&&<SpyNobleDefenseAdmin houses={targetsQuery.data??[]}/>}
  {admin&&<SpyRegionRouteAdmin houseId={houseId}/>}
 </section>;
}
