import { Shield, Crown, Mountain, Scale, Users, Swords, Coins } from 'lucide-react';
import { balances } from '@/lib/house/engine';
import { RESOURCE_KEYS, RESOURCE_NAMES, type HouseState } from '@/lib/house/types';
import { HOUSE_CHART_MAX, houseResourceChart } from '@/lib/house/resource-chart';
const ICONS={defense:Shield,influence:Crown,lands:Mountain,law:Scale,population:Users,power:Swords,wealth:Coins};
export function ResourceSummary({state}:{state:HouseState}) {const b=balances(state);return <div className="house-resource-bar" aria-label="Resumo dos recursos">{RESOURCE_KEYS.map(r=>{const Icon=ICONS[r];return <div key={r} className="house-resource"><div><Icon size={16}/><span>{RESOURCE_NAMES[r]}</span></div><strong>{b.available[r].toLocaleString('pt-BR')}<small>disponível</small></strong><details><summary>Total {b.total[r]}</summary><dl><dt>Alocado</dt><dd>{b.allocated[r]}</dd><dt>Em obras</dt><dd>{b.committed[r]}</dd><dt>Ganhos / perdas</dt><dd>{b.permanent[r]}</dd></dl></details></div>;})}</div>;}
export function ResourceChart({state}:{state:HouseState}) {
  return <section className="house-resource-chart" aria-label="Visão gráfica dos atributos da casa">
    <div className="house-section-heading"><h3>Atributos da casa</h3><span className="house-caption">Pontuação total · escala 0–{HOUSE_CHART_MAX}</span></div>
    <div className="house-chart-grid">{houseResourceChart(state).map(({resource,total,plotted})=>{const Icon=ICONS[resource];return <div className="house-chart-item" key={resource}><div><span><Icon size={16}/>{RESOURCE_NAMES[resource]}</span><strong>{total.toLocaleString('pt-BR')}</strong></div><progress max={HOUSE_CHART_MAX} value={plotted} aria-label={`${RESOURCE_NAMES[resource]}: ${total} pontos`} /><div className="house-chart-scale"><span>0</span><span>{HOUSE_CHART_MAX}</span></div></div>;})}</div>
    {state.identity.history.length>0&&<details><summary>Eventos históricos</summary><ul className="house-chart-events">{state.identity.history.map((event,i)=><li key={i}>{event}</li>)}</ul></details>}
  </section>;
}