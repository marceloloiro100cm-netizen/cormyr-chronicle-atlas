import type {BattleRulesetMode} from '@/lib/battle/ruleset-modes';
import {BATTLE_RULESET_OPTIONS,battleRulesetOption} from '@/lib/battle/ruleset-modes';

/** Escolha declarativa de regras; nenhum motor, replay ou ficha é convertido ao selecionar. */
export function BattleRulesetSelector({value,onChange}:{
 value:BattleRulesetMode;onChange:(value:BattleRulesetMode)=>void;
}){
 const selected=battleRulesetOption(value);
 return <fieldset className="battle-ruleset-selector" aria-label="Sistema de regras da batalha">
  <legend>Sistema de combate</legend>
  <div className="battle-ruleset-grid">
   {BATTLE_RULESET_OPTIONS.map(option=><label key={option.id}
    className={'battle-ruleset-card'+(value===option.id?' is-selected':'')}>
    <span className="battle-ruleset-head">
     <input type="radio" name="battle-ruleset" value={option.id}
      checked={value===option.id} onChange={()=>onChange(option.id)}/>
     <strong>{option.label}</strong>
    </span>
    <span className="battle-ruleset-subtitle">{option.shortName}</span>
    <span className="battle-ruleset-description">{option.id==='got'?'Ordens e Disciplina':
     option.id==='dnd'?'D20, CA e PV':'Movimento e comandantes'}</span>
    <span className="battle-ruleset-status">
     {option.status==='available'?'Disponível':option.status==='partial'?
      'Em teste':'Em desenvolvimento'}
    </span>
   </label>)}
  </div>
  <p role="status" aria-live="polite" className="battle-note">
   {selected.label} selecionado · regras independentes.
  </p>
 </fieldset>;
}
