import type {V39Objectives} from '@/lib/battle/v3/objectives-v39';

export function BattleV39ObjectivesPanel({objectives}:{objectives:V39Objectives}){
 const count=(side:'attacker'|'defender')=>
  objectives.points.filter(point=>point.holder===side).length;
 return <section className="crusade-v39-panel" aria-label="Objetivos de controle V3.9">
  <div className="crusade-v39-panel-header">
   <h3>Marcos da campanha</h3>
   <span>VARIANTE EXPERIMENTAL · V3.9</span>
  </div>
  <p>Ocupe <strong>dois dos três pontos</strong> no fim de
   <strong> duas rodadas consecutivas</strong> para vencer.
   Eliminação e debandada continuam válidas.</p>
  <ol className="crusade-v39-points">
   {objectives.points.map(point=><li key={point.id}>
    <span className="crusade-v39-point-icon" aria-hidden="true">
     {point.id==='bridge'?'⚑':point.id==='highground'?'▲':'▣'}
    </span>
    <div><strong>{point.label}</strong><small>Hex {point.position.q}, {point.position.r}</small></div>
    <span className={'crusade-v39-point-owner '+(point.holder??'neutral')}>
     {point.holder==='attacker'?'Aliados':
      point.holder==='defender'?'Adversário':'Livre'}</span>
   </li>)}
  </ol>
  <div className="crusade-v39-score" role="status">
   <span>Aliados: <strong>{count('attacker')}/3</strong> ·
    sequência {objectives.streaks.attacker}/{objectives.holdRounds}</span>
   <span>Adversário: <strong>{count('defender')}/3</strong> ·
    sequência {objectives.streaks.defender}/{objectives.holdRounds}</span>
  </div>
  <small>A contagem é feita no encerramento de cada rodada.
   A passagem é um marco visual, não um novo terreno de água ou ponte.
   Nenhuma posse, recurso ou baixa oficial é afetada.</small>
 </section>;
}
