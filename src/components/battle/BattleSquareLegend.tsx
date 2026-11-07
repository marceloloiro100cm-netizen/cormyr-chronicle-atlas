import {SQUARE_TERRAIN_PRESENTATION,SQUARE_MAP_CONTRACT}
 from '@/lib/battle/geometry/square-presentation';
import './battle-square-legend.css';

/** Shared *presentation* for GOT, Adaptado and D&D/CRZ.
 * Game logic, pathfinding and each ruleset's terrain effects stay independent.
 */
export function BattleSquareLegend({showActions=true}:{showActions?:boolean}){
 return <div className="battle-square-legend" role="group" aria-label="Legenda comum de mapas quadrados">
  <strong>{SQUARE_MAP_CONTRACT}</strong>
  <div className="battle-square-legend-items">
   {Object.entries(SQUARE_TERRAIN_PRESENTATION).map(([id,t])=>
    <span key={id} className="battle-square-legend-item">
     <span className="battle-square-legend-swatch" style={{backgroundColor:t.color}}
      aria-hidden="true">{t.symbol}</span>{t.name}
    </span>)}
   {showActions&&<>
    <span className="battle-square-legend-item"><span className="battle-square-legend-ring move"
     aria-hidden="true"/> Verde: mover</span>
    <span className="battle-square-legend-item"><span className="battle-square-legend-ring attack"
     aria-hidden="true"/> Vermelho: atacar</span>
   </>}
  </div>
  <small>Os custos, atributos, deslocamentos e habilidades seguem as regras do modo selecionado.</small>
 </div>;
}
