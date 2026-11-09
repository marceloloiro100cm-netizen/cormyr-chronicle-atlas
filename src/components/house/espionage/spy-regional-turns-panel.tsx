import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {readSpyRegionalStrategyBrowser} from '@/lib/espionage/spy-browser-client';
import {readSpyNobleHouseTargetsBrowser} from '@/lib/espionage/spy-target-browser';
import {spyHouseTargetStage} from '@/lib/espionage/spy-target-stages';
import {planSpyRegionalMission} from '@/lib/espionage/region-turns';
import {cormyrPreviewLinks} from '@/lib/espionage/cormyr-map';
import {allSpyRegionalBaselines} from '@/lib/espionage/public-strategy';
import {REGIONS} from '@/lib/house/regions';
import {useCampaignTime} from '@/lib/calendar/campaign-time';
import {formatDate} from '@/lib/calendar/harptos';
import {projectSpyHarptosSchedule} from '@/lib/espionage/round-calendar';
import {CormyrInteractiveMap} from './cormyr-interactive-map';
import {SpyLocalHouseMap} from './spy-local-house-map';
import {SPY_NOBLE_DETAIL_MAPS} from '@/lib/espionage/spy-noble-detail-maps';
import {SpyMissionOddsCard} from './spy-mission-odds-card';
import {SpySubmitHouseMission} from './spy-submit-house-mission';
import './spy-mission-planner.css';

/** Fluxo único de prévia: espião REAL -> região -> Casa -> resumo e mapa.
 * A região inicial vem exclusivamente da posição homologada do agente.
 * Criar uma prévia não desloca o espião nem publica datas no Hub Temporal.
 * A execução continua dependendo das regras protegidas do servidor.
 */
