import {Button} from '@/components/ui/button';
import type {WarBattle} from '@/lib/battle/got/types';
import './battle-got-guide.css';

type Phase=WarBattle['phase']|'preparation';
const PHASES:readonly {id:Phase;label:string;hint:string}[]=[
 {id:'preparation',label:'Preparação',hint:'Escolha tropas, comandantes e condições. Confira o mapa antes de iniciar.'},
 {id:'siege',label:'Cerco',hint:'Verifique engenheiros, recarga e alvos. Resolva o disparo ou prossiga.'},
 {id:'heroes-first',label:'Heróis I',hint:'Resolva as primeiras ações pessoais e a iniciativa dos heróis.'},
 {id:'orders',label:'Ordens',hint:'Selecione comandante e unidade; escolha uma ordem legal; teste Guerra contra Disciplina.'},
 {id:'heroes-second',label:'Heróis II',hint:'Resolva as segundas ações pessoais antes de avançar a rodada.'},
 {id:'finished',label:'Pós-batalha',hint:'Confira sobreviventes e projeções sem alterar as fichas oficiais.'},
] as const;
const stepIndex=(phase:Phase)=>PHASES.findIndex(x=>x.id===phase);

/** Guia visual, sem alterar o motor/resultado do livro nem pular fases. */
export function BattleGotGuide({phase,onQuickPreset,hasSiege=true,hasHeroes=true}:{
 phase:Phase;onQuickPreset?:()=>void;
 hasSiege?:boolean;hasHeroes?:boolean;
}){
 const current=PHASES.find(x=>x.id===phase)??PHASES[0]!;
 const jump=(id:string)=>document.getElementById(id)?.scrollIntoView({
  behavior:'smooth',block:'start',
 });
 return <nav className="got-phase-guide" aria-label="Guia de fases Game of Thrones">
  <div className="got-phase-guide-intro">
   <strong>{current.label}</strong>
   <p>{current.hint}</p>
  </div>
  <ol className="got-phase-steps">
   {PHASES.map((step,i)=>{
    const noActions=(step.id==='siege'&&!hasSiege)||
     ((step.id==='heroes-first'||step.id==='heroes-second')&&!hasHeroes);
    return <li key={step.id}
     className={[step.id===phase?'is-current':stepIndex(phase)>i?'is-complete':'',
      noActions?'is-without-actions':''].filter(Boolean).join(' ')}
     aria-current={step.id===phase?'step':undefined}>
     <span aria-hidden="true">{i+1}</span>{step.label}
     {noActions&&<small>sem ações</small>}
    </li>;
   })}
  </ol>
  {phase==='preparation'&&<div className="got-phase-guide-links" role="group"
   aria-label="Navegação da preparação">
   <Button size="sm" variant="outline" onClick={()=>jump('got-prep-forces')}>1 · Tropas</Button>
   <Button size="sm" variant="outline" onClick={()=>jump('got-prep-conditions')}>2 · Condições</Button>
   <Button size="sm" variant="outline" onClick={()=>jump('got-prep-map')}>3 · Mapa</Button>
   {onQuickPreset&&<Button size="sm" variant="outline" onClick={onQuickPreset}>
    Aplicar cenário rápido</Button>}
  </div>}
  {phase==='orders'&&<div className="got-phase-guide-links">
   <Button size="sm" variant="outline" onClick={()=>jump('got-battle-orders')}>
    Ver ordens</Button>
  </div>}
  <details className="got-phase-rules">
   <summary>Sobre as fases</summary>
   <p className="got-phase-note">A sequência permanece regida pelo livro. Fases sem ações
    ainda são resolvidas pelo motor; o Narrador não as salta manualmente.</p>
  </details>
 </nav>;
}
