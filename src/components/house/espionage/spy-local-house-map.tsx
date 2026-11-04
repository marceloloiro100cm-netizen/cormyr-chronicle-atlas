import {useState,type KeyboardEvent} from 'react';
import type {SpyRegionalPlan} from '@/lib/espionage/region-turns';
import {SPY_NOBLE_DETAIL_MAPS,spyHouseMapPoint}
 from '@/lib/espionage/spy-noble-detail-maps';
import {CormyrInteractiveMap} from './cormyr-interactive-map';
import './spy-local-house-map.css';

type ReadyPlan=Extract<SpyRegionalPlan,{status:'ready'}>;
type Props={
 regionId:string;originHouseId:string;originHouseName:string;
 destinationHouseId:string;destinationHouseName:string;
 plan:ReadyPlan|null;onSelectRegion:(region:string)=>void;
 onSelectHouse?:(houseId:string)=>void;
};
type Marker='origin'|'target';

/** Cartographic guide only: the server still decides travel and mission
 * duration. The two markers select the displayed House, never change the
 * agent's true position or authorize a mission.
 */
export function SpyLocalHouseMap({
 regionId,originHouseId,originHouseName,destinationHouseId,
 destinationHouseName,plan,onSelectRegion,onSelectHouse,
}:Props){
 const [failedImage,setFailedImage]=useState('');
 const [selectedMarker,setSelectedMarker]=useState<Marker|null>(null);
 const map=SPY_NOBLE_DETAIL_MAPS[regionId];
 const source=spyHouseMapPoint(regionId,originHouseName,originHouseId);
 const target=spyHouseMapPoint(regionId,destinationHouseName,destinationHouseId);
 const selectMarker=(marker:Marker)=>{
  setSelectedMarker(marker);
  // The player's House is never a valid target against itself.
  // Clicking the destination also keeps the mission target in sync.
  if(marker==='target')onSelectHouse?.(destinationHouseId);
 };
 const markerKeys=(event:KeyboardEvent<SVGGElement>,marker:Marker)=>{
  if(event.key==='Enter'||event.key===' '){
   event.preventDefault();
   selectMarker(marker);
  }
 };
 if(!map)return null;
 // A missing image must not hide the current kingdom map or prevent a plan.
 if(failedImage===map.src)return <div className="spy-noble-local-fallback">
  <p role="status">O mapa detalhado de {map.name} ainda não está publicado.
   O mapa geral permanece disponível.</p>
  <CormyrInteractiveMap selectedRegion={regionId}
   originRegion={regionId} plan={plan} onSelect={onSelectRegion}/>
 </div>;
 return <section className="spy-noble-local-map"
  aria-label={'Mapa de espionagem local · '+map.name}>
  <div className="spy-noble-local-legend">
   <strong>Região: {map.name} · {originHouseName} → {destinationHouseName}</strong>
   <span><i className="spy-local-origin-key"/> Sua Casa</span>
   <span><i className="spy-local-target-key"/> Casa-alvo</span>
  </div>
  <div className="spy-noble-map-stage">
   <img src={map.src} width={map.width} height={map.height}
    loading="lazy" decoding="async"
    alt={'Mapa detalhado de '+map.name+' fornecido pelo Narrador'}
    onError={()=>setFailedImage(map.src)}/>
   <svg viewBox={`0 0 ${map.width} ${map.height}`}
    className="spy-noble-map-overlay"
    aria-label="Localização e ligação entre as casas"
    role="group" preserveAspectRatio="xMidYMid meet">
    <title>Ligação entre {originHouseName} e {destinationHouseName}</title>
    {source&&target&&<g className="spy-noble-local-link" aria-hidden="true">
     <line className="spy-noble-local-route-outline"
      x1={source.x} y1={source.y} x2={target.x} y2={target.y}
      vectorEffect="non-scaling-stroke"/>
     <line className="spy-noble-local-route"
      x1={source.x} y1={source.y} x2={target.x} y2={target.y}
      vectorEffect="non-scaling-stroke"/>
    </g>}
    {source&&<g className="spy-noble-local-pin spy-noble-local-origin-pin"
     role="button" tabIndex={0}
     aria-label={'Selecionar Casa de origem: '+originHouseName}
     aria-pressed={selectedMarker==='origin'}
     onClick={()=>selectMarker('origin')}
     onKeyDown={e=>markerKeys(e,'origin')}>
     <title>{'Sua Casa: '+originHouseName}</title>
     <circle className="spy-noble-local-pin-halo"
      cx={source.x} cy={source.y} r={map.width/58}/>
     <circle className="spy-noble-local-pin-center"
      cx={source.x} cy={source.y} r={map.width/280}/>
     <circle className="spy-noble-local-hit"
      cx={source.x} cy={source.y} r={map.width/27}/>
    </g>}
    {target&&<g className="spy-noble-local-pin spy-noble-local-target-pin"
     role="button" tabIndex={0}
     aria-label={'Selecionar Casa-alvo: '+destinationHouseName}
     aria-pressed={selectedMarker==='target'}
     onClick={()=>selectMarker('target')}
     onKeyDown={e=>markerKeys(e,'target')}>
     <title>{'Casa-alvo: '+destinationHouseName}</title>
     <circle className="spy-noble-local-pin-halo"
      cx={target.x} cy={target.y} r={map.width/58}/>
     <circle className="spy-noble-local-pin-center"
      cx={target.x} cy={target.y} r={map.width/280}/>
     <circle className="spy-noble-local-hit"
      cx={target.x} cy={target.y} r={map.width/27}/>
    </g>}
   </svg>
  </div>
  {selectedMarker&&<p className="spy-noble-local-selection" role="status">
   <strong>Casa selecionada:</strong>{' '}
   {selectedMarker==='origin'?originHouseName:destinationHouseName}
   {' · '}{selectedMarker==='origin'?'Origem da missão':'Destino da missão'}
  </p>}
  {(!source||!target)&&<p className="spy-noble-local-note" role="note">
   {!source&&!target?'As duas Casas ainda não têm posição cartográfica confirmada.':
     !source?'A posição da sua Casa ainda não está identificada neste mapa.':
     'A posição da Casa-alvo ainda não está identificada neste mapa.'}
   {' '}O mapa permanece visível, mas não desenhamos uma rota sobre
   localizações desconhecidas.
  </p>}
 </section>;
}
