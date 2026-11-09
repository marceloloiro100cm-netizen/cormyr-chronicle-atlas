import {Button} from '@/components/ui/button';
import type {WarBattle} from '@/lib/battle/got/types';
import './battle-p0-p1.css';

type Phase=WarBattle['phase'];
type Decision=Readonly<{title:string;hint:string;button:string;target:string}>;

/** Camada de UX: preserva as fases e não executa, calcula ou ignora ordens. */
export function gotNextDecision(phase:Phase,hasSiege:boolean,hasHeroes:boolean):Decision{
 if(phase==='siege')return {
  title:'Cerco',hint:hasSiege?'Resolva os disparos ou avance sem disparar.':'Sem armas de cerco. Prossiga pela etapa do livro.',
  button:'Resolver cerco',target:'got-battle-orders'};
 if(phase==='heroes-first'||phase==='heroes-second')return {
  title:phase==='heroes-first'?'Heróis · primeira fase':'Heróis · segunda fase',
  hint:hasHeroes?'Resolva as ações pessoais e conclua esta fase.':'Sem heróis ativos. Conclua a fase para prosseguir.',
  button:'Resolver heróis',target:'got-personal-actions'};
 if(phase==='orders')return {
  title:'Ordens',hint:'Selecione a tropa, escolha uma ordem legal e confirme o teste de Guerra.',
  button:'Dar ordem',target:'got-battle-orders'};
 return {title:'Pós-batalha',hint:'Consulte baixas e consequências simuladas, sem alterar as Casas.',
  button:'Ver resultado',target:'got-after-action'};
}

export function BattleGotPhaseDock({phase,hasSiege,hasHeroes}:{
 phase:Phase;hasSiege:boolean;hasHeroes:boolean;
}){
 const next=gotNextDecision(phase,hasSiege,hasHeroes);
 const focusDecision=()=>{
  const target=document.getElementById(next.target);
  if(!target)return;
  const details=target.closest('details');
  if(details)details.open=true;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
  const control=target.querySelector<HTMLElement>(
   'button:not([disabled]),select:not([disabled]),input:not([disabled])');
  control?.focus({preventScroll:true});
 };
 return <section className="battle-got-phase-dock" aria-label="Próxima decisão"
  role="region" aria-live="polite">
  <div><strong>Agora · {next.title}</strong><p>{next.hint}</p></div>
  <Button type="button" onClick={focusDecision}>{next.button}</Button>
 </section>;
}
