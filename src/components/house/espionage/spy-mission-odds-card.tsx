import {useQuery} from '@tanstack/react-query';
import {Target} from 'lucide-react';
import {readSpyMissionOddsBrowser} from '@/lib/espionage/spy-target-browser';
import {REGIONS} from '@/lib/house/regions';
import {spyMissionRiskAssessment} from '@/lib/espionage/spy-mission-probability';
import './spy-mission-odds-card.css';

type Props={
 houseId:string;agentId:string;targetHouseId:string;
 agentName:string;agentAvailable:boolean;simulation:boolean;
 destinationRegion:string;travelRounds:number|null;originRegion:string|null;
 includeReturn:boolean;returnRounds:number|null;
};

/** Somente a RPC protegida retorna a dificuldade agregada de UMA Casa.
 * O cartão não concede acesso à ficha privada do alvo e não inicia missões.
 */
export function SpyMissionOddsCard(props:Props){
 const enabled=Boolean(props.agentId&&props.targetHouseId&&props.agentAvailable);
 const query=useQuery({
  queryKey:['spy-mission-odds',props.houseId,props.agentId,props.targetHouseId],
  queryFn:()=>readSpyMissionOddsBrowser({
   houseId:props.houseId,agentId:props.agentId,targetHouseId:props.targetHouseId,
  }),enabled,retry:false,staleTime:30_000,
 });
 if(!props.targetHouseId)return null;

 const data=query.data;
 const success=data?.successPercent;
 const risk=data?spyMissionRiskAssessment(data.testDice,data.testDifficulty):null;
 const missionRounds=props.travelRounds===null?null:props.travelRounds+1;
 const regionName=REGIONS[props.destinationRegion]?.name??props.destinationRegion;
 const formatRounds=(n:number)=>n+' '+(n===1?'désdia':'désdias');
 const percent=success===undefined?'Indisponível':
  success===0&&data&&data.testDifficulty<=data.testDice*6
   ?'Menos de 0,1%':
   success.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 const chanceLabel=!enabled?'Agente indisponível':
  query.isPending?'Calculando…':
  query.isError?'Indisponível':percent;
 const sourceLabel=data?.source==='operational_sheet'?'Ficha operacional atual':
  data?.source==='official_spreadsheet'?'Planilha oficial das Casas':
  'Estimativa regional provisória';

 return <section className="spy-mission-preview"
  aria-label="Tempo e chance da missão">
  <header className="spy-mission-preview-heading">
   <div>
    <p className="campaign-eyebrow">PRÉVIA DA MISSÃO</p>
    <h4><Target size={19} aria-hidden="true"/> {data?.houseName??'Casa nobre escolhida'}</h4>
    <p>{props.agentName} · {regionName}</p>
   </div>
   <span>Planejamento, sem executar missão</span>
  </header>
  <div className="spy-mission-key-metrics" aria-label="Resumo da missão">
   <article className="spy-mission-key-metric">
    <small>Tempo de viagem</small>
    <strong>{props.travelRounds===null?'Rota pendente':
     formatRounds(props.travelRounds)}</strong>
    <span>{props.travelRounds===null?'Aguardando trajeto homologado':
     props.travelRounds*10+' dias ordinários'}</span>
   </article>
   <article className="spy-mission-key-metric spy-mission-key-metric--chance">
    <small>Chance estimada de sucesso</small>
    <strong aria-live="polite">{chanceLabel}</strong>
    <span>{risk?.label??'Astúcia contra a dificuldade da Casa'}</span>
   </article>
   <article className="spy-mission-key-metric">
    <small>Tempo para executar a missão</small>
    <strong>{missionRounds===null?'Rota pendente':formatRounds(missionRounds)}</strong>
    <span>{missionRounds===null?'Aguardando tempo da viagem':
     missionRounds*10+' dias ordinários · viagem + 1 désdia de investigação'}</span>
   </article>
  </div>
  {!enabled&&<p role="status" className="spy-mission-odds-status">
   O espião precisa estar disponível para consultar sua chance de sucesso.</p>}
  {enabled&&query.isPending&&<p role="status" className="spy-mission-odds-status">
   Calculando a chance com os atributos reais do agente e a Casa-alvo…</p>}
  {enabled&&query.isError&&<p role="alert" className="spy-mission-odds-status">
   Chance indisponível. Atualize a seleção do agente ou tente novamente.</p>}
  {risk&&enabled&&<p className={'spy-mission-risk spy-mission-risk--'+risk.tier}
   role="status" aria-live="polite">
   <strong>{risk.label}.</strong> {risk.advice}
  </p>}
  {data&&enabled&&<details className="spy-mission-odds-details">
   <summary>Ver detalhes do cálculo</summary>
   <div className="spy-mission-odds-facts">
    <p><strong>Graduação:</strong> {data.agentRank} · Astúcia {data.testDice}D6</p>
    <p><strong>Dificuldade do teste:</strong> {data.testDifficulty}
     {' '}({data.difficultyLabel})</p>
    <p><strong>Resistência da Casa:</strong> {data.houseDefense}
     {' '}· {sourceLabel}</p>
    <p>O sistema calcula as combinações de dados e arredonda a chance a 0,1%.
     O Narrador pode aplicar modificadores à rolagem; esta prévia não prevê descoberta, prisão ou morte.</p>
    {data.forgedDocuments&&<p><strong>Documentos falsificados:</strong>
     {' '}reduzem a gravidade de uma descoberta.</p>}
    {data.aceInTheHole&&<p><strong>Uma carta na manga:</strong>
     {' '}resultado de morte é convertido em prisão.</p>}
   </div>
  </details>}
  {props.originRegion!==props.destinationRegion&&<p className="spy-mission-odds-status">
   A investigação só poderá começar depois de a chegada à região ser registrada.
  </p>}
 </section>;
}
