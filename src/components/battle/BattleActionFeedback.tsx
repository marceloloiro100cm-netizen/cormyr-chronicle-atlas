import './battle-ux-lots-4-6.css';

type Props={
 round:number;label:string;
 damage?:number|undefined;casualties?:number|undefined;
 detail?:string|undefined;
};
/** Resumo de uma ação já resolvida pelo motor. Nunca recalcula dano. */
export function BattleActionFeedback({round,label,damage,casualties,detail}:Props){
 const message=label.trim().slice(0,140);
 return <section className="battle-action-feedback" aria-label="Última jogada"
  aria-live="polite" aria-atomic="true">
  <strong>Última jogada</strong>
  <span>R{round} · {message}</span>
  {typeof damage==='number'&&
   <b>{damage} PV{typeof casualties==='number'?' · '+casualties+' baixas':''}</b>}
  {detail&&<details><summary>Detalhes</summary><p>{detail}</p></details>}
 </section>;
}