export function SpyRegionalTurnsPanel({houseId}:{houseId:string;admin?:boolean}){
 const campaignTime=useCampaignTime();
 const {data,isPending,isError,refetch}=useQuery({
  queryKey:['espionage-regional-strategy',houseId],
  queryFn:()=>readSpyRegionalStrategyBrowser(houseId),
  staleTime:30_000,retry:1,
 });
 const targetsQuery=useQuery({
  queryKey:['spy-house-public-targets'],
  queryFn:readSpyNobleHouseTargetsBrowser,staleTime:120_000,retry:1,
 });
 const [assetId,setAssetId]=useState('');
 const [destination,setDestination]=useState('');
 const [targetHouseId,setTargetHouseId]=useState('');
 const [submitted,setSubmitted]=useState<{
  operationId:string;agentName:string;targetName:string;
 }|null>(null);

 const agents=data?.agents??[];
 const selected=agents.find(a=>a.id===assetId);
 const originRegion=selected?.currentRegion??null;
 const agentAvailable=selected?.status==='available';
 const regions=allSpyRegionalBaselines();
 const houseChoices=(targetsQuery.data??[]).filter(
  h=>h.regionId===destination&&h.id!==houseId);
 const selectedTargetHouse=houseChoices.find(h=>h.id===targetHouseId);
 const originHouse=(targetsQuery.data??[]).find(h=>h.id===houseId);
 const useLocalHouseMap=Boolean(originRegion&&destination===originRegion&&
  (!originHouse||originHouse.regionId===destination)&&
  SPY_NOBLE_DETAIL_MAPS[destination]);
 const plan=selected&&destination?planSpyRegionalMission({
  agent:selected,destinationRegion:destination,
  links:cormyrPreviewLinks(data?.links??[]),
  seaAllowed:true,includeReturn:false,
 }):null;
 const ready=plan?.status==='ready';
 const houseStage=spyHouseTargetStage({
  agent:selected??null,selectedRegion:destination,
  targetHouseId,houseTargets:houseChoices,simulation:false,
 });
 const forecast=ready&&selectedTargetHouse&&campaignTime.data&&!campaignTime.isError
  ?projectSpyHarptosSchedule({
   plan,officialDate:campaignTime.data,
   calendarVersion:campaignTime.data.version,
  }):null;
 const name=(id:string)=>REGIONS[id]?.name??id;
 const chooseRegion=(id:string)=>{
  setDestination(id);
  setTargetHouseId('');
 };
 const routeError={
  unknown_destination:'A região de destino não está cadastrada.',
  unknown_agent_location:'A posição real deste espião precisa ser confirmada antes de calcular a viagem.',
  agent_in_transit:'O espião já está em viagem. Aguarde sua chegada confirmada.',
  agent_unavailable:'Este agente não está disponível para novas missões.',
  route_not_approved:'Ainda não há uma rota regional conhecida para este trajeto. O prazo depende do Narrador.',
 };
 const allSelected=Boolean(selected&&destination&&selectedTargetHouse);
 const originName=originRegion?name(originRegion):'Localização não confirmada';

 return <section className="house-panel spy-mission-planner"
  aria-label="Planejador de missão de espionagem">
  <header className="spy-planner-heading">
   <p className="campaign-eyebrow">ESTRATÉGIA DE INTELIGÊNCIA</p>
   <h3>Nova missão de espionagem</h3>
   <p>Escolha o espião e a Casa-alvo. A região atual já aparece selecionada; você pode mudá-la.</p>
  </header>

  {isPending&&<p role="status" className="spy-planner-feedback">
   Consultando seus espiões e as rotas regionais…</p>}
  {isError&&<div role="alert" className="spy-planner-feedback">
   <p>Não foi possível carregar os espiões desta Casa.</p>
   <Button type="button" size="sm" variant="outline"
    onClick={()=>void refetch()}>Consultar novamente</Button>
  </div>}

  {data&&<p className="spy-planner-availability" role="status">
   {agents.filter(a=>a.status==='available').length} disponíveis ·
   {' '}{agents.filter(a=>a.status!=='available'&&a.status!=='retired').length} indisponíveis
  </p>}
  {data&&<div className="spy-planner-steps">
   <label className="spy-planner-step">
    <span className="spy-planner-step-title"><b>1</b> Espião</span>
    <select aria-label="Agente da missão" value={assetId}
     onChange={e=>{
      const agent=agents.find(a=>a.id===e.target.value);
      setAssetId(e.target.value);
      setDestination(agent?.status==='available'?agent.currentRegion??'':'');
      setTargetHouseId('');
     }}>
     <option value="">Selecione um espião</option>
     {agents.filter(a=>a.status==='available').map(a=><option key={a.id} value={a.id}>
      {a.codename} · {a.currentRegion?name(a.currentRegion):'posição pendente'}
     </option>)}
    </select>
    {selected&&<small>Origem: {originName}</small>}
   </label>
   <label className="spy-planner-step">
    <span className="spy-planner-step-title"><b>2</b> Região de destino</span>
    <select aria-label="Região de destino" value={destination}
     disabled={!agentAvailable||!originRegion}
     onChange={e=>chooseRegion(e.target.value)}>
     <option value="">Selecione uma região</option>
     {regions.map(region=><option key={region.regionId}
      value={region.regionId}>{region.regionName}</option>)}
    </select>
    {selected&&<small>{!originRegion?'Localização do espião pendente.':
     destination===originRegion?'Região atual selecionada.':'Viagem a partir de '+originName}</small>}
   </label>
   <label className="spy-planner-step">
    <span className="spy-planner-step-title"><b>3</b> Casa a investigar</span>
    <select aria-label="Casa nobre alvo"
     value={houseChoices.some(h=>h.id===targetHouseId)?targetHouseId:''}
     disabled={!destination||targetsQuery.isPending||targetsQuery.isError}
     onChange={e=>setTargetHouseId(e.target.value)}>
     <option value="">Selecione a Casa</option>
     {houseChoices.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
    </select>
    {destination&&<small>{targetsQuery.isPending?'Carregando Casas…':
     targetsQuery.isError?'Casas indisponíveis.':
     houseChoices.length===0?'Nenhuma outra Casa homologada.':
     houseChoices.length+' Casas disponíveis.'}</small>}
   </label>
  </div>}

  {data&&targetsQuery.isError&&<div className="spy-planner-feedback" role="alert">
   A lista oficial de Casas está indisponível nesta sessão.
   <Button type="button" variant="outline" size="sm"
    onClick={()=>void targetsQuery.refetch()}>Consultar Casas novamente</Button>
  </div>}
  {data&&!agents.some(a=>a.status==='available')&&
   <p className="spy-planner-feedback" role="status">
    {agents.length===0
     ?'Esta Casa ainda não tem espiões. Crie um agente para iniciar uma missão.'
     :'Todos os espiões estão em missão ou indisponíveis. Acompanhe ou cancele a missão em Agentes e Missões.'}
   </p>}

  {submitted&&<p className="spy-planner-feedback spy-planner-submitted"
   role="status">
   <strong>Missão iniciada:</strong> {submitted.agentName} está em missão
   contra {submitted.targetName}. O deslocamento e a investigação são
   contabilizados pelo Hub Temporal.
  </p>}

  {allSelected&&selected&&selectedTargetHouse&&<div className="spy-planner-result">
   <SpyMissionOddsCard
    houseId={houseId} agentId={selected.id}
    targetHouseId={selectedTargetHouse.id} agentName={selected.codename}
    agentAvailable={agentAvailable} simulation={false}
    destinationRegion={destination}
    travelRounds={ready?plan.travelRounds:null}
    originRegion={originRegion}
    includeReturn={false} returnRounds={null}/>
   {houseStage==='requires_region_arrival'&&<p className="spy-planner-feedback" role="note">
    O espião poderá investigar {selectedTargetHouse.name} somente após chegar
    fisicamente a {name(destination)}. Este planejamento não o desloca automaticamente.
   </p>}
   {plan&&!ready&&<p className="spy-planner-feedback" role="status">
    {routeError[plan.status]}
   </p>}
   <details className="spy-planner-map-details">
    <summary>Ver trajeto no mapa</summary>
    <div className="spy-planner-map-wrap">
    <div className="spy-planner-route-caption">
     <strong>Trajeto da missão</strong>
     <span>{originName} → {name(destination)}</span>
    </div>
    {useLocalHouseMap&&selectedTargetHouse?
     <SpyLocalHouseMap regionId={destination}
      originHouseId={houseId} originHouseName={originHouse?.name??houseId}
      destinationHouseId={selectedTargetHouse.id}
      destinationHouseName={selectedTargetHouse.name}
      plan={ready?plan:null} onSelectRegion={chooseRegion}
      onSelectHouse={setTargetHouseId}/>:
     <CormyrInteractiveMap selectedRegion={destination}
      originRegion={originRegion} plan={ready?plan:null}
      onSelect={chooseRegion}/>}
    </div>
   </details>
   {ready&&agentAvailable&&originRegion&&
    <div className="spy-planner-start-row">
     <SpySubmitHouseMission
      key={selected.id+':'+selectedTargetHouse.id+':'+destination}
      houseId={houseId} agentId={selected.id} agentName={selected.codename}
      originRegion={originRegion}
      destinationRegion={destination} destinationName={name(destination)}
      targetHouseId={selectedTargetHouse.id}
      targetHouseName={selectedTargetHouse.name}
      travelRounds={plan.travelRounds}
      calendarVersion={campaignTime.data?.version??null}
      canSubmit={agentAvailable}
      onSubmitted={operationId=>{
       setSubmitted({
        operationId,agentName:selected.codename,targetName:selectedTargetHouse.name,
       });
       setAssetId('');setDestination('');setTargetHouseId('');
      }}/>
    </div>
   }
   {forecast&&<details className="spy-planner-calendar-details">
    <summary>Datas previstas pelo Hub Temporal</summary>
    <p>Partida: <strong>{formatDate(forecast.officialDateKey)}</strong></p>
    <p>Chegada: <strong>{formatDate(forecast.arrivesAtTargetDateKey)}</strong></p>
    <p>Conclusão estimada: <strong>{formatDate(forecast.investigationEndsDateKey)}</strong></p>
    <small>A estimativa não avança o calendário e não envia a missão.</small>
   </details>}
  </div>}

  {!allSelected&&data&&agentAvailable&&destination&&
   <p className="spy-planner-feedback" role="status">
    Escolha uma Casa para ver a chance de sucesso e iniciar a missão.
   </p>}
 </section>;
}
