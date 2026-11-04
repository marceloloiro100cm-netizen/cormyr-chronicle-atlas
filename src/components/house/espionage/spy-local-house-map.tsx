import {useId,useState} from 'react';
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
};

/** Local house-to-house illustration, using only the banner positions
 * visibly named on the Narrator's map. The geographic illustration never
 * invents travel days or authorizes an operation: the existing planner and
 * SQL remain the authoritative route and mission-duration calculators.
 */
export function SpyLocalHouseMap({
 regionId,originHouseId,originHouseName,destinationHouseId,
 destinationHouseName,plan,onSelectRegion,
}:Props){
 const [failedImage,setFailedImage]=useState('');
 const arrowId=useId();
 const map=SPY_NOBLE_DETAIL_MAPS[regionId];
 const source=spyHouseMapPoint(regionId,originHouseName,originHouseId);
 const target=spyHouseMapPoint(regionId,destinationHouseName,destinationHouseId);
 if(!map)return null;
 // Missing assets must not turn the existing working kingdom map into a
 // blank panel while the static cartography bundle is being installed.
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
    className="spy-noble-map-overlay" aria-label="Localização e trajeto entre Casas"
    role="img" preserveAspectRatio="xMidYMid meet">
    <title>Trajeto de {originHouseName} até {destinationHouseName}</title>
    <defs><marker id={arrowId} markerWidth="12" markerHeight="12"
     refX="9" refY="5" orient="auto" viewBox="0 0 10 10">
     <path d="M0 0L10 5L0 10Z" fill="#8a2639"/>
    </marker></defs>
    {source&&target&&<line className="spy-noble-local-route"
     x1={source.x} y1={source.y} x2={target.x} y2={target.y}
     markerEnd={'url(#'+arrowId+')'}/>}
    {source&&<g className="spy-noble-local-pin spy-noble-local-origin-pin">
     <title>{'Origem: '+originHouseName}</title>
     <circle cx={source.x} cy={source.y} r={map.width/115}/>
     <circle cx={source.x} cy={source.y} r={map.width/350}/>
    </g>}
    {target&&<g className="spy-noble-local-pin spy-noble-local-target-pin">
     <title>{'Destino: '+destinationHouseName}</title>
     <circle cx={target.x} cy={target.y} r={map.width/115}/>
     <circle cx={target.x} cy={target.y} r={map.width/350}/>
    </g>}
   </svg>
  </div>
  {(!source||!target)&&<p className="spy-noble-local-note" role="note">
   {!source&&!target?'As duas Casas ainda não têm posição cartográfica confirmada.':
     !source?'A posição da sua Casa ainda não está identificada neste mapa.':
     'A posição da Casa-alvo ainda não está identificada neste mapa.'}
   {' '}O mapa permanece visível, mas não desenhamos uma rota sobre
   localizações desconhecidas.
  </p>}
  <p className="spy-noble-local-footnote">
   Traçado ilustrativo entre as bandeiras, não uma estrada oficial.
   O cálculo da missão continua seguindo as regras vigentes.
  </p>
 </section>;
}
