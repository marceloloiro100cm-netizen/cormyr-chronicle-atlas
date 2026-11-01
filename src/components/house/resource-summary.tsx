import { Shield, Crown, Mountain, Scale, Users, Swords, Coins } from 'lucide-react';
import { balances, maxHouseStatus } from '@/lib/house/engine';
import { RESOURCE_KEYS, RESOURCE_NAMES, type HouseState } from '@/lib/house/types';
import { HOUSE_CHART_MAX, houseResourceChart } from '@/lib/house/resource-chart';
import { fortuneLawModifier, fortunePopulationModifier } from '@/lib/house/fortune';
const ICONS={defense:Shield,influence:Crown,lands:Mountain,law:Scale,population:Users,power:Swords,wealth:Coins};
const DESCRIPTIONS={
 defense:'Fortificações, castelos e capacidade defensiva',
 influence:'Prestígio, alianças e posição social da família',
 lands:'Territórios, características e comunidades controladas',
 law:'Ordem, autoridade local e estabilidade das terras',
 population:'Habitantes, produção e mão de obra',
 power:'Tropas, guarnições e força militar',
 wealth:'Rendas, comércio e infraestrutura econômica',
} as const;
function scoreBand(value:number){
 if(value<=10)return '0–10';
 if(value<=20)return '11–20';
 if(value<=30)return '21–30';
 if(value<=40)return '31–40';
 if(value<=50)return '41–50';
 if(value<=60)return '51–60';
 if(value<=70)return '61–70';
 return '71 ou mais';
}
const signed=(n:number)=>n>0?'+'+n:String(n);
export function ResourceSummary({state}:{state:HouseState}) {
 const b=balances(state);
 const effects=Object.fromEntries(RESOURCE_KEYS.map(resource=>[resource,{
   allocated:(state.mailConsequences??[]).filter(event=>event.active).reduce((sum,event)=>sum+Math.max(0,-(event.changes[resource]??0)),0),
   bonus:(state.mailConsequences??[]).filter(event=>event.active).reduce((sum,event)=>sum+Math.max(0,event.changes[resource]??0),0),
 }])) as Record<typeof RESOURCE_KEYS[number],{allocated:number;bonus:number}>;
 return <div className="house-resource-bar" aria-label="Resumo dos recursos">{RESOURCE_KEYS.map(r=>{const Icon=ICONS[r];return <div key={r} className="house-resource"><div><Icon size={16}/><span>{RESOURCE_NAMES[r]}</span></div><strong>{b.total[r].toLocaleString('pt-BR')}<small>Total</small></strong>{r==='influence'&&<p className="house-caption">Status Máx. do Lorde: <strong>{maxHouseStatus(b.total.influence)}</strong></p>}<details><summary>{b.available[r]} disponível</summary><dl><dt>Alocado</dt><dd>{b.allocated[r]}</dd><dt>Em obras</dt><dd>{b.committed[r]}</dd><dt>Ganhos / perdas</dt><dd>{b.permanent[r]}</dd>
{(effects[r].allocated>0||effects[r].bonus>0)&&<>
 <dt>Missivas · eventos</dt>
 <dd>{effects[r].allocated>0?`${effects[r].allocated} alocado`:''}{effects[r].allocated>0&&effects[r].bonus>0?' · ':''}{effects[r].bonus>0?`+${effects[r].bonus} bônus`:''}</dd>
</>}</dl>
<p className="house-caption">Faixa da pontuação: {scoreBand(b.total[r])} · {DESCRIPTIONS[r]}.</p>
{r==='law'&&<p className="house-caption">Modificador de Lei na Sorte da Casa: <strong>{signed(fortuneLawModifier(b.total.law))}</strong></p>}
{r==='population'&&<p className="house-caption">Modificador de População na Sorte da Casa: <strong>{signed(fortunePopulationModifier(b.total.population))}</strong></p>}
{r==='influence'&&<p className="house-caption">Status máximo do Lorde: <strong>{maxHouseStatus(b.total.influence)}</strong></p>}
</details></div>;})}</div>;}
export function ResourceChart({state}:{state:HouseState}) {
 const chart=houseResourceChart(state),scale=chart[0]?.scale??HOUSE_CHART_MAX;
 return <section className="house-resource-chart" aria-label="Visão gráfica dos atributos da casa">
   <div className="house-section-heading"><h3>Atributos da casa</h3><span className="house-caption">Pontos totais e sua destinação · escala dinâmica 0–{scale}</span></div>
   <div className="house-chart-legend" aria-label="Legenda">
     <span><i className="house-segment-swatch house-segment-allocated"/> Alocado</span>
     <span><i className="house-segment-swatch house-segment-building"/> Em obras</span>
     <span><i className="house-segment-swatch house-segment-free"/> Disponível</span>
   </div>
   <div className="house-chart-grid">{chart.map(({resource,total,allocated,committed,available,deficit})=>{
    const Icon=ICONS[resource];
    return <div className="house-chart-item" key={resource}>
      <div><span><Icon size={16}/>{RESOURCE_NAMES[resource]}</span><strong>{total.toLocaleString('pt-BR')}</strong></div>
      <div role="img" className="house-stacked-bar" aria-label={`${RESOURCE_NAMES[resource]}: ${allocated} alocado, ${committed} em obras, ${available} disponível, total ${total}`}>
        <span className="house-segment house-segment-allocated" style={{width:`${allocated/scale*100}%`}}/>
        <span className="house-segment house-segment-building" style={{width:`${committed/scale*100}%`}}/>
        <span className="house-segment house-segment-free" style={{width:`${available/scale*100}%`}}/>
      </div>
      <div className="house-chart-scale"><span>0</span><span>{scale}</span></div>
      <p className="house-caption">Alocado {allocated} · Em obras {committed} · Disponível {available}{deficit>0?` · Déficit ${deficit}`:''}</p>
    </div>;
   })}</div>
   {state.identity.history.length>0&&<details><summary>Eventos históricos</summary><ul className="house-chart-events">{state.identity.history.map((event,i)=><li key={i}>{event}</li>)}</ul></details>}
 </section>;
}
