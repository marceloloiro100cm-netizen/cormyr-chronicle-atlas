import {useId,useState} from 'react';
import type {SpyRegionalPlan} from '@/lib/espionage/region-turns';
import {CORMYR_MAPPED_REGIONS} from '@/lib/espionage/cormyr-map';
import './cormyr-interactive-map.css';

type ReadyPlan=Extract<SpyRegionalPlan,{status:'ready'}>;
type Props={
 selectedRegion:string;
 originRegion:string|null;
 plan:ReadyPlan|null;
 onSelect:(regionId:string)=>void;
};

/** Centros e áreas aproximadas dos NOMES na imagem regional fornecida pelo
 * Narrador (1443x1090). São pontos de interação, não limites oficiais;
 * a autorização de rotas é verificada no servidor separadamente.
 */
export const REGIONAL_MAP_LABEL_HOTSPOTS:Record<string,{
 x:number;y:number;width:number;height:number;pinX:number;pinY:number;
}>={
 veilstone:{x:286,y:254,width:319,height:100,pinX:400,pinY:298},
 stonelands:{x:830,y:156,width:302,height:112,pinX:976,pinY:226},
 volkumburgh:{x:1127,y:267,width:304,height:107,pinX:1253,pinY:318},
 helmlands:{x:580,y:350,width:316,height:112,pinX:710,pinY:424},
 elfhold:{x:960,y:360,width:230,height:116,pinX:1065,pinY:432},
 ferlin:{x:98,y:541,width:194,height:110,pinX:180,pinY:604},
 swordmark:{x:371,y:462,width:110,height:240,pinX:436,pinY:577},
 crownlands:{x:535,y:581,width:312,height:130,pinX:686,pinY:657},
 shieldmark:{x:958,y:581,width:322,height:142,pinX:1115,pinY:662},
 horselands:{x:138,y:816,width:340,height:138,pinX:283,pinY:893},
 dragoncoast:{x:638,y:957,width:437,height:86,pinX:820,pinY:1000},
};

/** The supplied illustration is displayed unchanged as the map surface.
 * Invisible selection zones retain the interactive region workflow.
 */
export function CormyrInteractiveMap({selectedRegion,originRegion,plan,onSelect}:Props){
 const [hovered,setHovered]=useState('');
 const titleId=useId();
 const arrowId=useId();
 const regions=Object.entries(REGIONAL_MAP_LABEL_HOTSPOTS);
 const navigate=(id:string)=>onSelect(id);
 const focus=hovered||selectedRegion;
 return <section className="cormyr-map-section" aria-label="Mapa regional de Cormyr">
  <div className="cormyr-map-heading">
   <div>
    <h4>Mapa regional de Cormyr</h4>
    <p>{originRegion&&selectedRegion
     ?'Partida: '+(CORMYR_MAPPED_REGIONS[originRegion]?.name??originRegion)+
       ' · Destino: '+(CORMYR_MAPPED_REGIONS[selectedRegion]?.name??selectedRegion)
     :'Selecione a região de destino para visualizar o percurso.'}</p>
   </div>
   <p className="cormyr-map-legend">
    <span className="cormyr-legend-start"/> Partida
    <span className="cormyr-legend-target"/> Destino
    <span className="cormyr-legend-sea"/> Travessia marítima
   </p>
  </div>
  <div className="cormyr-map-scroll">
   <svg className="cormyr-map-svg" viewBox="0 0 1443 1090" role="group"
    aria-labelledby={titleId} xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet">
    <title id={titleId}>Mapa regional ilustrado de Cormyr com onze regiões selecionáveis</title>
    <defs><marker id={arrowId} markerWidth="13" markerHeight="13" refX="9"
     refY="5" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 10 10">
     <path d="M0,0 L10,5 L0,10 Z" fill="#703b2e"/>
    </marker></defs>
    <image href="/maps/cormyr-regioes.webp" x="0" y="0" width="1443" height="1090"
     preserveAspectRatio="xMidYMid meet" aria-hidden="true"/>
    {plan&&<g className="cormyr-route" aria-hidden="true" pointerEvents="none">
     {plan.legs.map((leg,i)=>{
      const a=REGIONAL_MAP_LABEL_HOTSPOTS[leg.fromRegion];
      const end=REGIONAL_MAP_LABEL_HOTSPOTS[leg.toRegion];
      return a&&end?<line key={leg.connectionId+':'+i}
       x1={a.pinX} y1={a.pinY} x2={end.pinX} y2={end.pinY}
       stroke={leg.passage==='sea_passage'?'#29b9ed':'#65351a'}
       strokeWidth="6" strokeDasharray={leg.passage==='sea_passage'?'14 10':undefined}
       strokeLinecap="round" opacity=".92" markerEnd={i===plan.legs.length-1?
        'url(#'+arrowId+')':undefined}/>:null;
     })}
    </g>}
    {regions.map(([id,spot])=>{
     const regionName=CORMYR_MAPPED_REGIONS[id]?.name??id;
     const selected=id===selectedRegion;
     const origin=id===originRegion;
     return <g key={id} role="button" tabIndex={0}
      aria-label={regionName+'; selecionar região; '+(origin?'localização de partida; ':'')+(selected?'destino escolhido':'')}
      aria-pressed={selected}
      className={'cormyr-region'+(selected?' is-selected':'')+(origin?' is-origin':'')}
      onClick={()=>navigate(id)}
      onMouseEnter={()=>setHovered(id)} onMouseLeave={()=>setHovered('')}
      onFocus={()=>setHovered(id)} onBlur={()=>setHovered('')}
      onKeyDown={e=>{
       if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate(id);}
      }}>
      <title>{regionName} · clique ou pressione Enter para selecionar</title>
      <rect className="cormyr-region-hotspot" x={spot.x} y={spot.y}
       width={spot.width} height={spot.height} rx="18"/>
     </g>;
    })}
    {originRegion&&REGIONAL_MAP_LABEL_HOTSPOTS[originRegion]&&
     <circle className="cormyr-origin-pin" aria-hidden="true" pointerEvents="none"
      cx={REGIONAL_MAP_LABEL_HOTSPOTS[originRegion].pinX}
      cy={REGIONAL_MAP_LABEL_HOTSPOTS[originRegion].pinY} r="13"/>}
    {selectedRegion&&REGIONAL_MAP_LABEL_HOTSPOTS[selectedRegion]&&
     <circle className="cormyr-target-pin" aria-hidden="true" pointerEvents="none"
      cx={REGIONAL_MAP_LABEL_HOTSPOTS[selectedRegion].pinX}
      cy={REGIONAL_MAP_LABEL_HOTSPOTS[selectedRegion].pinY} r="10"/>}
    {focus&&REGIONAL_MAP_LABEL_HOTSPOTS[focus]&&
     <circle className="cormyr-focus-halo" aria-hidden="true" pointerEvents="none"
      cx={REGIONAL_MAP_LABEL_HOTSPOTS[focus].pinX}
      cy={REGIONAL_MAP_LABEL_HOTSPOTS[focus].pinY} r="20"/>}
   </svg>
  </div>
  <p className="cormyr-map-source" hidden aria-hidden="true">
   Mapa Regional de Cormyr fornecido pelo Narrador. As áreas clicáveis indicam os
   nomes das regiões, não fronteiras homologadas. O planejador usa as regras de
   deslocamento já aprovadas; missões operacionais exigem validação no servidor.
  </p>
 </section>;
}
