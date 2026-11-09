import {Button} from '@/components/ui/button';
import './battle-turn-cue.css';

type System='got'|'adapted'|'dnd';
type Props={
 system:System;round:number;phase:string;activeUnit?:string|undefined;
 canAct?:boolean;moves?:number;attacks?:number;needsSelection?:boolean;
 onSelectActive?:(()=>void)|undefined;hint?:string|undefined;
};
/** Orientação comum: a lógica de legalidade permanece em cada motor. */
export function BattleTurnCue({system,round,phase,activeUnit,canAct=false,
 moves=0,attacks=0,needsSelection=false,onSelectActive,hint}:Props){
 const name=system==='got'?'Game of Thrones':system==='dnd'?'D&D':'Adaptado';
 const status=phase==='completed'||phase==='finished'?'Concluída':
  phase==='active'||phase==='orders'?'Em combate':phase.replaceAll('-',' ');
 const guidance=hint??(status==='Concluída'?
  'Batalha encerrada. Confira o resultado e o histórico antes de sair.':
  !canAct?'Aguarde a iniciativa ou avance o turno da IA.':
  needsSelection?'Selecione a unidade ativa para destacar deslocamentos e alvos legais.':
  'Quadrados verdes são movimentos válidos; inimigos destacados são alvos legais.');
 return <section className="battle-turn-cue" aria-label={'Orientação do turno · '+name}>
  <div className="battle-turn-cue-header">
   <strong>{name} · Rodada {round}</strong>
   <span>{status}{activeUnit?' · '+activeUnit:''}</span>
  </div>
  <div className="battle-turn-cue-body">
   <p>{guidance}</p>
   {system!=='got'&&canAct&&
    <span className="battle-turn-cue-count">{moves} destinos · {attacks} ataques possíveis</span>}
   {needsSelection&&onSelectActive&&<Button size="sm" variant="outline"
    onClick={onSelectActive}>Selecionar unidade ativa</Button>}
  </div>
 </section>;
}
