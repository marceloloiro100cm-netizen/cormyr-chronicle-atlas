import type {ReactNode} from 'react';
import type {BattleEvent,BattleStack} from '@/lib/battle/domain/types';
import type {CrzBattleStack,CrzEvent} from '@/lib/crusade/battle-state';
import './battle-ux-feedback.css';

export type BattleOutcomeSide=Readonly<{label:string;remaining:number;losses:number;damage?:number}>;

export function BattleOutcomeSummary({winner,round,attacker,defender,unit='combatentes',note}:{
 winner:string;round:number;attacker:BattleOutcomeSide;defender:BattleOutcomeSide;
 unit?:string;note?:ReactNode;
}){
 return <section className="battle-outcome-summary" aria-label="Resumo do resultado">
  <div className="battle-outcome-heading">
   <strong>{winner}</strong><span>Rodada {round}</span>
  </div>
  <div className="battle-outcome-sides">
   {[attacker,defender].map((side,i)=><div key={i} className="battle-outcome-side">
    <strong>{side.label}</strong>
    <span>{side.remaining} {unit} restantes</span>
    <small>{side.losses} perdas{side.damage!==undefined?' · '+side.damage+' dano':''}</small>
   </div>)}
  </div>
  {note&&<p className="battle-outcome-note">{note}</p>}
 </section>;
}

/** Somente apresentação: nunca altera a decisão ou o replay do motor. */
export function BattleActionPulse({summary,detail}:{
 summary?:string|null;detail?:string|null;
}){
 if(!summary)return null;
 const short=summary.length>110?summary.slice(0,107)+'…':summary;
 return <section className="battle-action-pulse" aria-label="Última jogada"
  aria-live="polite" aria-atomic="true">
  <strong>Última jogada</strong><span>{short}</span>
  {detail&&detail!==short&&<details>
   <summary>Ver detalhes</summary><p>{detail}</p>
  </details>}
 </section>;
}
const safeNumber=(value:unknown):number=>
 typeof value==='number'&&Number.isFinite(value)?value:0;
export function pteActionText(event:BattleEvent|undefined,
 units:readonly Pick<BattleStack,'id'|'name'>[]):string|null{
 if(!event)return null;
 const actor=units.find(u=>u.id===event.actorId)?.name??'Unidade';
 if(event.type==='DAMAGE'||event.type==='RETALIATION')
  return (event.type==='RETALIATION'?'Retaliação':'Ataque')+' · '+
   actor+' · '+safeNumber(event.delta['damage'])+' PV · '+
   safeNumber(event.delta['casualties'])+' baixas';
 if(event.type==='MOVE')return actor+' avançou';
 if(event.type==='DEFEND')return actor+' defendeu';
 if(event.type==='WAIT')return actor+' esperou';
 return null;
}
export function crzActionText(event:CrzEvent|undefined,
 units:readonly Pick<CrzBattleStack,'id'|'name'>[]):string|null{
 if(!event)return null;
 const actor='unitId' in event?
  units.find(u=>u.id===event.unitId)?.name??'Unidade':'';
 if(event.type==='ATTACK_RESOLVED'||event.type==='RETALIATION_RESOLVED')
  return (event.type==='RETALIATION_RESOLVED'?'Retaliação':'Ataque')+' · '+
   actor+' · '+event.hits+'/'+event.attacks+' acertos · '+
   event.appliedDamage+' PV · '+event.casualties+' baixas';
 if(event.type==='MOVED')return actor+' avançou';
 if(event.type==='DEFENDED')return actor+' defendeu';
 if(event.type==='WAITED')return actor+' esperou';
 if(event.type==='STACK_DESTROYED')return actor+' foi derrotada';
 return null;
}
