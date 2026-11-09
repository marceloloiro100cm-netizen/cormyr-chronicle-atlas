import './battle-ux-lots-4-6.css';

type SideLoss=Readonly<{label:string;count:number}>;
/** Mesmo contrato visual de resultado nos três conjuntos de regras. */
export function BattleOutcomeSummary({title,round,reason,losses=[]}:{
 title:string;round:number;reason?:string|undefined;
 losses?:readonly SideLoss[];
}){
 return <section className="battle-outcome-summary" aria-label="Resultado resumido">
  <h3>{title}</h3>
  <p>Rodada {round}{reason?' · '+reason:''}</p>
  {losses.length>0&&<ul>
   {losses.map(side=><li key={side.label}>
    <span>{side.label}</span><strong>{side.count} baixas</strong>
   </li>)}
  </ul>}
 </section>;
}
