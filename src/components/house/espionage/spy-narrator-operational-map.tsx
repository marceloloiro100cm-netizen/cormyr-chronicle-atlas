import {useState} from 'react';
import type {SpyNarratorOperation} from '@/lib/espionage/spy-operations-browser';
import {CORMYR_MAPPED_REGIONS} from '@/lib/espionage/cormyr-map';
import {SPY_NOBLE_DETAIL_MAPS,spyHouseMapPoint} from '@/lib/espionage/spy-noble-detail-maps';
import {formatDate,parseDate} from '@/lib/calendar/harptos';
import {CormyrInteractiveMap} from './cormyr-interactive-map';
import './spy-narrator-operational-map.css';

type Props={operation:SpyNarratorOperation|null};

/** Cartographic hint only, never the canonical region of a House or an agent.
 * A name printed on more than one map is ambiguous and must not be guessed.
 */
export function spyNarratorUniqueMapRegion(name:string,houseId?:string):string|null{
 const candidates=Object.keys(SPY_NOBLE_DETAIL_MAPS).filter(region=>
  spyHouseMapPoint(region,name,houseId)!=null);
 return candidates.length===1?candidates[0]!:null;
}

const dateLabel=(value:string|null)=>value&&parseDate(value)?formatDate(value):'Não informada';

/** Read-only narrator visualization. Routes, travel dates and agent positions
 * remain server-authoritative. These illustrated markers are NOT live GPS.
 */
export function SpyNarratorOperationalMap({operation}:Props){
 const [choice,setChoice]=useState<{operationId:string;region:string}|null>(null);
 const [failedImage,setFailedImage]=useState('');
 if(!operation)return <section className="spy-narrator-map-panel" aria-label="Cartografia de espionagem">
  <p className="house-caption">Selecione uma operação para consultar sua cartografia.</p>
 </section>;
 const sourceRegion=spyNarratorUniqueMapRegion(operation.ownerHouseName,operation.ownerHouseId);
 const targetRegion=spyNarratorUniqueMapRegion(operation.targetHouseName,operation.targetHouseId);
 const selected=choice?.operationId===operation.operationId?choice.region:(targetRegion??'');
 const map=selected?SPY_NOBLE_DETAIL_MAPS[selected]:null;
 const source=map?spyHouseMapPoint(selected,operation.ownerHouseName,operation.ownerHouseId):null;
 const target=map?spyHouseMapPoint(selected,operation.targetHouseName,operation.targetHouseId):null;
 const regionOptions=Object.entries(SPY_NOBLE_DETAIL_MAPS)
  .sort((a,b)=>a[1].name.localeCompare(b[1].name,'pt-BR'));
 const select=(region:string)=>setChoice({operationId:operation.operationId,region});
 return <section className="spy-narrator-map-panel" aria-label="Cartografia estratégica do Narrador">
  <header className="spy-narrator-map-heading">
   <div>
    <strong>Cartografia operacional · {operation.ownerHouseName} → {operation.targetHouseName}</strong>
    <p className="house-caption">{operation.agentName} · {operation.status==='pending_narrator_review'
     ?'Aguardando julgamento':operation.status==='traveling'?'Em viagem':
      operation.status==='operating'?'Investigando':'Registro da campanha'}</p>
   </div>
   <label>Mapa
    <select value={selected} onChange={event=>select(event.target.value)}>
     <option value="">Reino de Cormyr · 11 regiões</option>
     {regionOptions.map(([id,item])=><option value={id} key={id}>{item.name}</option>)}
    </select>
   </label>
  </header>
  {map&&failedImage!==map.src?<div className="spy-narrator-map-stage"
   style={{aspectRatio:map.width+' / '+map.height}}>
   <img src={map.src} width={map.width} height={map.height} alt={'Mapa oficial ilustrado de '+map.name}
    loading="lazy" decoding="async" onError={()=>setFailedImage(map.src)}/>
   <svg viewBox={'0 0 '+map.width+' '+map.height} role="img"
    aria-label="Marcadores cartográficos das Casas cuja posição foi identificada"
    preserveAspectRatio="xMidYMid meet">
    <title>Casas identificadas no mapa de {map.name}</title>
    {source&&<g className="spy-narrator-map-origin">
     <circle cx={source.x} cy={source.y} r="15"/>
     <text x={Math.max(55,Math.min(map.width-65,source.x))} y={source.y-24}
      textAnchor="middle">Origem</text>
    </g>}
    {target&&<g className="spy-narrator-map-target">
     <circle cx={target.x} cy={target.y} r="15"/>
     <text x={Math.max(55,Math.min(map.width-65,target.x))} y={target.y+38}
      textAnchor="middle">Alvo</text>
    </g>}
   </svg>
  </div>:<div className="spy-narrator-map-kingdom">
   {map&&failedImage===map.src&&<p role="alert">O mapa regional não carregou. Exibindo o mapa geral.</p>}
   <CormyrInteractiveMap selectedRegion={targetRegion??''}
    originRegion={sourceRegion} plan={null} onSelect={select}/>
  </div>}
  {map&&(!source||!target)&&<p className="house-caption">
   {!source&&!target?'As Casas não possuem marcadores identificados neste mapa.':
    !source?'A origem não possui marcador identificado nesta região.':
    'O alvo não possui marcador identificado nesta região.'}
   {' '}Nenhuma posição será inventada.
  </p>}
  <div className="spy-narrator-map-timeline" aria-label="Datas oficiais registradas da missão">
   <div><small>Partida</small><strong>{dateLabel(operation.departureKey)}</strong></div>
   <div><small>Chegada</small><strong>{dateLabel(operation.arrivalKey)}</strong></div>
   <div><small>Fim da investigação</small><strong>{dateLabel(operation.investigationEndKey)}</strong></div>
  </div>
  <p className="house-caption">Os marcadores indicam estandartes na cartografia da campanha, não a
   posição atual do agente. O percurso e as datas são determinados pelo servidor; este painel
   não cria nem avança missões.</p>
 </section>;
}
