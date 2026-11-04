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
import {SpyMissionOddsCard} from './spy-mission-odds-card';
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

 const agents=data?.agents??[];
 const selected=agents.find(a=>a.id===assetId);
 const originRegion=selected?.currentRegion??null;
 const agentAvailable=selected?.status==='available';
 const regions=allSpyRegionalBaselines();
 const houseChoices=(targetsQuery.data??[]).filter(
  h=>h.regionId===destination&&h.id!==houseId);
 const selectedTargetHouse=houseChoices.find(h=>h.id===targetHouseId);
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
   <h3>Planejador de missão de espionagem</h3>
   <p>Escolha seu espião, a região de destino e a Casa que deseja investigar.
    O tempo, a chance de sucesso e o caminho aparecem abaixo.</p>
  </header>

  {isPending&&<p role="status" className="spy-planner-feedback">
   Consultando seus espiões e as rotas regionais…</p>}
  {isError&&<div role="alert" className="spy-planner-feedback">
   <p>Não foi possível carregar os espiões desta Casa.</p>
   <Button type="button" size="sm" variant="outline"
    onClick={()=>void refetch()}>Consultar novamente</Button>
  </div>}

  {data&&<div className="spy-planner-steps">
   <label className="spy-planner-step">
    <span className="spy-planner-step-title"><b>1</b> Espião</span>
    <select aria-label="Agente da missão" value={assetId}
     onChange={e=>{setAssetId(e.target.value);setDestination('');setTargetHouseId('');}}>
     <option value="">Selecione um espião</option>
     {agents.filter(a=>a.status!=='retired').map(a=><option
      key={a.id} value={a.id} disabled={a.status!=='available'}>
      {a.codename} · {a.currentRegion?name(a.currentRegion):'posição pendente'}
      {a.status==='available'?' · disponível':' · indisponível'}
     </option>)}
    </select>
    <small>{selected
     ?'Origem atual: '+originName+' · definida automaticamente pela ficha do agente'
     :'A origem é a posição atual registrada do espião.'}</small>
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
    <small>{!assetId?'Primeiro escolha um espião.':
     !originRegion?'Localização real pendente de confirmação.':
     destination?'Partida: '+originName+' · Chegada: '+name(destination):
     'Pode ser a mesma região em que o espião está.'}</small>
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
    <small>{!destination?'Escolha a região para ver as Casas.':
     targetsQuery.isPending?'Carregando Casas da região…':
     targetsQuery.isError?'Lista indisponível.':
     houseChoices.length===0?'Nenhuma outra Casa homologada nessa região.':
     houseChoices.length+' Casas nobres disponíveis nesta região.'}</small>
   </label>
  </div>}

  {data&&targetsQuery.isError&&<div className="spy-planner-feedback" role="alert">
   A lista oficial de Casas está indisponível nesta sessão.
   <Button type="button" variant="outline" size="sm"
    onClick={()=>void targetsQuery.refetch()}>Consultar Casas novamente</Button>
  </div>}
  {data&&!agents.some(a=>a.status==='available')&&
   <p className="spy-planner-feedback" role="status">
    Nenhum espião disponível. Crie um agente ou aguarde a conclusão de suas missões.</p>}

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
   <div className="spy-planner-map-wrap">
    <div className="spy-planner-route-caption">
     <strong>Trajeto da missão</strong>
     <span>{originName} → {name(destination)}</span>
    </div>
    <CormyrInteractiveMap selectedRegion={destination}
     originRegion={originRegion} plan={ready?plan:null}
     onSelect={chooseRegion}/>
   </div>
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
    Selecione a Casa nobre para visualizar o tempo, a chance e o trajeto da missão.
   </p>}
 </section>;
}
