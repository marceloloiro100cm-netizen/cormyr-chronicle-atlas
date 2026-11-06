import type {BattleScenarioId} from '@/lib/battle/geometry/map-fixtures';
import {V38_THEATRES,createV38TheatreMap,v38TileCounts,
 type V38TheatreId} from '@/lib/battle/v3/theatres-v38';

export function BattleV38TheatreChooser({selected,onChange,scenario}:{
 selected:V38TheatreId|null;onChange:(next:V38TheatreId|null)=>void;
 scenario:BattleScenarioId;
}){
 const chosen=V38_THEATRES.find(item=>item.id===selected);
 const counts=chosen?v38TileCounts(createV38TheatreMap(chosen.id,scenario)):null;
 return <section className="crusade-v38-selector" aria-label="Teatros temáticos de Cormyr">
  <div className="crusade-v38-heading">
   <div>
    <p className="battle-eyebrow">CAMPANHA DE TREINAMENTO · MAPAS V3.8</p>
    <h3>Escolha seu campo de batalha</h3>
    <p>Os mapas temáticos usam terreno real do simulador: floresta e colina
     custam 2 de movimento; rocha bloqueia movimento e visão.
     Elementos ilustrativos não criam regras ocultas.</p>
   </div>
  </div>
  <div className="crusade-v38-theatre-grid" role="group" aria-label="Selecionar região do campo">
   <button type="button" className={'crusade-v38-theatre'+(selected===null?' selected':'')}
    aria-pressed={selected===null} onClick={()=>onChange(null)}>
    <span className="crusade-v38-theatre-icon" aria-hidden="true">⚔</span>
    <strong>Mapa tradicional</strong><small>Terreno padrão PTE-2.0</small>
    <span className="crusade-v38-theatre-caption">Nenhuma ambientação regional</span>
   </button>
   {V38_THEATRES.map(theatre=><button key={theatre.id} type="button"
    className={'crusade-v38-theatre'+(selected===theatre.id?' selected':'')}
    style={{borderColor:selected===theatre.id?theatre.accent:undefined,
     background:`linear-gradient(145deg, ${theatre.sky}, ${theatre.earth} 80%)`}}
    aria-pressed={selected===theatre.id} onClick={()=>onChange(theatre.id)}>
    <span className="crusade-v38-theatre-icon" aria-hidden="true">{theatre.icon}</span>
    <strong>{theatre.name}</strong><small>{theatre.subtitle}</small>
    <span className="crusade-v38-theatre-caption">{theatre.description}</span>
   </button>)}
  </div>
  {counts&&chosen&&<p className="crusade-v38-scenario-summary" role="status">
   <strong>{chosen.name}:</strong> {counts.plain} planícies · {counts.forest} florestas ·
    {counts.hill} colinas · {counts.rock} obstáculos rochosos.
   <span> Cenário fictício de teste, sem impacto nas casas ou no Hub Temporal.</span>
  </p>}
 </section>;
}
