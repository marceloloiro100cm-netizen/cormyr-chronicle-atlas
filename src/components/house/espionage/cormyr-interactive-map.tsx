import {useId,useState} from 'react';
import {REGIONS} from '@/lib/house/regions';
import type {SpyRegionalPlan} from '@/lib/espionage/region-turns';
import {
 CORMYR_MAPPED_REGIONS,CORMYR_MAP_VIEWBOX,CORMYR_MAP_SOURCE,
} from '@/lib/espionage/cormyr-map';
import './cormyr-interactive-map.css';

type ReadyPlan=Extract<SpyRegionalPlan,{status:'ready'}>;
type Props={
 selectedRegion:string;
 originRegion:string|null;
 plan:ReadyPlan|null;
 onSelect:(regionId:string)=>void;
};

/** A region-selecting SVG (not a flat image). The outline is hand-digitized
 * from the supplied political map and remains stable if no server is online.
 * Live agent positions and maritime paths are never inferred from the SVG.
 */
export function CormyrInteractiveMap({selectedRegion,originRegion,plan,onSelect}:Props){
 const [hovered,setHovered]=useState('');
 const titleId=useId();
 const regions=Object.entries(CORMYR_MAPPED_REGIONS);
 const focus=hovered||selectedRegion||'';
 const navigate=(id:string)=>onSelect(id);
 return <section className="cormyr-map-section" aria-label="Mapa regional de Cormyr">
  <div className="cormyr-map-heading">
   <div>
    <h4>Mapa interativo · Regiões de Cormyr</h4>
    <p>Toque em qualquer região para definir o destino. A origem é a posição do espião selecionado ou a origem simulada.</p>
   </div>
   <p className="cormyr-map-legend"><span className="cormyr-legend-start"/> Partida <span className="cormyr-legend-target"/> Destino <span className="cormyr-legend-sea"/> Mar aprovado</p>
  </div>
  <div className="cormyr-map-scroll" tabIndex={0} aria-label="Mapa deslocável horizontalmente em telas pequenas">
   <svg className="cormyr-map-svg" viewBox={CORMYR_MAP_VIEWBOX} role="group"
    aria-labelledby={titleId} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <title id={titleId}>Mapa político de Cormyr: onze regiões selecionáveis</title>
    <defs>
     <linearGradient id="cormyr-lake-gradient" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#adc7e9"/>
      <stop offset="100%" stopColor="#6c95c8"/>
     </linearGradient>
     <pattern id="cormyr-background-grain" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M0 47L48 47" stroke="#c7d7e2" strokeOpacity=".27" strokeWidth=".75"/>
     </pattern>
    </defs>
    <rect width="1628" height="888" fill="#eaf2f7"/>
    <rect width="1628" height="888" fill="url(#cormyr-background-grain)"/>
    <g className="cormyr-land">
     {regions.map(([id,region])=>{
      const selected=id===selectedRegion,origin=id===originRegion;
      return <g key={id} role="button" tabIndex={0}
       aria-label={`${region.name}; selecionar região; ${origin?'localização de partida; ':''}${selected?'destino escolhido':''}`}
       aria-pressed={selected}
       className={`cormyr-region${selected?' is-selected':''}${origin?' is-origin':''}`}
       onClick={()=>navigate(id)}
       onMouseEnter={()=>setHovered(id)}
       onMouseLeave={()=>setHovered('')}
       onFocus={()=>setHovered(id)}
       onBlur={()=>setHovered('')}
       onKeyDown={event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate(id);}
       }}>
       <title>{region.name} · clique para selecionar</title>
       <path className="cormyr-region-footprint" d={region.path}
        fill={region.fill} stroke={region.fill} strokeWidth="10" strokeLinejoin="round"/>
       <path className="cormyr-region-outline" d={region.path}
        fill="none" stroke="#70849a" strokeWidth="1.7" strokeLinejoin="round"
        pointerEvents="none" opacity=".78"/>
      </g>;
     })}
    </g>
    <g aria-hidden="true" pointerEvents="none">
     <path d="M645 649 Q745 592 838 630 Q936 649 997 661 Q1094 653 1164 692 Q1206 708 1288 717 Q1442 719 1590 724 L1628 724 1628 818 Q1500 747 1368 778 Q1194 794 1102 770 Q1036 743 929 766 Q775 697 709 744 Q648 727 645 649Z"
      fill="url(#cormyr-lake-gradient)" fillOpacity=".93"
      stroke="#638bb8" strokeWidth="3"/>
     <text x="910" y="697" className="cormyr-lake-text">Lago dos Dragões</text>
     <text x="910" y="720" className="cormyr-lake-subtitle">DRAGONMERE</text>
     <path d="M885 719Q928 714 978 729" fill="none" stroke="#d5e5f2" strokeWidth="2"/>
     <text x="1540" y="70" className="cormyr-compass">N</text>
     <path d="M1540 78l-11 34 11-8 11 8Z" fill="#7389a3"/>
    </g>
    {plan&&<g className="cormyr-route" aria-hidden="true" pointerEvents="none">
     {plan.legs.map((leg,i)=>{
      const a=CORMYR_MAPPED_REGIONS[leg.fromRegion];
      const end=CORMYR_MAPPED_REGIONS[leg.toRegion];
      return a&&end?<line key={leg.connectionId+':'+i}
       x1={a.centerX} y1={a.centerY} x2={end.centerX} y2={end.centerY}
       stroke={leg.passage==='sea_passage'?'#086c91':'#243a68'}
       strokeWidth="6" strokeDasharray={leg.passage==='sea_passage'?'14 10':undefined}
       strokeLinecap="round" opacity=".9"/>:null;
     })}
    </g>}
    <g className="cormyr-map-labels" pointerEvents="none" aria-hidden="true">
     {regions.map(([id,region])=><text key={id}
      transform={region.labelRotation?`rotate(${region.labelRotation} ${region.labelX} ${region.labelY})`:undefined}
      x={region.labelX} y={region.labelY}
      className={`cormyr-region-name${id===focus?' is-highlighted':''}`}
      fontSize={id==='swordmark'?20:id==='volkumburgh'?21:id==='dragoncoast'?23:25}>
      {region.name.toUpperCase()}
     </text>)}
    </g>
    {originRegion&&CORMYR_MAPPED_REGIONS[originRegion]&&
     <circle className="cormyr-origin-pin" aria-hidden="true" pointerEvents="none"
      cx={CORMYR_MAPPED_REGIONS[originRegion].centerX}
      cy={CORMYR_MAPPED_REGIONS[originRegion].centerY}
      r="13"/>}
    {selectedRegion&&CORMYR_MAPPED_REGIONS[selectedRegion]&&
     <circle className="cormyr-target-pin" aria-hidden="true" pointerEvents="none"
      cx={CORMYR_MAPPED_REGIONS[selectedRegion].centerX}
      cy={CORMYR_MAPPED_REGIONS[selectedRegion].centerY}
      r="10"/>}
   </svg>
  </div>
  <div className="cormyr-map-mobile-regions" aria-label="Alternativa de seleção para dispositivos pequenos">
   {regions.map(([id,region])=><button key={id} type="button"
    aria-pressed={selectedRegion===id}
    onClick={()=>navigate(id)}>{region.name}</button>)}
  </div>
  <p className="cormyr-map-source">{CORMYR_MAP_SOURCE}. Contornos simplificados para seleção regional; cidades, estradas e portos não foram vetorizados. Crownlands, Shieldmark e Dragon Coast: qualquer travessia direta entre essas regiões pelo Dragonmere dura 1 désdia, por confirmação do Narrador. Outras passagens marítimas exigem homologação.</p>
 </section>;
}
