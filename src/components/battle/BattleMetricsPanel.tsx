import type {BattleState} from '@/lib/battle/domain/types';
import {battleTacticalMetrics,formatSessionDuration} from '@/lib/battle/domain/metrics';
import './battle-p3.css';

/** Sem telemetria externa. O tempo representa somente a aba/sessão atual. */
export function BattleMetricsPanel({state,elapsedSeconds=0}:{
 state:BattleState;elapsedSeconds?:number;
}){
 const m=battleTacticalMetrics(state);
 return <details className="battle-metrics-panel">
  <summary>Indicadores de combate</summary>
  <div className="battle-metrics-content">
   <p><strong>Forças:</strong> {m.balance==='próximo'?'potência inicial semelhante':
    m.balance==='vantagem atacante'?'vantagem inicial atacante':'vantagem inicial defensora'}
    {' · '}índice relativo {m.pressureRatio.toLocaleString('pt-BR')}</p>
   <p><strong>Duração:</strong> rodada {m.rounds} · {m.commands} ações
    {' · '}{formatSessionDuration(elapsedSeconds)} nesta sessão</p>
   <p><strong>Ações:</strong> {m.movements} movimentos · {m.attacks} ataques</p>
   <p><strong>Baixas:</strong> {m.casualties.attacker} atacantes ·
    {' '}{m.casualties.defender} defensores</p>
   <p className="battle-note">Índice de potência é apenas descritivo: não estima
    chances de vitória. O relógio reinicia após recarregar ou retomar em outro aparelho.
    Nada é enviado para telemetria externa.</p>
  </div>
 </details>;
}
